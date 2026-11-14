import type { EmailOtpType } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { confirmEmailLink } from '@/app/actions/auth';
import { ActionForm } from '@/components/ActionForm';
import { AuthCard } from '@/components/AuthCard';
import { safeNext } from '@/lib/routes';

export const metadata: Metadata = { title: 'Confirm' };
export const dynamic = 'force-dynamic';

const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

/**
 * Landing point for links in Supabase emails (confirm signup, reset password).
 *
 * Opening this page does NOT use up the one-time link: the person has to tap
 * the button. Many email providers (Outlook, work accounts) open every link
 * in an email to scan it; if the link were used on open, the scanner would
 * use it up and the person would see "expired". Scanners don't press buttons.
 *
 * The link carries a `token_hash`, verified on our server, so it works even
 * when the email is opened on a different device than the one that asked.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type as EmailOtpType | undefined;
  if (!sp.token_hash || !type || !TYPES.includes(type)) redirect('/login?error=link');
  const isReset = type === 'recovery';
  const next = safeNext(sp.next, isReset ? '/reset-password/update' : '/');

  return (
    <AuthCard title={isReset ? 'Reset your password' : 'Confirm your email'}>
      <p className="text-lg">
        {isReset
          ? 'Tap the button to continue and choose a new password.'
          : 'Almost done! Tap the button to confirm your email address.'}
      </p>
      <ActionForm
        action={confirmEmailLink}
        submitLabel={isReset ? 'Continue' : 'Confirm my email'}
        pendingLabel="One moment…"
        buttonClassName="btn-primary w-full"
      >
        <input type="hidden" name="token_hash" value={sp.token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
      </ActionForm>
    </AuthCard>
  );
}
