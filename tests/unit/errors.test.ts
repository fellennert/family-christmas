import { describe, expect, it } from 'vitest';
import { friendlyAuthError, friendlyError, GENERIC_ERROR } from '@/lib/errors';

describe('friendlyError', () => {
  it('maps database codes', () => {
    expect(friendlyError({ message: 'invalid_code' })).toMatch(/invite code/);
    expect(friendlyError({ message: 'forbidden' })).toMatch(/owner/);
    expect(friendlyError('not_found')).toMatch(/isn’t available/);
  });

  it('never leaks raw database text', () => {
    const raw = { message: 'duplicate key value violates unique constraint "claims_gift_id_key"' };
    expect(friendlyError(raw)).toBe(GENERIC_ERROR);
    expect(friendlyError(new Error('boom'))).toBe(GENERIC_ERROR);
    expect(friendlyError(undefined)).toBe(GENERIC_ERROR);
  });

  it('no message mentions claims (recipients can see these)', () => {
    for (const code of ['not_found', 'invalid_title', 'invalid_url', 'invalid_notes', 'forbidden']) {
      expect(friendlyError(code).toLowerCase()).not.toMatch(/claim/);
    }
  });
});

describe('friendlyAuthError', () => {
  it('maps Supabase auth errors', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials' })).toMatch(/don’t match/);
    expect(friendlyAuthError({ message: 'User already registered' })).toMatch(/already an account/);
    expect(friendlyAuthError({ code: 'weak_password' })).toMatch(/longer password/);
    expect(friendlyAuthError(null)).toBe(GENERIC_ERROR);
  });
});
