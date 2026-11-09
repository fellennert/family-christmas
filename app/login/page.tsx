import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signIn } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';
import { AuthCard, Notice } from '@/components/AuthCard';
import { getViewer } from '@/lib/data';
import { safeNext } from '@/lib/routes';

export const metadata: Metadata = { title: 'Log in' };

type Search = Promise<{ next?: string; signedOut?: string; deleted?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getViewer()) redirect(next);
  const qs = sp.next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <AuthCard title="Log in">
      {sp.signedOut && <Notice>You’re logged out. See you soon!</Notice>}
      {sp.deleted && <Notice>Your account has been deleted. Merry Christmas!</Notice>}
      {sp.error === 'link' && (
        <Notice tone="warn">That link has expired or was already used. Please try again.</Notice>
      )}
      <ActionForm action={signIn} submitLabel="Log in" pendingLabel="Logging in…" buttonClassName="btn-primary w-full">
        <input type="hidden" name="next" value={next} />
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
            autoComplete="current-password"
            required
            className="input"
          />
        </div>
      </ActionForm>
      <div className="flex flex-col gap-1 text-lg">
        <Link href="/reset-password" className="btn-link">
          Forgot your password?
        </Link>
        <Link href={`/signup${qs}`} className="btn-link">
          New here? Create an account
        </Link>
      </div>
    </AuthCard>
  );
}
