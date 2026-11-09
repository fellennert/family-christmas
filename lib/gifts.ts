/**
 * Gift input rules, mirrored from the database (supabase/migrations/*_functions.sql).
 * The database is the authority; these exist to give instant, friendly
 * feedback and to render links safely. Unit tested in tests/unit/gifts.test.ts.
 */

export const LIMITS = {
  title: 200,
  notes: 1000,
  url: 2000,
  displayName: 50,
  familyName: 60,
  passwordMin: 8,
} as const;

/** Trim; empty becomes null. */
export function clean(v: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** True for http(s) URLs with a host and no whitespace. */
export function isAllowedUrl(url: string): boolean {
  if (url.length > LIMITS.url || /\s/.test(url)) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '';
  } catch {
    return false;
  }
}

/** "https://www.amazon.de/dp/123" -> "amazon.de". Null if not a valid link. */
export function domainHint(url: string | null | undefined): string | null {
  if (!url || !isAllowedUrl(url)) return null;
  return new URL(url).hostname.replace(/^www\./i, '');
}

export type GiftInput = { title: string; url: string | null; notes: string | null };

export type GiftValidation =
  | { ok: true; value: GiftInput }
  | { ok: false; error: string; field: 'title' | 'url' | 'notes' };

export function validateGift(form: {
  title?: FormDataEntryValue | null;
  url?: FormDataEntryValue | null;
  notes?: FormDataEntryValue | null;
}): GiftValidation {
  const title = clean(form.title);
  if (!title) return { ok: false, field: 'title', error: 'Please give the gift a name.' };
  if (title.length > LIMITS.title)
    return { ok: false, field: 'title', error: `Please keep the name under ${LIMITS.title} characters.` };

  const url = clean(form.url);
  if (url && !isAllowedUrl(url))
    return {
      ok: false,
      field: 'url',
      error: 'Links must start with http:// or https:// (copy it from your browser’s address bar).',
    };

  const notes = clean(form.notes);
  if (notes && notes.length > LIMITS.notes)
    return { ok: false, field: 'notes', error: `Please keep notes under ${LIMITS.notes} characters.` };

  return { ok: true, value: { title, url, notes } };
}
