import { describe, expect, it } from 'vitest';
import { INVITE_CODE_PATTERN, isPublicPath, isUuid, normalizeInviteCode, safeNext } from '@/lib/routes';

describe('safeNext (no open redirects)', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/join/XMAS2345')).toBe('/join/XMAS2345');
    expect(safeNext('/people/abc?x=1')).toBe('/people/abc?x=1');
  });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'evil', '/ok\r\nSet-Cookie: x'])(
    'rejects %s',
    (n) => expect(safeNext(n, '/fallback')).toBe('/fallback'),
  );
  it('falls back when empty', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext('', '/x')).toBe('/x');
  });
});

describe('isPublicPath', () => {
  it.each(['/login', '/signup', '/reset-password', '/reset-password/update', '/auth/confirm', '/join/ABC', '/offline', '/api/keep-alive'])(
    '%s is public',
    (p) => expect(isPublicPath(p)).toBe(true),
  );
  it.each(['/', '/me', '/people/x', '/shopping', '/family', '/onboarding', '/loginx', '/offline-data'])(
    '%s needs login',
    (p) => expect(isPublicPath(p)).toBe(false),
  );
});

describe('invite codes', () => {
  it('normalizes what people type', () => {
    expect(normalizeInviteCode(' xmas-2345 ')).toBe('XMAS2345');
    expect(normalizeInviteCode(null)).toBe('');
  });
  it('matches the unambiguous alphabet (no 0/O/1/I)', () => {
    expect(INVITE_CODE_PATTERN.test('XMAS2345')).toBe(true);
    for (const bad of ['XMAS234', 'XMAS23450', 'OXMAS234', 'XMAS2341', 'IXMAS234', 'XMAS2340']) {
      expect(INVITE_CODE_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe('isUuid', () => {
  it('accepts uuids only', () => {
    expect(isUuid('11111111-1111-1111-1111-111111111111')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
