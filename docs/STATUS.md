# Status: what's done, what's verified, what still needs a first run

_Last updated: 14 November 2026._

Everything in SPEC §12 is written, and the whole test suite has now been run on a real computer against the full local Supabase stack.

## 📌 Open to-dos for you

1. After pushing the multi-family change, run `npx supabase db push --remote` so the live database gets migration `20261114000005_multi_family.sql`. Until then, adding gifts and the owner actions fail on the live site.
2. Supabase dashboard: paste the two email templates and set the minimum password length to 8 (README §6 step E).
3. Try it on a phone: sign up, start a family, test "Forgot your password?".

## ✅ Verified (14 November 2026, on a Mac)

| Suite | Result |
|---|---|
| Unit tests (`npm run test:unit`) | **48 pass** |
| Database privacy rules and functions (`npm run test:db`) | **40 pass**, including several families per person |
| Browser tests (`npm run test:e2e`), desktop + phone | **40 pass**: every signed-in page, SPEC §10 items 1–9, the family switcher |
| TypeScript (`npm run typecheck`) | passes |
| Production deploy | Vercel at <https://family-christmas-taupe.vercel.app>; cloud database has the first 4 migrations |

Notes from the first run:

- 10 browser tests failed at first; all were mistakes in the tests (ambiguous text matches, an ID pattern, comparing HTML before/after the page's scripts loaded). Fixed; no app changes were needed.
- `npm run test:db` needs `psql` (`brew install libpq`, then add `/opt/homebrew/opt/libpq/bin` to `PATH`).
- Supabase CLI v3 pushes to the **local** database unless you add `--remote`.

## Several families per person (added 14 November 2026)

- A person can be in several families. Each family has its own lists, secret ideas and claims; nothing is shared between families.
- The header's family name becomes a switcher when you're in more than one. The current family is remembered in a cookie, which is only a preference; the database checks membership on every read and write.
- Invite links work for people already in a family; they keep their old one. **Settings → Join or start another family** does the same.
- An owner removing someone affects only that family.
- Database: `supabase/migrations/20261114000005_multi_family.sql`. `add_gift`, `get_invite_code`, `regenerate_invite_code` and `remove_member` now take the family id.

## First-run checklist (on your computer)

1. Install Node 22+ and Docker Desktop; start Docker.
2. `npm install`
3. `npm run db:start`, then fill `.env.local` (README §4).
4. `npm run db:reset` (loads the demo family).
5. `npm test`: expect 48 unit + 40 database tests to pass.
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
