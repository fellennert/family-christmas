import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

/**
 * Called once a day by Vercel Cron (see vercel.json) so the free Supabase
 * project never pauses for inactivity. Runs the harmless `ping()` database
 * function with the public key: no user data is read.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc('ping');
  if (error || data !== 'ok') {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
