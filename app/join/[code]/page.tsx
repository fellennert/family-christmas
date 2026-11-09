import type { Metadata } from 'next';
import Link from 'next/link';
import { joinFamily } from '@/app/actions/family';
import { ActionForm } from '@/components/ActionForm';
import { AuthCard, Notice } from '@/components/AuthCard';
import { getMyFamilyId, getViewer } from '@/lib/data';
import { normalizeInviteCode } from '@/lib/routes';

export const metadata: Metadata = { title: 'Join a family' };

/**
 * Shareable invite link /join/<code> (SPEC §4.2.3). Prefills the code and, if
 * needed, routes through signup/login and back here.
 *
 * The page never looks the code up before the person submits it, so it
 * reveals nothing (not even a family name) to someone guessing codes.
 */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeInviteCode(decodeURIComponent((await params).code));
  const viewer = await getViewer();
  const back = encodeURIComponent(`/join/${code}`);

  if (!viewer) {
    return (
      <AuthCard title="You’re invited!">
        <p className="text-lg">
          Someone invited you to their family’s Christmas lists. Your invite code is{' '}
          <strong className="font-mono tracking-widest">{code}</strong>.
        </p>
        <div className="flex flex-col gap-3">
          <Link href={`/signup?next=${back}`} className="btn-primary">
            I’m new: create an account
          </Link>
          <Link href={`/login?next=${back}`} className="btn-secondary">
            I already have an account
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (await getMyFamilyId()) {
    return (
      <AuthCard title="You’re already in a family">
        <Notice>You can only be in one family for now.</Notice>
        <Link href="/" className="btn-primary">
          Go to my family
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Join your family">
      <p className="text-lg">Hi {viewer.displayName}! Tap the button to join.</p>
      <ActionForm action={joinFamily} submitLabel="Join family" pendingLabel="Joining…" buttonClassName="btn-primary w-full">
        <div>
          <label htmlFor="code" className="label">
            Invite code
          </label>
          <input
            id="code"
            name="code"
            defaultValue={code}
            required
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="input font-mono tracking-widest uppercase"
          />
        </div>
      </ActionForm>
    </AuthCard>
  );
}
