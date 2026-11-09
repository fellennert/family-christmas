# Family Christmas Gift List: Build Spec

## 1. Purpose

A small private website where family members keep Christmas wish lists. Each person lists gifts they want, and anyone can also add secret gift ideas for someone else. Family members claim gifts so nobody buys duplicates. **The recipient must never be able to learn whether, or by whom, any of their gifts has been claimed.** Everyone else in the family can see claim status and the claimer's name.

This is a family-scale app (roughly 5 to 10 users). Favor simplicity, low cost, and correctness of the privacy rules over scale.

## 2. Tech stack (assumed; change if you prefer)

- **Framework:** Next.js (App Router) with TypeScript
- **Backend, auth, database:** Supabase (Postgres + Supabase Auth with email/password)
- **Styling:** Tailwind CSS
- **Hosting:** Vercel (free tier) + Supabase (free tier)
- **Testing:** Vitest for unit tests; Playwright for end-to-end tests

Rationale: Supabase gives email/password auth, password reset emails, and Postgres Row Level Security (RLS). RLS lets the database itself enforce the claim privacy rules, so a bug in the UI cannot leak claim data.

## 3. Core concepts

- **User:** has an account (email, password, display name).
- **Family:** a group of users who can see each other's lists. Joined via an invite code. In v1 each user belongs to exactly one family, but the schema should allow many-to-many so multiple groups can be added later.
- **Gift:** an item for one recipient. Fields: title (required), URL (optional), notes (optional, e.g. size or color). A gift is either:
  - **Self-added:** created by the recipient on their own list. Visible to the recipient and to everyone else.
  - **Secret idea:** created by someone else for the recipient. **Never visible to the recipient in any form.**
- **Claim:** one family member marks a gift as "I'm getting this." One claim per gift.

## 4. User flows

### 4.1 Accounts
1. Sign up with email, password, and display name.
2. Log in / log out.
3. Forgot password: email reset link (use Supabase's built-in flow).
4. Edit display name.

### 4.2 Joining a family
1. After signup, a user with no family sees two options: **Create a family** (enter a family name) or **Join a family** (enter an invite code).
2. Creating a family makes the user its **owner** and generates a random invite code (e.g. 8 characters, unambiguous alphabet, no 0/O/1/I).
3. The owner can view, copy, and regenerate the invite code. A shareable link `/join/<code>` should prefill the code (and route through signup/login if needed).
4. The owner can remove a member. Removing a member deletes their claims and hides their gifts (soft delete); keep it simple.

### 4.3 My list (gifts for me)
1. Shows only gifts the user added for themselves.
2. Add, edit, and delete gifts.
3. **No claim information appears anywhere on this page**, and the API responses that feed it must contain no claim data.
4. Secret ideas others created for this user are not shown and not counted.

### 4.4 Someone else's list
1. Family dashboard lists all members except the current user. Clicking a member opens their list.
2. The list shows **both** the member's self-added gifts **and** secret ideas created by anyone (labeled "Secret idea, added by <name>").
3. Each gift shows: title, link (opens in new tab), notes, and claim status ("Unclaimed" or "Claimed by <name>").
4. Actions:
   - **Claim** an unclaimed gift.
   - **Unclaim** a gift the current user claimed.
   - **Add a secret idea** for this member.
   - Edit or delete a secret idea the current user created.

### 4.5 My shopping list
A page listing every gift the current user has claimed, grouped by recipient, with links. Gifts that were removed after claiming appear here with a clear flag (see 5.3).

## 5. Privacy and permission rules (most important section)

Let `U` be the viewing user and `G` a gift with recipient `R` and creator `C`.

### 5.1 Gift visibility
`U` can see `G` only if `U` is in the same family, **and** one of:
- `U != R` (anyone but the recipient sees all of the recipient's gifts, including secret ideas), or
- `U == R` and `C == R` and `G` is not soft-deleted (the recipient sees only their own self-added, active gifts).

### 5.2 Claim visibility
- `U` can see claims on `G` only if `U != R`.
- The recipient must not be able to infer claims through **any** channel: page content, API/JSON responses, counts, sorting order, error messages, disabled buttons, timestamps, or "last updated" fields. For example, sorting the recipient's list must never depend on claim state.

### 5.3 Deleting or editing claimed gifts
- If the **recipient** deletes a self-added gift: always allow it, and show the same confirmation whether or not it is claimed (no hint). If it had a claim, soft-delete it (`removed_at` set): it disappears for the recipient, while the claimer and other members see it marked "Removed from list by <recipient>." The claimer sees it flagged in their shopping list and can dismiss it (which deletes the claim and hard-deletes the gift if no one else needs it). If there was no claim, hard-delete.
- If the **recipient edits** a claimed gift, allow it silently; show "Edited after you claimed it" to the claimer.
- If the **creator of a secret idea** deletes it and someone else claimed it, apply the same soft-delete-and-alert behavior.

### 5.4 Other permissions
- Only the gift's creator can edit or delete it.
- A user cannot claim a gift for which they are the recipient (they never see claim controls on their own list).
- A user can unclaim only their own claims.
- Users in different families can see nothing of each other.

### 5.5 Enforcement
- Enforce 5.1 to 5.4 with **Postgres Row Level Security policies** (and/or secure views or RPC functions), not just in UI code.
- Server components and API routes must query through the user's authenticated session, never a service-role key, for any user-facing read.
- Claims live in a separate table so a recipient's gift query cannot join them in by accident.

## 6. Data model (Postgres)

```
profiles        id (uuid, = auth.users.id), display_name, created_at
families        id, name, invite_code (unique), owner_id -> profiles, created_at
family_members  family_id -> families, user_id -> profiles, role ('owner'|'member'), joined_at
                PRIMARY KEY (family_id, user_id)
gifts           id, family_id, recipient_id -> profiles, created_by -> profiles,
                title (text, required, <= 200 chars), url (text, nullable),
                notes (text, nullable, <= 1000 chars),
                created_at, updated_at, removed_at (nullable), removed_by (nullable)
claims          id, gift_id -> gifts (UNIQUE), claimer_id -> profiles,
                created_at, gift_edited_after_claim (bool, default false)
```

Notes:
- `secret idea` is derived: `created_by != recipient_id`.
- `UNIQUE(gift_id)` on claims prevents double-claiming; handle the race with a clear "Someone just claimed this" message.
- Write RLS policies for every table. Include SQL migrations in the repo.

## 7. Input handling

- URL: optional; accept only `http://` or `https://`; render with `target="_blank" rel="noopener noreferrer"`. Show the domain as a hint next to the title.
- Do not add a price field.
- Trim whitespace; enforce length limits server-side.
- No link-preview scraping in v1.

## 8. Pages and routes

| Route | Purpose |
|---|---|
| `/login`, `/signup`, `/reset-password` | Auth |
| `/join/[code]` | Join a family via link |
| `/onboarding` | Create or join a family |
| `/` | Family dashboard: members, links to lists |
| `/me` | My list (self-added gifts only) |
| `/people/[userId]` | A member's list with claims and secret ideas |
| `/shopping` | Gifts I've claimed, grouped by recipient |
| `/family` | Family settings (invite code, members; owner actions) |

## 9. UI and design

- Festive but clean: deep green, cranberry red, cream background, gold accents. Readable for older relatives: large text, high contrast, big tap targets.
- Mobile-first; most family members will use phones.
- Clear labels such as "Claimed by Aunt Sue" and "Secret idea from Dad."
- Empty states with friendly prompts (e.g. "Your list is empty. Add something you'd like!").

## 9a. Installable app (PWA)

The app ships as a Progressive Web App so family members can add it to their iPhone/Android home screen and use it like an app. No App Store, no native wrapper in v1.

- Web app manifest (Next.js built-in `app/manifest.ts`): name, short name, theme/background colors from the palette, `display: standalone`, start URL `/`.
- Icons: 192px, 512px, maskable 512px, and a 180px `apple-touch-icon`; iOS status-bar and splash meta tags.
- Respect iOS safe areas (`env(safe-area-inset-*)`) so nothing hides under the notch or home indicator.
- A small hand-written service worker (no extra dependency) that caches **only static assets and an offline fallback page**.
- **Privacy (Section 5 wins):** the service worker must never cache authenticated pages, RSC payloads, or Supabase/API responses. Phones and iPads are often shared within a family, so a cached page from one user must never be shown to another. Logging out clears all caches.
- "Install this app" help on the dashboard with short instructions for iOS Safari (Share, then Add to Home Screen) and Android Chrome. Hide it when already running standalone.
- Password-reset and `/join/<code>` links work when opened from email or Messages (they open in the browser; that is fine for v1).
- Out of scope for v1: push notifications, offline editing, native iOS/Android builds. The architecture (all data rules in Postgres) keeps a later Capacitor or native client possible without backend changes.

## 10. Testing requirements

Write automated tests that prove the privacy rules, at both the database (RLS) level and the end-to-end level. At minimum:

1. Recipient cannot see claims on their own self-added gifts (UI and raw API/DB query).
2. Recipient cannot see secret ideas created for them (UI and raw query).
3. Recipient's list looks identical (same items, order, fields) before and after another member claims a gift.
4. Recipient deleting a claimed gift shows the same UI as deleting an unclaimed one; claimer then sees the "Removed" flag.
5. Non-recipient sees claim status and claimer name.
6. Two users claiming the same gift simultaneously: exactly one succeeds.
7. Users in another family can see nothing.
8. Only creators can edit/delete gifts; only claimers can unclaim.
9. The service worker serves no cached authenticated content: after user A logs out and user B logs in on the same browser, B never sees A's data, including offline.

## 11. Out of scope for v1 (possible later)

- Multiple families per user
- Gift quantities / split claims / group gifts
- "Purchased" status separate from "claimed"
- Priority ranking
- Images and link previews
- Email notifications
- Secret Santa assignment

## 12. Deliverables

1. Working Next.js app with Supabase migrations (schema + RLS policies).
2. `README.md` with local setup, environment variables, and step-by-step deploy instructions for Vercel + Supabase written for a non-expert.
3. Seed script creating a demo family with a few users, gifts, secret ideas, and claims for local testing.
4. Passing test suite covering Section 10.

## 13. Instructions for Claude Code

- Start by proposing a short implementation plan and the RLS policy design; check with me before building the UI.
- Treat Section 5 as non-negotiable. If any requirement conflicts with it, Section 5 wins; flag the conflict.
- Ask me before adding dependencies beyond those listed.
