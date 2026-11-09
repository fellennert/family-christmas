-- Family Christmas Gift List: core schema.
-- See SPEC.md §6 and docs/PLAN.md §2.
--
-- Privacy model in one sentence: the `authenticated` role may only SELECT
-- (filtered by RLS, see the next migration); every write goes through a
-- SECURITY DEFINER function (see the functions migration).

create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live here. PostgREST exposes only `public`, so nothing in
-- `private` can be called over the API.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
               check (char_length(display_name) between 1 and 50
                      and display_name = btrim(display_name)),
  created_at   timestamptz not null default now()
);

create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null
              check (char_length(name) between 1 and 60 and name = btrim(name)),
  -- 8 chars from an unambiguous alphabet: no 0/O/1/I.
  invite_code text not null unique
              check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  owner_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.family_members (
  family_id  uuid not null references public.families (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  -- Set when the owner removes this member. Removed members are treated as
  -- non-members by every policy.
  removed_at timestamptz,
  primary key (family_id, user_id)
);

-- v1: a user is an active member of at most one family. Dropping this index is
-- all it takes to allow several families later.
create unique index family_members_one_active_family
  on public.family_members (user_id) where removed_at is null;

create table public.gifts (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  -- Nullable only so a claimed gift can outlive a deleted account (it is then
  -- soft-deleted and shown to the claimer as removed).
  recipient_id uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  title        text not null
               check (char_length(title) between 1 and 200 and title = btrim(title)),
  url          text
               check (url is null
                      or (char_length(url) <= 2000 and url ~* '^https?://[^[:space:]]+$')),
  notes        text
               check (notes is null
                      or (char_length(notes) between 1 and 1000 and notes = btrim(notes))),
  created_at   timestamptz not null default now(),
  -- Only ever changed by the creator editing the gift. Claim activity never
  -- writes to this table, so nothing a recipient can read changes on claim.
  updated_at   timestamptz not null default now(),
  removed_at   timestamptz,
  removed_by   uuid references public.profiles (id) on delete set null
);

create index gifts_family_recipient on public.gifts (family_id, recipient_id);
create index gifts_created_by on public.gifts (created_by);

-- Claims live in their own table so a recipient's gift query can never pull
-- them in by accident (SPEC §5.5).
create table public.claims (
  id                      uuid primary key default gen_random_uuid(),
  gift_id                 uuid not null unique references public.gifts (id) on delete cascade,
  claimer_id              uuid not null references public.profiles (id) on delete cascade,
  created_at              timestamptz not null default now(),
  gift_edited_after_claim boolean not null default false
);

create index claims_claimer on public.claims (claimer_id);

-- ---------------------------------------------------------------------------
-- Profile row for every new auth user
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 50);
  v_name := btrim(v_name);
  if v_name = '' then
    v_name := 'Family member';
  end if;
  insert into public.profiles (id, display_name) values (new.id, v_name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges: read-only for signed-in users, nothing for anonymous visitors.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.families, public.family_members,
              public.gifts, public.claims
  from anon, authenticated;

grant select on public.profiles, public.family_members, public.gifts, public.claims
  to authenticated;

-- The invite code is owner-only (SPEC §4.2): members can read every families
-- column except it. Owners fetch it with get_invite_code().
grant select (id, name, owner_id, created_at) on public.families to authenticated;

grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
