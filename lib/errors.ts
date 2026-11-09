/**
 * Turns database error codes (raised by the functions in
 * supabase/migrations/*_functions.sql) into friendly sentences.
 *
 * Privacy: no message here may reveal anything about claims to a recipient.
 * The database already returns the same code for "claimed" and "unclaimed"
 * where that matters, and these texts never mention claims for those codes.
 */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Please log in again.',
  not_found: 'That item isn’t available any more. Try refreshing the page.',
  forbidden: 'Only the family owner can do that.',
  invalid_input: 'Something in the form doesn’t look right.',
  invalid_name: 'Please enter a name (not too long).',
  invalid_title: 'Please give the gift a name (up to 200 characters).',
  invalid_url: 'Links must start with http:// or https://.',
  invalid_notes: 'Please keep notes under 1000 characters.',
  invalid_code: 'That invite code doesn’t match any family. Check it and try again.',
  already_in_family: 'You’re already in a family.',
  not_in_family: 'You need to join a family first.',
  cannot_remove_self: 'You can’t remove yourself as the owner.',
};

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** Accepts a Supabase/PostgREST error (or anything) and returns text for people. */
export function friendlyError(err: unknown): string {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : typeof err === 'string'
        ? err
        : '';
  const code = message.trim().split(/\s/)[0];
  return MESSAGES[code] ?? GENERIC_ERROR;
}

/** Messages for Supabase Auth errors (login/signup/reset). */
export function friendlyAuthError(err: { message?: string; code?: string } | null | undefined): string {
  const code = err?.code ?? '';
  const msg = (err?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return 'That email and password don’t match. Check them or reset your password.';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'Please confirm your email first: check your inbox for our message.';
  if (code === 'user_already_exists' || msg.includes('already registered'))
    return 'There’s already an account with that email. Try logging in instead.';
  if (code === 'weak_password' || msg.includes('password should'))
    return 'Please choose a longer password (at least 8 characters).';
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit'))
    return 'Too many emails were sent just now. Please wait a few minutes and try again.';
  if (code === 'same_password') return 'Please choose a password different from your old one.';
  return GENERIC_ERROR;
}
