'use server';

import type { EmailOtpType } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { clean, LIMITS } from '@/lib/gifts';
import { friendlyAuthError } from '@/lib/errors';
import { safeNext } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionState } from './types';

/** Public base URL for links in emails. */
async function siteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const h = await headers();
  return h.get('origin') ?? `https://${h.get('host')}`;
}

export async function signUp(_: ActionState, form: FormData): Promise<ActionState> {
  const displayName = clean(form.get('displayName'));
  const email = clean(form.get('email'));
  const password = typeof form.get('password') === 'string' ? (form.get('password') as string) : '';
  const next = safeNext(clean(form.get('next')), '/onboarding');

  if (!displayName || displayName.length > LIMITS.displayName)
    return fail('Please tell us your name (this is what your family will see).');
  if (!email) return fail('Please enter your email address.');
  if (password.length < LIMITS.passwordMin)
    return fail(`Please choose a password with at least ${LIMITS.passwordMin} characters.`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${await siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return fail(friendlyAuthError(error));

  // With "Confirm email" switched off there is a session right away.
  if (data.session) redirect(next);
  return ok('Almost done! We sent you an email: tap the link in it to finish signing up.');
}

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const email = clean(form.get('email'));
  const password = typeof form.get('password') === 'string' ? (form.get('password') as string) : '';
  const next = safeNext(clean(form.get('next')), '/');
  if (!email || !password) return fail('Please enter your email and password.');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail(friendlyAuthError(error));
  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login?signedOut=1');
}

/** Step 1 of "forgot password": email a link. */
export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  const email = clean(form.get('email'));
  if (!email) return fail('Please enter your email address.');
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/confirm?next=/reset-password/update`,
  });
  // Rate limits are worth telling people about; anything else gets the same
  // answer so this form can't be used to find out who has an account.
  if (error && /rate limit/i.test(error.message)) return fail(friendlyAuthError(error));
  return ok('If there’s an account for that email, we’ve sent a link to reset your password. Check your inbox (and spam folder).');
}

/** Step 2: the link signed the person in; now they choose a new password. */
export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const password = typeof form.get('password') === 'string' ? (form.get('password') as string) : '';
  const confirm = typeof form.get('confirm') === 'string' ? (form.get('confirm') as string) : '';
  if (password.length < LIMITS.passwordMin)
    return fail(`Please choose a password with at least ${LIMITS.passwordMin} characters.`);
  if (password !== confirm) return fail('The two passwords don’t match.');

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(friendlyAuthError(error));
  redirect('/?passwordChanged=1');
}

const EMAIL_LINK_TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

/**
 * The button on /auth/confirm. Only this uses up the one-time email link
 * (see app/auth/confirm/page.tsx for why opening the page doesn't).
 */
export async function confirmEmailLink(_: ActionState, form: FormData): Promise<ActionState> {
  const tokenHash = form.get('token_hash');
  const type = form.get('type') as EmailOtpType | null;
  if (typeof tokenHash !== 'string' || !tokenHash || !type || !EMAIL_LINK_TYPES.includes(type))
    redirect('/login?error=link');
  const next = safeNext(clean(form.get('next')), type === 'recovery' ? '/reset-password/update' : '/');

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  redirect(error ? '/login?error=link' : next);
}
