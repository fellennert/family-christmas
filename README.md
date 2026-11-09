# 🎄 Family Christmas

A small private website where family members keep Christmas wish lists, add secret gift ideas for each other, and claim gifts so nobody buys the same thing twice.

**The golden rule:** you can never find out whether, or by whom, anything on your own list has been claimed. Everyone else can.

It works on phones and computers and can be **installed on the home screen** like an app (it's a "Progressive Web App", or PWA). There's no App Store involved.

- Product spec: [`SPEC.md`](SPEC.md)
- Design and privacy rules: [`docs/PLAN.md`](docs/PLAN.md)
- What has been tested so far, and what still needs a first run on a real computer: [`docs/STATUS.md`](docs/STATUS.md)
- Phone-size screenshots of the public pages: [`docs/screenshots/`](docs/screenshots)

---

## Contents

1. [What it does](#1-what-it-does)
2. [How the privacy works](#2-how-the-privacy-works)
3. [A tour of the code](#3-a-tour-of-the-code)
4. [Run it on your computer](#4-run-it-on-your-computer)
5. [Tests](#5-tests)
6. [Put it on the internet (Supabase + Vercel)](#6-put-it-on-the-internet-supabase--vercel)
7. [Inviting the family and installing on phones](#7-inviting-the-family-and-installing-on-phones)
8. [Looking after it](#8-looking-after-it)
9. [Environment variables](#9-environment-variables)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What it does

| Page | What you can do |
|---|---|
| **Family** (`/`) | See everyone in your family; tap a name to open their list. |
| **My list** (`/me`) | Add, edit and delete your own wishes. You never see claims or secret ideas here. |
| **Someone's list** (`/people/…`) | See their wishes and everyone's **secret ideas** for them, with "Claimed by Aunt Sue" or "Unclaimed". Claim, unclaim, add your own secret idea. |
| **Shopping** (`/shopping`) | Everything you've claimed, grouped by person, with warnings if a gift was **removed** or **edited** after you claimed it. |
| **Settings** (`/family`) | Invite link and code (owner only), member list, remove members (owner only), change your name, log out, delete your account. |
| Sign-up, log in, forgot password, join link (`/join/CODE`) | The usual. A join link takes new relatives through sign-up and straight into the family. |

Out of scope for now: several families per person, group gifts, "purchased" status, priorities, pictures, email notifications, Secret Santa (see SPEC §11).

---

## 2. How the privacy works

The privacy rules are enforced **by the database**, not by the website code. A bug in a page can't leak who claimed what, because the database never hands that information to the recipient in the first place.

- **Row Level Security (RLS)**: every table has rules saying who may read which rows. For example, "claims on a gift are readable only by family members who are *not* its recipient". If you ask the database for claims on your own gifts, you get an empty answer, the same as if there were none.
- **No direct writes**: the website can't insert, update or delete rows itself. Every change (claim, delete, edit…) goes through a small database function that checks permissions and is careful to **answer the same way** whether or not your gift is claimed. Deleting a claimed gift and deleting an unclaimed one look identical to you.
- **No master key in the website**: the site only ever talks to the database *as the logged-in person*.
- **The installable app never stores your lists** on the phone. It only stores the app's design files and an "you're offline" page, so a shared iPad can't show one person's lists to the next.

The full design is in [`docs/PLAN.md`](docs/PLAN.md). The SQL is in [`supabase/migrations/`](supabase/migrations) and is heavily commented.

---

## 3. A tour of the code

```
app/                      Pages (Next.js "App Router")
  (app)/                  Pages that need you to be logged in and in a family
    page.tsx              Family dashboard  (/)
    me/                   My list           (/me)
    people/[userId]/      Someone's list    (/people/<id>)
    shopping/             Shopping list     (/shopping)
    family/               Settings          (/family)
    layout.tsx            Header + navigation for all of the above
  login/ signup/ reset-password/ onboarding/ join/[code]/ offline/
  auth/confirm/route.ts   Where links in emails land (confirm signup, reset password)
  api/keep-alive/         Daily ping so the free database never pauses
  actions/                "Server actions": what the forms call (all go through database functions)
  manifest.ts             Makes the site installable
components/               Buttons, forms, dialogs, install instructions…
lib/
  data.ts                 EVERY database read the pages make (easy to audit)
  supabase/               Supabase connection helpers (always as the logged-in user)
  gifts.ts routes.ts errors.ts   Small helpers: input rules, safe redirects, friendly error text
proxy.ts                  Runs before each page: refreshes login, sends logged-out visitors to /login
public/sw.js              The service worker (offline page + static files only)
public/icons/             App icons (re-draw with scripts/generate_icons.py)
supabase/
  migrations/             Database tables, privacy rules, functions (run in order)
  seed.sql                Demo family for local testing (never used in production)
  templates/              Password-reset and confirm-signup email designs
  config.toml             Settings for the local Supabase
tests/
  unit/                   Small fast tests (no database needed)
  db/                     Privacy rules tested directly against the database
  e2e/                    Real browser tests (Playwright), incl. phone-sized screens
.github/workflows/test.yml  Runs all tests on GitHub on every push
vercel.json               Schedules the daily keep-alive
```

**Tech:** Next.js 16 (React 19, TypeScript), Tailwind CSS 4, Supabase (Postgres + Auth), Vitest, Playwright.

---

## 4. Run it on your computer

### What you need (one-time)

1. **Node.js 22 or newer**: <https://nodejs.org> (choose "LTS"). Check with `node -v`.
2. **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>. It runs a private copy of Supabase on your computer. Start it and leave it running.
3. **Git**, to download the code. On a Mac, `git --version` offers to install it.

### Steps

```bash
# 1. Get the code
git clone https://github.com/fellennert/family-christmas.git
cd family-christmas

# 2. Install the JavaScript packages
npm install

# 3. Start the local Supabase (first time downloads ~2 GB; takes a few minutes)
npm run db:start
```

When it finishes it prints some addresses and keys. Then:

```bash
# 4. Create your settings file
cp .env.example .env.local
npm run db:status        # shows the keys again
```

Open `.env.local` in a text editor and paste the **`ANON_KEY`** value (the long `eyJ…` text, or `PUBLISHABLE_KEY` if that's what you see) after `NEXT_PUBLIC_SUPABASE_ANON_KEY=`. The other two lines are already right for local use.

```bash
# 5. Load the demo family (also resets the local database: safe, it's only on your computer)
npm run db:reset

# 6. Start the website
npm run dev
```

Open <http://localhost:3000>.

### Demo accounts (local only)

All passwords are `christmas`.

| Email | Who | Notes |
|---|---|---|
| `mom@demo.test` | Mom | Family owner. Try **My list**: no claims or secret ideas are shown. |
| `dad@demo.test` | Dad | Open Mom's list to see claims and secret ideas. |
| `grandma@demo.test` | Grandma | Has an "edited after you claimed it" item. |
| `sam@demo.test` | Sam | Has a gift that Dad **removed** after Sam claimed it. |
| `elf@demo.test` | Elf | In a *different* family: sees none of the above. |

Invite code for the demo family: `XMAS2345`.

### Handy local addresses

- Website: <http://localhost:3000>
- **Test inbox** (password-reset emails land here instead of real inboxes): <http://127.0.0.1:54324>
- Database admin screen (Supabase Studio): not started by default to save memory. Run `npx supabase stop && npx supabase start` (without the exclusions) to get it at <http://127.0.0.1:54323>.

### Stopping

`Ctrl+C` stops the website. `npm run db:stop` stops Supabase (your local data is kept until the next `db:reset`).

> **The installable-app part only switches on in a production build.** To try it locally: `npm run build && npm run start`, then open <http://localhost:3000>.

---

## 5. Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm run test:unit` | Input rules, safe redirects, invite codes, error messages | Nothing |
| `npm run test:db` | **The privacy rules, directly in the database**: recipients can't see claims or secret ideas; other families see nothing; only creators edit; races; deletion behavior; account deletion… (39 tests) | `npm run db:start` |
| `npm run test:e2e` | **Real browsers** (desktop + phone size) clicking through the site: the same privacy rules, the identical-looking delete dialog, two people claiming at once, sign-up via invite link, password reset by email, the offline/shared-device rule (38 tests) | `npm run db:start` and `.env.local`; first time also `npx playwright install chromium` |
| `npm test` | unit + db | |
| `npm run test:all` | everything | |
| `npm run typecheck` | TypeScript types | |

`test:e2e` builds the site and starts it on port 3100 automatically.

### Which test proves which rule (SPEC §10)

| SPEC §10 | Database test (`tests/db`) | Browser test (`tests/e2e`) |
|---|---|---|
| 1. Recipient can't see claims | `privacy.test.ts` "§10.1" | `privacy.spec.ts` "§10.1 + §10.2" (also checks raw network responses) |
| 2. Recipient can't see secret ideas | "§10.2" | same |
| 3. List identical before/after a claim | "§10.3" (compares *everything* readable) | "§10.3" (compares the page HTML) |
| 4. Delete looks the same; claimer sees "Removed" | `mutations.test.ts` "§10.4" | "§10.4" (compares the dialogs) |
| 5. Others see claim status and claimer | "§10.5" | "§10.5" |
| 6. Simultaneous claims: one wins | "§10.6" (10-way race + held transaction) | "§10.6" (two browsers) |
| 7. Other families see nothing | "§10.7" | "§10.7" |
| 8. Only creators edit; only claimers unclaim | "§10.8" | "§10.8" |
| 9. No cached data on shared devices (PWA) | n/a | `pwa.spec.ts` "§10.9" |

GitHub also runs everything automatically on each push (`.github/workflows/test.yml`, under the **Actions** tab on GitHub).

---

## 6. Put it on the internet (Supabase + Vercel)

Both services have free plans that are plenty for a family. Allow about **45 minutes** the first time. Screens on these websites change from time to time; if a button name differs slightly, look for the closest match.

> **Before you start:** Vercel publishes the repository's default branch, **`master`**. Make sure the code you want live is on `master`.

### Step A: Create the Supabase project (the database)

1. Go to <https://supabase.com> → **Start your project** → sign in (with GitHub is easiest).
2. **New project**:
   - *Name*: `family-christmas`
   - *Database password*: click **Generate**, then **save it in your password manager**. You'll need it in step B.
   - *Region*: the one closest to your family.
   - *Plan*: Free.
3. Wait a couple of minutes until the project is ready.
4. Note your **project reference**: it's the random letters in the dashboard address, `https://supabase.com/dashboard/project/<THIS-PART>`.

### Step B: Load the database tables and privacy rules

On your computer, in the project folder:

```bash
npx supabase login                               # opens a browser to approve
npx supabase link --project-ref <your-project-ref>   # asks for the database password from step A
npx supabase db push                             # creates tables, privacy rules and functions
```

`db push` shows the 4 migration files and asks to confirm: answer `Y`. It does **not** load the demo family (that's only for your computer).

Check: in the Supabase dashboard, **Table Editor** should list `profiles`, `families`, `family_members`, `gifts`, `claims`.

### Step C: Find your keys

Supabase dashboard → **Project Settings** → **API** (or **API Keys**):

- **Project URL**, like `https://abcdefgh.supabase.co`
- The public key: either the **`anon` `public`** key (starts with `eyJ…`) or the **publishable** key (starts with `sb_publishable_…`). Either works.

**Never** use the `service_role` / secret key anywhere in this project. The site doesn't need it.

### Step D: Put the website on Vercel

1. Go to <https://vercel.com> → sign up / log in **with GitHub**.
2. **Add New… → Project** → find `family-christmas` → **Import**. (If it isn't listed, click "Adjust GitHub App Permissions" and allow the repository.)
3. Framework is detected as **Next.js**; leave the build settings alone.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL from step C |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the public key from step C |
   | `NEXT_PUBLIC_SITE_URL` | leave out for now (added in step F) |

5. **Deploy**. After a minute or two you get an address like `https://family-christmas-xyz.vercel.app`. Copy it.

### Step E: Tell Supabase about your website (login and emails)

Supabase dashboard → **Authentication**:

1. **URL Configuration**
   - *Site URL*: your Vercel address, e.g. `https://family-christmas-xyz.vercel.app`
   - *Redirect URLs* → **Add URL**: `https://family-christmas-xyz.vercel.app/**` (with the `/**` at the end)
2. **Emails → Templates** (sometimes under "Email Templates"). These make the email links work even if someone opens the email on a different device:
   - **Reset Password**: subject `Reset your Family Christmas password`; replace the message body with the contents of [`supabase/templates/recovery.html`](supabase/templates/recovery.html).
   - **Confirm signup**: subject `Confirm your Family Christmas account`; body from [`supabase/templates/confirmation.html`](supabase/templates/confirmation.html).
3. **Sign In / Providers → Email** (sometimes "Auth Providers"):
   - Keep **Email** enabled.
   - **Confirm email**: your choice. *On* (default) means new relatives must click a link in an email before their first login, which is a bit safer but one more step. *Off* means they're in immediately. For a family app, either is fine.
   - **Minimum password length**: set to `8` to match the site.

### Step F: Final touch on Vercel

Vercel → your project → **Settings → Environment Variables** → add `NEXT_PUBLIC_SITE_URL` = your Vercel address (no trailing slash). Then **Deployments** → the latest one → **⋯ → Redeploy**.

### Step G: Check it works

1. Open your Vercel address on your phone. You should see the login page.
2. **Create account** with your own email, then **Start a new family**.
3. **Settings** shows your invite link. 🎉
4. Test "Forgot your password?" once: the email should arrive within a minute (check spam).

### Optional: your own web address

Vercel → project → **Settings → Domains** → add e.g. `gifts.yourfamily.com` and follow the instructions (a domain costs about €10–15 a year from any registrar). Afterwards update **Site URL**, **Redirect URLs** (step E) and `NEXT_PUBLIC_SITE_URL` (step F) to the new address.

### Optional: more reliable emails

Supabase's built-in email sender only sends a few emails per hour and is meant for testing. That's usually enough for a family's occasional password reset, but if emails go missing:

1. Create a free account at <https://resend.com> (about 3,000 emails/month free), add and verify your domain (needs your own domain, see above), and create an **API key**.
2. Supabase → **Project Settings → Authentication → SMTP Settings** → enable custom SMTP:
   - Host `smtp.resend.com`, Port `465`, Username `resend`, Password = the Resend API key
   - Sender email e.g. `christmas@yourfamily.com`, Sender name `Family Christmas`
3. Supabase → **Authentication → Rate Limits**: you can now raise the email limit.

---

## 7. Inviting the family and installing on phones

1. In **Settings**, tap **Share…** (or **Copy link**) and send the link by WhatsApp, Messages or email.
2. Each person opens the link, taps **I'm new: create an account**, and lands in the family.
3. On the family page they'll see **"Put this on your home screen"** with instructions for their phone:
   - **iPhone/iPad**: open the site in **Safari** → **Share** button (square with an arrow) → **Add to Home Screen** → **Add**.
   - **Android**: open in **Chrome** → **⋮** menu → **Add to Home screen** / **Install app**.

From then on it opens from its own 🎄 icon, full-screen, like an app.

---

## 8. Looking after it

### Keeping the free database awake

Free Supabase projects **pause after about a week with no activity**. This project includes a daily "keep-alive" (`vercel.json` → `/api/keep-alive`) that Vercel runs automatically once a day, so it shouldn't happen. You can see it under Vercel → project → **Settings → Cron Jobs**.

If it does pause anyway: Supabase dashboard → your project → **Restore/Resume**. Nothing is lost.

### Backups

The free plan doesn't include downloadable backups. Before Christmas (and whenever you like), save a copy. This needs Docker running:

```bash
npx supabase db dump --linked -f backup-schema.sql
npx supabase db dump --linked --data-only -f backup-data.sql
```

Keep those files somewhere safe (not in the GitHub repository: they contain everyone's lists).

### Updating the app

- **Code changes**: push to `master` on GitHub → Vercel publishes automatically within a few minutes.
- **Database changes** (a new file in `supabase/migrations/`): run `npx supabase db push` from your computer.
- **Service worker changes** (`public/sw.js`): bump `VERSION` at the top of the file so phones drop the old files.

### Removing someone / new year

The owner can remove members in **Settings**. Each person can delete their own account in **Settings → Delete my account**. To start fresh next year, each person can simply delete old wishes from their list.

---

## 9. Environment variables

| Variable | Where it's used | Local value | Production value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Everywhere | `http://127.0.0.1:54321` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Everywhere | `ANON_KEY` from `npm run db:status` | Supabase anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | Links in emails, invite link | `http://localhost:3000` | Your Vercel/custom address |

Only for tests (optional; read from `npx supabase status` automatically): `SUPABASE_SERVICE_ROLE_KEY`, `MAILPIT_URL`, `E2E_PORT`, `PW_CHROMIUM_PATH`.

The public key is meant to be visible in the browser; the database's privacy rules are what protect the data. **No secret key is ever needed by the site.**

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| "Missing environment variable NEXT_PUBLIC_SUPABASE_…" | `.env.local` is missing or incomplete (locally), or the variable isn't set in Vercel (then redeploy). |
| Site loads but every page errors | Supabase project paused or wrong URL/key. Check the Supabase dashboard. |
| Password-reset email never arrives | Check spam. Wait a few minutes (built-in sender is rate-limited). Consider the custom SMTP step. Locally, look in <http://127.0.0.1:54324>. |
| "That link has expired or was already used" | Links work once and expire after an hour. Ask for a new one. Also check the email templates and Redirect URLs (step E). |
| Sign-up says "check your email" | "Confirm email" is on in Supabase (step E3). That's expected; tap the link in the email. |
| `npm run db:start` fails | Make sure Docker Desktop is running. Port in use? `npm run db:stop` then try again. |
| iPhone has no "Add to Home Screen" | It must be opened in **Safari**, not inside WhatsApp's or Gmail's built-in browser: tap "Open in Safari" first. |
| App on the phone shows an old version | Close it fully and reopen; if still old, bump `VERSION` in `public/sw.js` and redeploy. |
| `db push` asks for a password and fails | Use the database password from step A (reset it under Project Settings → Database if lost). |
