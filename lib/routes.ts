/**
 * Small, dependency-free helpers for routing decisions. Unit tested in
 * tests/unit/routes.test.ts.
 */

/** Pages a signed-out visitor may open. */
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/reset-password',
  '/auth/',
  '/join/',
  '/offline',
  '/api/keep-alive',
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '/'),
  );
}

/**
 * Only allow redirects to paths on this site (prevents "open redirect" links
 * like /login?next=https://evil.example).
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\r\n]/.test(next)) return fallback;
  return next;
}

/** Normalize an invite code typed or pasted by a person. */
export function normalizeInviteCode(raw: string | null | undefined): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Same alphabet as the database: 8 chars, no 0/O/1/I. */
export const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_PATTERN.test(v);
}
