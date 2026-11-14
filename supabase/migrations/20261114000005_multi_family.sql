-- Several families per person.
--
-- Each family keeps its own lists, secret ideas and claims (a gift belongs to
-- exactly one family, as before). The site remembers which family you are
-- looking at; that is only a preference. Every function below takes the
-- family explicitly and re-checks that the caller is an active member (or the
-- owner) of it, so a wrong or forged family id gets `not_found`/`forbidden`.
--
-- RLS policies are unchanged: they were already written per family
-- (is_member(family_id)), not per "the" family.

drop index public.family_members_one_active_family;

-- "The caller's family" no longer means anything.
drop function private.require_owner();
drop function private.my_family();

-- The caller must be the active owner of `fid`.
create function private.require_owner(fid uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if fid is null or not exists (
    select 1 from public.family_members m
    where m.family_id = fid and m.user_id = auth.uid()
      and m.role = 'owner' and m.removed_at is null
  ) then
    raise exception 'forbidden';
  end if;
  return fid;
end;
$$;

revoke execute on function private.require_owner(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Families
-- ---------------------------------------------------------------------------

create or replace function public.create_family(p_name text)
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

  insert into public.families (name, invite_code, owner_id)
  values (v_name, private.gen_invite_code(), v_uid)
  returning id into v_fid;

  insert into public.family_members (family_id, user_id, role)
  values (v_fid, v_uid, 'owner');

  return v_fid;
end;
$$;

create or replace function public.join_family(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_code text := upper(coalesce(private.clean(p_code), ''));
  v_fid uuid;
begin
  select f.id into v_fid from public.families f where f.invite_code = v_code;
  if v_fid is null then
    raise exception 'invalid_code';
  end if;
  if private.is_member(v_fid) then
    return v_fid;                       -- already a member: no-op
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (v_fid, v_uid, 'member')
  on conflict (family_id, user_id)
    do update set removed_at = null, role = 'member', joined_at = now();

  return v_fid;
end;
$$;

drop function public.get_invite_code();
create function public.get_invite_code(p_family_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fid uuid := private.require_owner(p_family_id);
begin
  return (select f.invite_code from public.families f where f.id = v_fid);
end;
$$;

drop function public.regenerate_invite_code();
create function public.regenerate_invite_code(p_family_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fid uuid := private.require_owner(p_family_id);
  v_code text := private.gen_invite_code();
begin
  update public.families f set invite_code = v_code where f.id = v_fid;
  return v_code;
end;
$$;

-- SPEC §4.2.4, now for one family: the member's claims and gifts in *this*
-- family are released/hidden; their other families are untouched.
drop function public.remove_member(uuid);
create function public.remove_member(p_family_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_fid uuid := private.require_owner(p_family_id);
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
-- Gifts: adding needs to know which family's list it goes on.
-- (update/delete/claim/unclaim already work from the gift's own family.)
-- ---------------------------------------------------------------------------

drop function public.add_gift(uuid, text, text, text);
create function public.add_gift(
  p_family_id uuid, p_recipient_id uuid, p_title text, p_url text default null, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v record;
  v_id uuid;
begin
  if p_family_id is null or not private.is_member(p_family_id) then
    raise exception 'not_found';
  end if;
  if not exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id and m.user_id = p_recipient_id and m.removed_at is null
  ) then
    raise exception 'not_found';
  end if;

  select * into v from private.validate_gift(p_title, p_url, p_notes);

  insert into public.gifts (family_id, recipient_id, created_by, title, url, notes)
  values (p_family_id, p_recipient_id, v_uid, v.title, v.url, v.notes)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges for the new signatures.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.get_invite_code(uuid),
  public.regenerate_invite_code(uuid),
  public.remove_member(uuid, uuid),
  public.add_gift(uuid, uuid, text, text, text)
from public, anon;

grant execute on function
  public.get_invite_code(uuid),
  public.regenerate_invite_code(uuid),
  public.remove_member(uuid, uuid),
  public.add_gift(uuid, uuid, text, text, text)
to authenticated;
