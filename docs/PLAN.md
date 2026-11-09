# Implementation plan and RLS design (for review)

Status: **built**. All steps written; see [STATUS.md](STATUS.md) for what is verified and what still needs a first run.

## 1. Guiding decisions

1. **The database is the only gatekeeper.** Every rule in SPEC §5 is enforced in Postgres (RLS + `SECURITY DEFINER` functions). Next.js only renders what the user's own session is allowed to read.
2. **Read through RLS, write through functions.** The `authenticated` role gets `SELECT` only (filtered by RLS) on the tables. It gets **no** `INSERT/UPDATE/DELETE` grants. Every mutation is a Postgres function called via `supabase.rpc(...)`. Why:
   - Soft-delete vs. hard-delete, "edited after claim" flags, and claim races need multi-row logic that must not leak.
   - Error messages can be normalized. For example, a recipient probing a gift id always gets the same generic `not_found`, never a unique-violation that would reveal a claim.
   - A future native/Capacitor client reuses the exact same rules.
3. **No service-role key in the app.** It is used only by the seed script and test setup.
4. **PWA service worker caches static assets only** (SPEC §9a).

## 2. Schema notes (beyond SPEC §6)

- `gifts.title`: `check (char_length(title) between 1 and 200 and title = btrim(title))`. Same pattern for `notes` (≤ 1000). `url`: `check (url ~* '^https?://')`.
- `claims.gift_id`: `unique` and `on delete cascade`.
- `profiles` row created by a trigger on `auth.users` insert (display name taken from signup metadata).
- `family_members.removed_at` for owner removal (keeps history simple; RLS treats removed members as non-members).
- `gifts.updated_at` is touched **only** by the gift's creator editing it. Claim actions never write to `gifts`, so nothing on a recipient-visible row changes when a gift is claimed.
- Recipient's list is ordered by `created_at, id`. Neither column depends on claims.

## 3. Helper functions (`SECURITY DEFINER`, `STABLE`, `search_path` pinned)

| Function | Returns true when |
|---|---|
| `is_member(fid)` | `auth.uid()` is an active member of family `fid` |
| `shares_family(uid)` | `auth.uid()` and `uid` are active members of a common family |
| `can_see_gift(gift)` | SPEC §5.1 (below) |
| `can_see_claims(gift_id)` | viewer is an active member of the gift's family **and** is not its recipient |

They are `SECURITY DEFINER` so policies don't recurse into each other's RLS.

## 4. RLS policies (SELECT only; RLS enabled on every table)

| Table | Policy (`USING`) |
|---|---|
| `profiles` | `id = auth.uid() or shares_family(id)` |
| `families` | `is_member(id)`. `invite_code` column `SELECT` revoked from `authenticated` and exposed only via owner-only `get_invite_code()` |
| `family_members` | `is_member(family_id)` |
| `gifts` | `is_member(family_id) and ( recipient_id <> auth.uid() or (created_by = auth.uid() and removed_at is null) )` |
| `claims` | `can_see_claims(gift_id)` |

Consequences:
- A recipient querying `gifts` directly sees only their own active self-added rows. Secret ideas don't exist for them, so they aren't counted either.
- A recipient querying `claims` directly gets zero rows, whether or not claims exist.
- Users in other families match nothing in any table.

## 5. Mutation functions (all `SECURITY DEFINER`, all check `auth.uid()` first)

| Function | Behavior |
|---|---|
| `create_family(name)` | Generates an 8-char code (alphabet without 0/O/1/I), inserts the family and owner membership. Fails if the user already has a family (v1). |
| `join_family(code)` | Joins as member. Bad code → generic `invalid_code`. |
| `get_invite_code()` / `regenerate_invite_code()` | Owner only. |
| `remove_member(user_id)` | Owner only. Marks membership removed, deletes the member's claims, soft-deletes gifts they created **or that were for them** (so claimers of those see "removed"). |
| `update_display_name(name)` | Self only. Trimmed, 1–50 chars. |
| `add_gift(recipient_id, title, url, notes)` | Recipient must be an active family member. `created_by = auth.uid()`. |
| `update_gift(id, …)` | Creator only. If a claim exists, sets `claims.gift_edited_after_claim = true`. Returns the same result either way. |
| `delete_gift(id)` | Creator only. If claimed by someone other than the caller → soft-delete (`removed_at`, `removed_by`). Otherwise → hard-delete. **Returns void in both cases; same response, same code path length.** |
| `claim_gift(id)` | Caller must be able to see the gift and must not be its recipient. Gift not removed. `insert … on conflict (gift_id) do nothing`; returns `claimed` or `already_claimed`. If the caller *is* the recipient (or can't see the gift) → `not_found`, never a claim-related error. |
| `unclaim_gift(id)` | Only the claimer's own claim. If the gift was already removed from the list, this is the "dismiss" action: it also hard-deletes the gift. |
| `update_display_name(name)` | Self only. |
| `delete_account()` | Deletes the caller's auth user, profile, memberships and claims. Gifts for/by them that someone else claimed are kept soft-deleted (claimer is told); everything else is deleted. Ownership passes to the longest-standing member; a family left empty is deleted. |

`EXECUTE` is revoked from `public`/`anon` and granted to `authenticated` only.

## 6. App structure

- Next.js App Router + TypeScript + Tailwind. `@supabase/ssr` for cookie-based sessions in server components and middleware.
- Server components read via the user's session (all reads in `lib/data.ts`). Server actions (`app/actions/`) call the RPCs.
- `proxy.ts` (Next 16's name for middleware) refreshes the session and redirects signed-out visitors.
- `/me` page queries `gifts` only, with an explicit column list. No join to `claims` exists in that code path, and RLS would return nothing anyway.
- Delete confirmation on `/me` is the same static dialog for every gift (the page has no claim info to vary on).
- PWA: `app/manifest.ts`, icons in `public/`, `public/sw.js` (cache-first for `/_next/static/*`, icons, `/offline`; network-only for everything else), registration in a small client component, cache wipe on logout.

## 7. Testing

- **DB/RLS tests (Vitest, `tests/db/`):** run against the local Supabase database (`npm run db:start`, Docker). Each query runs the way PostgREST runs a request: in a transaction, as role `authenticated`, with the user's id in `request.jwt.claims`. RLS and function checks behave exactly as they do for the app. Uses `psql`, so no extra dependency. The suite was checked by deliberately breaking four rules; each break made tests fail. Covers SPEC §10 items 1, 2, 3 (identical query results before/after a claim), 5, 6 (parallel `claim_gift` calls, exactly one `claimed`), 7, 8.
- **E2E (Playwright):** same scenarios through the UI, plus item 4 (delete dialog identical, claimer sees "Removed"), and item 9 (service-worker cache isolation across logout/login, including offline mode).
- **Unit (Vitest):** URL validation/domain hint, invite-code alphabet, input trimming.

## 8. Build order

1. ✅ Migrations: schema → helpers → RLS → RPCs. Seed script.
2. ✅ RLS test suite green (39 tests). **(checkpoint with you)**
3. ✅ Auth pages, onboarding, join link.
4. ✅ `/me`, `/people/[userId]`, `/shopping`, `/family` (incl. account settings), dashboard.
5. ✅ PWA layer (manifest, icons, service worker, install help).
6. ✅ Playwright suite (38 tests), README with Vercel + Supabase deploy steps, CI workflow. ⏳ e2e not yet run (see STATUS.md).

## 9. Dependencies to approve

Listed in the spec: `next`, `react`, `typescript`, `tailwindcss`, `@supabase/supabase-js`, `vitest`, `@playwright/test`.

**Approved additions:**
- `@supabase/ssr`: Supabase's official helper for auth cookies in Next.js App Router. Practically required.
- `supabase` CLI (dev dependency): runs the local stack and applies migrations for tests and deploy.

The PWA layer adds **no** dependencies (Next.js built-in manifest + a hand-written service worker).

## 10. Decisions

1. Invite code: **owner only**.
2. Account deletion: **in v1** (`delete_account()`, plus a button in settings).
3. README covers: optional custom SMTP (Resend) for reliable password-reset email, a keep-alive so the free project never pauses, and manual backups (`supabase db dump`).
4. Keep-alive is a **daily Vercel Cron** (`vercel.json` → `/api/keep-alive` → `ping()`), not a GitHub Action: GitHub disables scheduled workflows after 60 days of repo inactivity.
5. Email links use `token_hash` templates (`supabase/templates/`) verified server-side in `/auth/confirm`, so they work across devices.
