import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

const TYPES: EmailOtpType[] = ['signup', 'email', 'recovery', 'invite', 'magiclink', 'email_change'];

/**
 * Landing point for links in Supabase emails (confirm signup, reset password).
 *
 * The email templates in supabase/templates/ link here with a `token_hash`.
 * Verifying it on the server works even when the email is opened on a
 * different device than the one that asked for it, which matters for family
 * members who request a reset on the iPad and open the email on their phone.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'), type === 'recovery' ? '/reset-password/update' : '/');

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL('/login?error=link', origin));
}
