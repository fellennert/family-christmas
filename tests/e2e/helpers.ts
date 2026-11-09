/**
 * E2E fixtures: create real users and families quickly through Supabase,
 * then drive the UI with Playwright.
 *
 * Test-only: the service-role key is used here to create confirmed users. The
 * app itself never uses it. Keys come from the env or `supabase status`.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type LocalEnv = { url: string; anonKey: string; serviceKey: string; mailpitUrl: string };

let cached: LocalEnv | null = null;
export function localEnv(): LocalEnv {
  if (cached) return cached;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !anonKey || !serviceKey) {
    const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
    const get = (k: string) => new RegExp(`^${k}="?([^"\\n]+)"?$`, 'm').exec(out)?.[1] ?? '';
    url ||= get('API_URL');
    anonKey ||= get('ANON_KEY');
    serviceKey ||= get('SERVICE_ROLE_KEY');
  }
  cached = { url, anonKey, serviceKey, mailpitUrl: process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324' };
  return cached;
}

export type E2EUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  /** Signed-in supabase-js client acting as this user (through RLS). */
  db: SupabaseClient;
};

/** A confirmed user with a unique email. */
export async function makeUser(name: string): Promise<E2EUser> {
  const env = localEnv();
  const admin = createClient(env.url, env.serviceKey, { auth: { persistSession: false } });
  const email = `e2e-${randomUUID()}@test.local`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw error;

  const db = createClient(env.url, env.anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await db.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user.id, name, email, password, db };
}

async function rpc<T>(u: E2EUser, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await u.db.rpc(fn, args);
  if (error) throw new Error(`${fn} as ${u.name}: ${error.message}`);
  return data as T;
}

export async function makeFamily(owner: E2EUser, ...members: E2EUser[]) {
  await rpc(owner, 'create_family', { p_name: `E2E ${owner.name}'s family` });
  const code = await rpc<string>(owner, 'get_invite_code');
  for (const m of members) await rpc(m, 'join_family', { p_code: code });
  return { code };
}

export const addGift = (by: E2EUser, recipient: E2EUser, title: string, url?: string, notes?: string) =>
  rpc<string>(by, 'add_gift', { p_recipient_id: recipient.id, p_title: title, p_url: url ?? null, p_notes: notes ?? null });

export const claimGift = (by: E2EUser, giftId: string) => rpc<string>(by, 'claim_gift', { p_gift_id: giftId });

/** Log in through the real login form. */
export async function login(page: Page, u: E2EUser, next = '/') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export async function logout(page: Page) {
  await page.goto('/family');
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL(/\/login/);
}

/** Text of a form's success/error message area. */
export const formMessage = (page: Page) => page.locator('form [role=status], form [role=alert]');

/** Every Cache Storage entry (cache name + path). */
export async function cacheEntries(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const u = new URL(req.url);
        out.push(u.pathname + u.search);
      }
    }
    return out;
  });
}

/** Only static, personal-data-free URLs may ever be cached (SPEC §9a). */
export function expectOnlySafeCacheEntries(entries: string[]) {
  const unsafe = entries.filter(
    (e) => !(e.startsWith('/_next/static/') || e.startsWith('/icons/') || e === '/offline'),
  );
  expect(unsafe, 'service worker cached something it must not').toEqual([]);
}

export async function latestEmailTo(address: string): Promise<{ subject: string; html: string }> {
  const { mailpitUrl } = localEnv();
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
    const body = (await res.json()) as { messages?: { ID: string }[] };
    const id = body.messages?.[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${mailpitUrl}/api/v1/message/${id}`)).json()) as { Subject: string; HTML: string };
      return { subject: msg.Subject, html: msg.HTML };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email arrived for ${address}`);
}
