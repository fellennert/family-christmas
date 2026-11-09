import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Next.js "proxy" (formerly "middleware"): runs before each page request to
 * refresh the login session and send signed-out visitors to /login.
 * See lib/supabase/proxy.ts.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static files, icons, the manifest and the service worker.
  matcher: [
    '/((?!_next/static|_next/image|icons/|favicon.ico|manifest.webmanifest|sw.js|robots.txt|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
};
