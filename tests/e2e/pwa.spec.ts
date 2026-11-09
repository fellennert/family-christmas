/**
 * Installable app (SPEC §9a) and §10 item 9: the service worker never keeps
 * personal data, so a shared device can't show one person's lists to another.
 */
import { expect, test } from '@playwright/test';
import {
  addGift,
  cacheEntries,
  claimGift,
  expectOnlySafeCacheEntries,
  login,
  logout,
  makeFamily,
  makeUser,
} from './helpers';

test('manifest makes the app installable', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Family Christmas', display: 'standalone', start_url: '/' });
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBe(true);
});

test('service worker file is served uncached', async ({ request }) => {
  const res = await request.get('/sw.js');
  expect(res.ok()).toBe(true);
  expect(res.headers()['cache-control']).toContain('no-cache');
});

test('§10.9: only static files are cached; a second person on the same device never sees the first person’s data', async ({
  page,
  context,
}) => {
  const mom = await makeUser('Mom');
  const dad = await makeUser('Dad');
  const kid = await makeUser('Kid');
  await makeFamily(mom, dad, kid);
  await addGift(dad, dad, 'DAD-WISH drill');
  const idea = await addGift(mom, kid, 'MOM-SECRET bike for Kid');
  await claimGift(mom, idea);

  // Mom uses the app.
  await login(page, mom);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker
  for (const path of ['/', '/me', `/people/${dad.id}`, `/people/${kid.id}`, '/shopping', '/family']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  await expect(page.getByText('MOM-SECRET bike for Kid')).toBeVisible();
  expectOnlySafeCacheEntries(await cacheEntries(page));
  expect(await cacheEntries(page)).toContain('/offline');

  // Mom logs out; Kid logs in on the same browser.
  await logout(page);
  expectOnlySafeCacheEntries(await cacheEntries(page));
  await login(page, kid);

  // Offline, every page shows only the generic offline screen.
  await context.setOffline(true);
  for (const path of ['/', '/shopping', `/people/${dad.id}`, `/people/${mom.id}`, '/me']) {
    await page.goto(path).catch(() => {});
    await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('MOM-SECRET');
    expect(html).not.toContain('DAD-WISH');
  }
  await context.setOffline(false);

  // Online again, Kid can't see Mom's secret idea for them.
  await page.goto('/me');
  await expect(page.getByText('MOM-SECRET')).toHaveCount(0);
});

test('install instructions are offered (and can be hidden)', async ({ page }) => {
  const u = await makeUser('Phone user');
  await makeFamily(u);
  await login(page, u);
  const help = page.getByTestId('install-help');
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Got it, hide this' }).click();
  await expect(help).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('install-help')).toHaveCount(0);
});
