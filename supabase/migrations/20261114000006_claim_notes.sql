-- Shopping-list helpers for the claimer: a "Got it" tick and a private note.
--
-- Both are the claimer's own memory aids. They live in their own table, not
-- on `claims`, because claims are readable by every family member except the
-- recipient; these rows are readable by the claimer ONLY. The recipient never
-- sees them (SPEC §5.2), and neither does anyone else.
--
-- One row per claim, created on first use. Deleting the claim (unclaim,
-- dismiss, member removed, account deleted) deletes the row with it.

create table public.claim_notes (
  gift_id    uuid primary key references public.claims (gift_id) on delete cascade,
  claimer_id uuid not null references public.profiles (id) on delete cascade,
  purchased  boolean not null default false,
  note       text
             check (note is null or (char_length(note) between 1 and 500 and note = btrim(note))),
  updated_at timestamptz not null default now()
);

alter table public.claim_notes enable row level security;

revoke all on public.claim_notes from anon, authenticated;
grant select on public.claim_notes to authenticated;

create policy claim_notes_select on public.claim_notes
  for select to authenticated
  using (claimer_id = (select auth.uid()));

-- The caller's own claim on `p_gift_id`, or `not_found`. Locks the claim so a
-- concurrent unclaim can't leave an orphan.
create function private.require_my_claim(p_gift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.claims c
   where c.gift_id = p_gift_id and c.claimer_id = auth.uid()
   for update;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

revoke execute on function private.require_my_claim(uuid) from public, anon, authenticated;

create function public.set_purchased(p_gift_id uuid, p_purchased boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  perform private.require_my_claim(p_gift_id);
  insert into public.claim_notes (gift_id, claimer_id, purchased)
  values (p_gift_id, v_uid, coalesce(p_purchased, false))
  on conflict (gift_id)
    do update set purchased = excluded.purchased, updated_at = now();
end;
$$;

-- Empty / whitespace-only note clears it.
create function public.set_claim_note(p_gift_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_note text := private.clean(p_note);
begin
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_notes';
  end if;
  perform private.require_my_claim(p_gift_id);
  insert into public.claim_notes (gift_id, claimer_id, note)
  values (p_gift_id, v_uid, v_note)
  on conflict (gift_id)
    do update set note = excluded.note, updated_at = now();
end;
$$;

revoke execute on function
  public.set_purchased(uuid, boolean),
  public.set_claim_note(uuid, text)
from public, anon;

grant execute on function
  public.set_purchased(uuid, boolean),
  public.set_claim_note(uuid, text)
to authenticated;
