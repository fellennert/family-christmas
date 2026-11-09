-- All writes. Every function here is SECURITY DEFINER, reads the caller from
-- auth.uid(), and re-checks every permission itself (RLS does not apply to the
-- definer). Errors are short codes the UI maps to friendly text:
--
--   not_authenticated, not_found, forbidden, invalid_input, invalid_name,
--   invalid_title, invalid_url, invalid_notes, invalid_code,
--   already_in_family, not_in_family, cannot_remove_self
--
-- Privacy rule for errors (SPEC §5.2): no function may answer a recipient
-- differently depending on whether their gift is claimed. Where that could
-- happen, the function returns the same thing in both cases or says
-- `not_found`, exactly as for a gift that does not exist.

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable over the API)
-- ---------------------------------------------------------------------------

create function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  return v_uid;
end;
$$;

-- The caller's active family (v1: at most one), or null.
create function private.my_family()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.family_id
  from public.family_members m
  where m.user_id = auth.uid() and m.removed_at is null
  limit 1;
$$;

-- Trim all leading/trailing whitespace; empty becomes null.
create function private.clean(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(t, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
$$;

create function private.validate_gift(
  p_title text, p_url text, p_notes text,
  out title text, out url text, out notes text
)
language plpgsql
immutable
set search_path = ''
as $$
begin
  title := private.clean(p_title);
  if title is null or char_length(title) > 200 then
    raise exception 'invalid_title';
  end if;

  url := private.clean(p_url);
  if url is not null and (
       char_length(url) > 2000
       or url !~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
     ) then
    raise exception 'invalid_url';
  end if;

  notes := private.clean(p_notes);
  if notes is not null and char_length(notes) > 1000 then
    raise exception 'invalid_notes';
  end if;
end;
$$;

-- 8 characters from a 32-symbol alphabet without 0/O/1/I. 32 divides 256, so
-- `byte % 32` is unbiased.
create function private.gen_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  code text;
begin
  loop
    b := extensions.gen_random_bytes(8);
    code := '';
    for i in 0..7 loop
      code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.families f where f.invite_code = code);
  end loop;
  return code;
end;
$$;

create function private.require_owner()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fid uuid := private.my_family();
begin
  if v_fid is null or not exists (
    select 1 from public.family_members m
    where m.family_id = v_fid and m.user_id = auth.uid()
      and m.role = 'owner' and m.removed_at is null
  ) then
    raise exception 'forbidden';
  end if;
  return v_fid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

create function public.update_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_name text := private.clean(p_name);
begin
  if v_name is null or char_length(v_name) > 50 then
    raise exception 'invalid_name';
  end if;
  update public.profiles set display_name = v_name where id = v_uid;
end;
$$;

-- Deletes the caller's account and data (needed for any future App Store
-- build; useful anyway). Gifts for or by the user that someone else claimed
-- are kept as soft-deleted so the claimer is told; everything else is removed.
-- Ownership passes to the longest-standing member; an empty family is deleted.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  r record;
  v_next uuid;
begin
  for r in
    select m.family_id from public.family_members m
    where m.user_id = v_uid and m.role = 'owner'
  loop
    select m.user_id into v_next
    from public.family_members m
    where m.family_id = r.family_id and m.user_id <> v_uid and m.removed_at is null
    order by m.joined_at, m.user_id
    limit 1;

    if v_next is null then
      delete from public.families f where f.id = r.family_id;
    else
      update public.family_members m set role = 'owner'
        where m.family_id = r.family_id and m.user_id = v_next;
      update public.families f set owner_id = v_next where f.id = r.family_id;
    end if;
  end loop;

  update public.gifts g
     set removed_at = coalesce(g.removed_at, now()),
         removed_by = case when g.removed_at is null then v_uid else g.removed_by end
   where (g.recipient_id = v_uid or g.created_by = v_uid)
     and exists (select 1 from public.claims c
                 where c.gift_id = g.id and c.claimer_id <> v_uid);

  delete from public.gifts g
   where (g.recipient_id = v_uid or g.created_by = v_uid)
     and not exists (select 1 from public.claims c
                     where c.gift_id = g.id and c.claimer_id <> v_uid);

  -- Cascades to profile, memberships and the user's own claims; sets
  -- recipient_id / created_by / removed_by to null on the kept gifts.
  delete from auth.users u where u.id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Families
-- ---------------------------------------------------------------------------

create function public.create_family(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_name text := private.clean(p_name);
  v_fid uuid;
begin
  if v_name is null or char_length(v_name) > 60 then
    raise exception 'invalid_name';
  end if;
  if private.my_family() is not null then
    raise exception 'already_in_family';
  end if;

  insert into public.families (name, invite_code, owner_id)
  values (v_name, private.gen_invite_code(), v_uid)
  returning id into v_fid;

  insert into public.family_members (family_id, user_id, role)
  values (v_fid, v_uid, 'owner');

  return v_fid;
end;
$$;

create function public.join_family(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text := upper(coalesce(private.clean(p_code), ''));
  v_fid uuid;
  v_current uuid := private.my_family();
begin
  select f.id into v_fid from public.families f where f.invite_code = v_code;
  if v_fid is null then
    raise exception 'invalid_code';
  end if;
  if v_current = v_fid then
    return v_fid;                       -- already a member: no-op
  end if;
  if v_current is not null then
    raise exception 'already_in_family';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (v_fid, v_uid, 'member')
  on conflict (family_id, user_id)
    do update set removed_at = null, role = 'member', joined_at = now();

  return v_fid;
end;
$$;

create function public.get_invite_code()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fid uuid := private.require_owner();
begin
  return (select f.invite_code from public.families f where f.id = v_fid);
end;
$$;

create function public.regenerate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fid uuid := private.require_owner();
  v_code text := private.gen_invite_code();
begin
  update public.families f set invite_code = v_code where f.id = v_fid;
  return v_code;
end;
$$;

-- SPEC §4.2.4: deletes the member's claims and soft-deletes gifts they created
-- or that were for them (claimers of gifts for them see "removed").
create function public.remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_fid uuid := private.require_owner();
begin
  if p_user_id = v_uid then
    raise exception 'cannot_remove_self';
  end if;

  update public.family_members m
     set removed_at = now()
   where m.family_id = v_fid and m.user_id = p_user_id and m.removed_at is null;
  if not found then
    raise exception 'not_found';
  end if;

  delete from public.claims c
   using public.gifts g
   where c.gift_id = g.id and g.family_id = v_fid and c.claimer_id = p_user_id;

  update public.gifts g
     set removed_at = now(), removed_by = p_user_id
   where g.family_id = v_fid
     and g.removed_at is null
     and (g.created_by = p_user_id or g.recipient_id = p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Gifts
-- ---------------------------------------------------------------------------

-- Self-added when p_recipient_id is the caller, otherwise a secret idea.
create function public.add_gift(
  p_recipient_id uuid, p_title text, p_url text default null, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_fid uuid := private.my_family();
  v record;
  v_id uuid;
begin
  if v_fid is null then
    raise exception 'not_in_family';
  end if;
  if not exists (
    select 1 from public.family_members m
    where m.family_id = v_fid and m.user_id = p_recipient_id and m.removed_at is null
  ) then
    raise exception 'not_found';
  end if;

  select * into v from private.validate_gift(p_title, p_url, p_notes);

  insert into public.gifts (family_id, recipient_id, created_by, title, url, notes)
  values (v_fid, p_recipient_id, v_uid, v.title, v.url, v.notes)
  returning id into v_id;

  return v_id;
end;
$$;

-- Creator only. If someone else claimed the gift, their claim is flagged
-- "edited after you claimed it". The caller gets the same result either way.
create function public.update_gift(
  p_gift_id uuid, p_title text, p_url text default null, p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  g public.gifts;
  v record;
begin
  select * into g from public.gifts
   where id = p_gift_id
     and created_by = v_uid
     and removed_at is null
     and private.is_member(family_id)
   for update;
  if not found then
    raise exception 'not_found';
  end if;

  select * into v from private.validate_gift(p_title, p_url, p_notes);

  if (g.title, g.url, g.notes) is distinct from (v.title, v.url, v.notes) then
    update public.gifts
       set title = v.title, url = v.url, notes = v.notes, updated_at = now()
     where id = p_gift_id;

    update public.claims
       set gift_edited_after_claim = true
     where gift_id = p_gift_id and claimer_id <> v_uid;
  end if;
end;
$$;

-- Creator only (SPEC §5.3). Claimed by someone else -> soft-delete so the
-- claimer is alerted; otherwise hard-delete. Returns nothing in both cases.
create function public.delete_gift(p_gift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform 1 from public.gifts
   where id = p_gift_id
     and created_by = v_uid
     and removed_at is null
     and private.is_member(family_id)
   for update;
  if not found then
    raise exception 'not_found';
  end if;

  if exists (select 1 from public.claims c
             where c.gift_id = p_gift_id and c.claimer_id <> v_uid) then
    update public.gifts
       set removed_at = now(), removed_by = v_uid
     where id = p_gift_id;
  else
    delete from public.gifts where id = p_gift_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------

-- Returns 'claimed', 'already_claimed' (someone else got there first) or
-- 'already_yours'. A recipient asking about their own gift gets `not_found`,
-- the same as for a gift that doesn't exist, never anything claim-related.
create function public.claim_gift(p_gift_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_claimer uuid;
begin
  -- FOR SHARE: concurrent claims proceed to the unique index; a concurrent
  -- delete_gift (FOR UPDATE) is serialized against us.
  perform 1 from public.gifts
   where id = p_gift_id
     and recipient_id is not null
     and recipient_id <> v_uid
     and removed_at is null
     and private.is_member(family_id)
   for share;
  if not found then
    raise exception 'not_found';
  end if;

  insert into public.claims (gift_id, claimer_id)
  values (p_gift_id, v_uid)
  on conflict (gift_id) do nothing;
  if found then
    return 'claimed';
  end if;

  select c.claimer_id into v_claimer from public.claims c where c.gift_id = p_gift_id;
  return case when v_claimer = v_uid then 'already_yours' else 'already_claimed' end;
end;
$$;

-- Removes the caller's own claim. If the gift was already removed from the
-- list, this is the "dismiss" action and the gift is hard-deleted too (with
-- one claim per gift, nobody else needs it).
create function public.unclaim_gift(p_gift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform 1 from public.gifts where id = p_gift_id for update;

  delete from public.claims c
   where c.gift_id = p_gift_id and c.claimer_id = v_uid;
  if not found then
    raise exception 'not_found';
  end if;

  delete from public.gifts g
   where g.id = p_gift_id and g.removed_at is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges: signed-in users only; helpers not callable at all.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;

grant execute on function
  public.update_display_name(text),
  public.delete_account(),
  public.create_family(text),
  public.join_family(text),
  public.get_invite_code(),
  public.regenerate_invite_code(),
  public.remove_member(uuid),
  public.add_gift(uuid, text, text, text),
  public.update_gift(uuid, text, text, text),
  public.delete_gift(uuid),
  public.claim_gift(uuid),
  public.unclaim_gift(uuid)
to authenticated;

revoke execute on function
  private.require_uid(),
  private.my_family(),
  private.clean(text),
  private.validate_gift(text, text, text),
  private.gen_invite_code(),
  private.require_owner(),
  private.handle_new_user()
from public, anon, authenticated;
