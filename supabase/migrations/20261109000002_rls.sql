-- Row Level Security: SPEC §5.1, §5.2, §5.4 ("different families see nothing").
--
-- Every table has RLS enabled and exactly one policy: SELECT for
-- `authenticated`. With no INSERT/UPDATE/DELETE policies (and no grants),
-- direct writes are impossible; writes go through the functions migration.

-- ---------------------------------------------------------------------------
-- Helper predicates. SECURITY DEFINER so policies don't recurse into each
-- other's RLS. All read auth.uid() themselves; none take a user id to "act as".
-- ---------------------------------------------------------------------------

-- Is the current user an active member of family `fid`?
create function private.is_member(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members m
    where m.family_id = fid
      and m.user_id = auth.uid()
      and m.removed_at is null
  );
$$;

-- Is `uid` (active or removed) in a family where the current user is active?
-- Removed members' names stay visible so claimers can still read
-- "Removed from list by <name>".
create function private.shares_family(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members me
    join public.family_members them on them.family_id = me.family_id
    where me.user_id = auth.uid()
      and me.removed_at is null
      and them.user_id = uid
  );
$$;

-- SPEC §5.2: claims on a gift are visible only to active family members who
-- are not the gift's recipient.
create function private.can_see_claims(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.gifts g
    where g.id = gid
      and g.recipient_id is distinct from auth.uid()
      and private.is_member(g.family_id)
  );
$$;

grant execute on function private.is_member(uuid),
                          private.shares_family(uuid),
                          private.can_see_claims(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.families       enable row level security;
alter table public.family_members enable row level security;
alter table public.gifts          enable row level security;
alter table public.claims         enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_family(id));

create policy families_select on public.families
  for select to authenticated
  using (private.is_member(id));

create policy family_members_select on public.family_members
  for select to authenticated
  using (private.is_member(family_id));

-- SPEC §5.1. U sees G only if U is in G's family and either
--   U is not the recipient (sees everything, incl. secret ideas and removed), or
--   U is the recipient, created it, and it is not soft-deleted.
create policy gifts_select on public.gifts
  for select to authenticated
  using (
    private.is_member(family_id)
    and (
      recipient_id is distinct from (select auth.uid())
      or (
        recipient_id = (select auth.uid())
        and created_by = (select auth.uid())
        and removed_at is null
      )
    )
  );

create policy claims_select on public.claims
  for select to authenticated
  using (private.can_see_claims(gift_id));
