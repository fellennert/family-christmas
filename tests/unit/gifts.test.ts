import { describe, expect, it } from 'vitest';
import { clean, domainHint, isAllowedUrl, LIMITS, validateGift } from '@/lib/gifts';

describe('clean', () => {
  it('trims and turns empty into null', () => {
    expect(clean('  hi \n')).toBe('hi');
    expect(clean('   ')).toBeNull();
    expect(clean(null)).toBeNull();
    expect(clean(undefined)).toBeNull();
  });
});

describe('isAllowedUrl (SPEC §7: only http/https)', () => {
  it.each([
    'https://example.com',
    'http://example.com/path?x=1#y',
    'HTTPS://EXAMPLE.COM',
    'https://www.amazon.de/dp/B000',
  ])('accepts %s', (u) => expect(isAllowedUrl(u)).toBe(true));

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://example.com',
    'example.com',
    '//example.com',
    'https://',
    'https://exa mple.com',
    'https://example.com/' + 'x'.repeat(LIMITS.url),
  ])('rejects %s', (u) => expect(isAllowedUrl(u)).toBe(false));
});

describe('domainHint', () => {
  it('shows the bare domain', () => {
    expect(domainHint('https://www.amazon.de/dp/123')).toBe('amazon.de');
    expect(domainHint('http://shop.example.org/x')).toBe('shop.example.org');
  });
  it('is null for missing or unsafe links', () => {
    expect(domainHint(null)).toBeNull();
    expect(domainHint('javascript:alert(1)')).toBeNull();
  });
});

describe('validateGift', () => {
  it('normalizes valid input', () => {
    expect(validateGift({ title: '  Scarf ', url: ' https://x.com ', notes: '   ' })).toEqual({
      ok: true,
      value: { title: 'Scarf', url: 'https://x.com', notes: null },
    });
  });

  it('requires a title within the limit', () => {
    expect(validateGift({ title: '  ' })).toMatchObject({ ok: false, field: 'title' });
    expect(validateGift({ title: 'x'.repeat(201) })).toMatchObject({ ok: false, field: 'title' });
    expect(validateGift({ title: 'x'.repeat(200) }).ok).toBe(true);
  });

  it('rejects bad links and long notes', () => {
    expect(validateGift({ title: 'a', url: 'javascript:alert(1)' })).toMatchObject({ ok: false, field: 'url' });
    expect(validateGift({ title: 'a', notes: 'x'.repeat(1001) })).toMatchObject({ ok: false, field: 'notes' });
  });
});
