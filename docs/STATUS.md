# Status: what's done, what's verified, what still needs a first run

_Last updated: 9 November 2026._

Everything in SPEC §12 has been written. The work was done in a cloud session that could run the database and the login service, but **not** Supabase's data API (PostgREST): the network policy there blocked downloading it. So everything that goes through the data API has been written and type-checked but has **not yet been run**. The checklist below is for the first run on your computer.

## 📌 Open to-dos for you

1. **Switch GitHub's default branch to `master`**: repo **Settings → General → Default branch**. (It is currently `claude/ios-app-feasibility-xlqkyh`, because that was the first branch pushed. Vercel deploys the default branch.) Then delete that branch if you like; it's identical to `master`.
2. Run the first-run checklist below.
3. Deploy (README §6).

## ✅ Verified in the cloud session

| Area | How it was verified |
|---|---|
| Database schema, privacy rules (RLS), all write functions | `npm run test:db`: **39 tests pass**. They run exactly as the API runs requests (as the `authenticated` role with the user's id). |
| The privacy tests really catch mistakes | Each rule was deliberately broken in turn (recipient sees all gifts, claims visible to all, membership check bypassed, unique-claim constraint dropped); each break made 4–11 tests fail. |
| Demo data (`supabase/seed.sql`) | Loads cleanly; demo users can log in through the real Supabase Auth. |
| Unit tests | `npm run test:unit`: **48 tests pass**. |
| TypeScript and production build | `npm run typecheck` and `npm run build` succeed (Next.js 16.4). |
| Login page, wrong-password message, successful login (session cookie set, redirect) | Real browser against real Supabase Auth. |
| Password reset by email | Real browser: email arrives in the test inbox with the custom template, the link verifies via `/auth/confirm`, sets the session, redirects to "choose a new password"; reusing the link is rejected. |
| Signed-out visitors redirected to `/login?next=…` | Real browser. |
| PWA: manifest, icons, service-worker headers | Real browser + Playwright tests (`manifest…`, `service worker file…`) pass on desktop and phone profiles. |
| PWA: what gets cached | Real browser: only `/_next/static/*`, `/icons/*` and `/offline`. Logout wipe re-downloads only those. Offline navigation shows the offline page. |
| Pages render (login, sign-up, reset, join link, offline) | Real browser at iPhone size; screenshots in [`screenshots/`](screenshots). |

## ⏳ Written but not yet run (needs the full local stack: run on your computer)

These all need the data API, which couldn't be downloaded in the cloud session:

- All signed-in pages: dashboard, My list, someone's list, shopping, settings, onboarding, join flow.
- 32 of the 38 Playwright tests (`npm run test:e2e`), including SPEC §10 items 1–9 in the browser.
- The keep-alive route `/api/keep-alive` (the `ping()` function itself is tested in `test:db`).
- The GitHub Actions workflow `.github/workflows/test.yml`.

Small first-run fixes are likely (a selector in a test, a label text). The logic underneath is covered by the database tests.

## First-run checklist (on your computer)

1. Install Node 22+ and Docker Desktop; start Docker.
2. `npm install`
3. `npm run db:start`, then fill `.env.local` (README §4).
4. `npm run db:reset` (loads the demo family).
5. `npm test`: expect 48 unit + 39 database tests to pass.
6. `npm run dev` → <http://localhost:3000>, log in as `mom@demo.test` / `christmas`, click around:
   - **My list** shows 3 wishes and **no** claim info.
   - Log in as `dad@demo.test` → Mom's list shows "Claimed by Sam", "Claimed by Grandma", the secret ideas, and "You're getting this" on the spa voucher.
   - `sam@demo.test` → **Shopping** shows Dad's "Fishing hat" as removed, with **Dismiss**.
   - `elf@demo.test` sees only the North Pole family.
7. `npx playwright install chromium`, then `npm run test:e2e`.
8. If anything fails, paste the output into a new Claude Code session on this repo; the failures should be quick to fix.

## Decisions made along the way (yours to revisit)

- **Invite code** is visible to the family owner only.
- **Account deletion** is in v1 (Settings → Delete my account). Gifts someone else had claimed are kept as "removed" so the claimer is told; everything else is deleted. If the owner leaves, the longest-standing member becomes owner.
- **Removing a member** also hides gifts that were *for* them, so their claimers see "removed" instead of buying for someone who left.
- **Dismiss = unclaim** on a removed gift (it then disappears for good).
- **Removed gifts nobody claimed** don't show on lists.
- **Keep-alive** uses a daily Vercel Cron job instead of a GitHub Action, because GitHub switches off scheduled workflows after 60 days without repository activity, which is exactly the January–November stretch.
- **Email links** use Supabase's `token_hash` style (custom templates in `supabase/templates/`) so a reset requested on the iPad can be opened on a phone.
- **Text size**: the base font is 18px, buttons are at least 48px tall, and text colors meet WCAG AA contrast on the cream background.
- **Fonts**: system fonts only (Georgia for headings), so no font downloads.

## Known limitations

- iPhone home-screen apps can't receive push notifications without extra work (out of scope for v1).
- When "Confirm email" is on in production, someone who signs up via a join link and opens the confirmation email on a *different* device lands logged in on the join page there, which works fine. If they never confirm, they can't log in; that's standard Supabase behavior.
- The e2e suite creates test users in your **local** database each run; `npm run db:reset` clears them.
