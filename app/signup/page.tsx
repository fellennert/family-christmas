import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signUp } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { getViewer } from '@/lib/data';
import { LIMITS } from '@/lib/gifts';
import { safeNext } from '@/lib/routes';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, '/onboarding');
  if (await getViewer()) redirect(next);
  const qs = sp.next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <AuthCard title="Create your account">
      <ActionForm
        action={signUp}
        submitLabel="Create account"
        pendingLabel="Creating…"
        buttonClassName="btn-primary w-full"
      >
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="displayName" className="label">
            Your name
          </label>
          <input
            id="displayName"
            name="displayName"
            required
            maxLength={LIMITS.displayName}
            autoComplete="nickname"
            placeholder="e.g. Aunt Sue"
            className="input"
          />
          <p className="hint">This is what your family will see.</p>
        </div>
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={LIMITS.passwordMin}
            required
            className="input"
          />
          <p className="hint">At least {LIMITS.passwordMin} characters.</p>
        </div>
      </ActionForm>
      <Link href={`/login${qs}`} className="btn-link text-lg">
        Already have an account? Log in
      </Link>
    </AuthCard>
  );
}
