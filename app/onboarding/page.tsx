import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createFamily, joinFamily } from '@/app/actions/family';
import { ActionForm } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { SignOutButton } from '@/components/pwa';
import { getMyFamilyId, getViewer } from '@/lib/data';
import { LIMITS } from '@/lib/gifts';

export const metadata: Metadata = { title: 'Welcome' };

/** SPEC §4.2.1: a signed-in user with no family creates or joins one. */
export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/onboarding');
  if (await getMyFamilyId()) redirect('/');

  return (
    <AuthCard title={`Welcome, ${viewer.displayName}!`}>
      <p className="text-lg">To get started, join your family’s group or start a new one.</p>

      <section className="space-y-3 rounded-xl bg-cream p-4" aria-labelledby="join-title">
        <h2 id="join-title" className="text-2xl">
          Join a family
        </h2>
        <p className="text-lg">Someone in your family can give you an invite code.</p>
        <ActionForm action={joinFamily} submitLabel="Join" pendingLabel="Joining…">
          <div>
            <label htmlFor="code" className="label">
              Invite code
            </label>
            <input
              id="code"
              name="code"
              required
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. XMAS2345"
              className="input font-mono tracking-widest uppercase"
            />
          </div>
        </ActionForm>
      </section>

      <section className="space-y-3 rounded-xl bg-cream p-4" aria-labelledby="create-title">
        <h2 id="create-title" className="text-2xl">
          Start a new family
        </h2>
        <p className="text-lg">You’ll get a code to share with everyone else.</p>
        <ActionForm action={createFamily} submitLabel="Create family" pendingLabel="Creating…" buttonClassName="btn-secondary">
          <div>
            <label htmlFor="name" className="label">
              Family name
            </label>
            <input
              id="name"
              name="name"
              required
              maxLength={LIMITS.familyName}
              placeholder="e.g. The Millers"
              className="input"
            />
          </div>
        </ActionForm>
      </section>

      <SignOutButton className="btn-link" />
    </AuthCard>
  );
}
