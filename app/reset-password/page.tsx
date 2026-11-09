import type { Metadata } from 'next';
import Link from 'next/link';
import { requestPasswordReset } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';

export const metadata: Metadata = { title: 'Reset password' };

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Forgot your password?">
      <p className="text-lg">Enter your email and we’ll send you a link to choose a new one.</p>
      <ActionForm
        action={requestPasswordReset}
        submitLabel="Send reset link"
        pendingLabel="Sending…"
        buttonClassName="btn-primary w-full"
      >
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
      </ActionForm>
      <Link href="/login" className="btn-link text-lg">
        Back to log in
      </Link>
    </AuthCard>
  );
}
