import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { updatePassword } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { getViewer } from '@/lib/data';
import { LIMITS } from '@/lib/gifts';

export const metadata: Metadata = { title: 'Choose a new password' };

/** Reached from the reset email via /auth/confirm, which signs the person in. */
export default async function UpdatePasswordPage() {
  if (!(await getViewer())) redirect('/login?error=link');

  return (
    <AuthCard title="Choose a new password">
      <ActionForm
        action={updatePassword}
        submitLabel="Save new password"
        pendingLabel="Saving…"
        buttonClassName="btn-primary w-full"
      >
        <div>
          <label htmlFor="password" className="label">
            New password
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
        <div>
          <label htmlFor="confirm" className="label">
            Type it again
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={LIMITS.passwordMin}
            required
            className="input"
          />
        </div>
      </ActionForm>
    </AuthCard>
  );
}
