import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { deleteAccount, updateDisplayName } from '@/app/actions/account';
import { regenerateInviteCode, removeMember } from '@/app/actions/family';
import { ActionForm } from '@/components/ActionForm';
import { Notice } from '@/components/AuthCard';
import { CopyButton } from '@/components/CopyButton';
import { SignOutButton } from '@/components/pwa';
import { getInviteCode, requireFamily } from '@/lib/data';
import { LIMITS } from '@/lib/gifts';

export const metadata: Metadata = { title: 'Settings' };

async function baseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${h.get('host')}`;
}

/** SPEC §4.2 family settings, plus the person's own account settings. */
export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const sp = await searchParams;
  const { viewer, family, isOwner, members } = await requireFamily();
  const code = await getInviteCode();
  const link = code ? `${await baseUrl()}/join/${code}` : null;

  return (
    <>
      <h1 className="text-3xl">Settings</h1>
      {sp.created && <Notice>Your family is ready! Share the invite link below with everyone.</Notice>}

      {/* ---------------------------------------------------------- Invite */}
      {isOwner && code && link && (
        <section className="card space-y-4" aria-labelledby="invite-title">
          <h2 id="invite-title" className="text-2xl">
            Invite your family
          </h2>
          <p className="text-lg">Send this link to family members. It takes them straight to sign-up.</p>
          <p className="rounded-xl bg-cream px-4 py-3 font-mono text-lg break-all" data-testid="invite-link">
            {link}
          </p>
          <div className="flex flex-wrap gap-3">
            <CopyButton text={link} label="Copy link" />
            <CopyButton text={`Join our family Christmas wish lists: ${link}`} label="Share…" share />
          </div>
          <p className="text-lg">
            Or they can enter the code{' '}
            <strong className="font-mono text-xl tracking-widest" data-testid="invite-code">
              {code}
            </strong>{' '}
            after signing up.
          </p>
          <details className="rounded-xl bg-cream p-4">
            <summary className="cursor-pointer text-lg font-semibold">Make a new code</summary>
            <p className="mt-2 text-lg">
              Use this if the link was shared with the wrong person. The old link stops working; people already
              in the family stay in.
            </p>
            <div className="mt-3">
              <ActionForm
                action={regenerateInviteCode}
                submitLabel="Make a new code"
                pendingLabel="Making…"
                buttonClassName="btn-danger"
              />
            </div>
          </details>
        </section>
      )}

      {/* ---------------------------------------------------------- Members */}
      <section className="card space-y-4" aria-labelledby="members-title">
        <h2 id="members-title" className="text-2xl">
          {family.name}: {members.length} {members.length === 1 ? 'member' : 'members'}
        </h2>
        <ul className="divide-y divide-gold/30">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="text-lg">
                <strong>{m.displayName}</strong>
                {m.id === viewer.id && ' (you)'}
                {m.role === 'owner' && <span className="ml-2 text-base text-muted">Owner</span>}
              </span>
              {isOwner && m.id !== viewer.id && (
                <details>
                  <summary className="btn-link cursor-pointer">Remove…</summary>
                  <div className="mt-2 max-w-sm space-y-2 rounded-xl bg-cream p-4">
                    <p className="text-lg">
                      Remove {m.displayName} from the family? Their claims are released and their gifts are hidden.
                    </p>
                    <ActionForm
                      action={removeMember}
                      submitLabel={`Remove ${m.displayName}`}
                      pendingLabel="Removing…"
                      buttonClassName="btn-danger"
                    >
                      <input type="hidden" name="userId" value={m.id} />
                    </ActionForm>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
        {!isOwner && <p className="text-base text-muted">Ask the family owner for the invite link.</p>}
      </section>

      {/* ---------------------------------------------------------- Account */}
      <section className="card space-y-4" aria-labelledby="account-title">
        <h2 id="account-title" className="text-2xl">
          Your account
        </h2>
        <p className="text-lg">
          Logged in as <strong>{viewer.email}</strong>
        </p>
        <ActionForm action={updateDisplayName} submitLabel="Save name" pendingLabel="Saving…" buttonClassName="btn-secondary">
          <div>
            <label htmlFor="displayName" className="label">
              Your name
            </label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={viewer.displayName}
              required
              maxLength={LIMITS.displayName}
              className="input"
            />
          </div>
        </ActionForm>
        <div className="flex flex-wrap gap-3">
          <SignOutButton />
          <a href="/reset-password" className="btn-link">
            Change password
          </a>
        </div>
      </section>

      <section className="card space-y-3 border-cranberry/40" aria-labelledby="delete-title">
        <h2 id="delete-title" className="text-2xl text-cranberry-dark">
          Delete my account
        </h2>
        <details>
          <summary className="btn-link cursor-pointer text-cranberry">Show</summary>
          <div className="mt-3 space-y-3">
            <p className="text-lg">
              This permanently deletes your account, your wish list, your secret ideas and your claims. It can’t be
              undone.
              {isOwner && members.length > 1 && ' The family will be handed over to the longest-standing member.'}
              {isOwner && members.length === 1 && ' Because you are the only member, the family is deleted too.'}
            </p>
            <ActionForm
              action={deleteAccount}
              submitLabel="Delete my account forever"
              pendingLabel="Deleting…"
              buttonClassName="btn-danger"
            >
              <div>
                <label htmlFor="confirm" className="label">
                  Type DELETE to confirm
                </label>
                <input id="confirm" name="confirm" required autoComplete="off" className="input" />
              </div>
            </ActionForm>
          </div>
        </details>
      </section>
    </>
  );
}
