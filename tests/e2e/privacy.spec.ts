/**
 * SPEC §10 items 1-8 through the real UI (the DB-level versions live in
 * tests/db). Each test builds its own family, so tests can run in parallel.
 */
import { expect, test, type Page, type Response } from '@playwright/test';
import { addGift, claimGift, formMessage, login, makeFamily, makeUser } from './helpers';

/** Collects the text of every HTML/RSC response from our own server. */
function recordResponses(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const pending: Promise<string>[] = [];
  page.on('response', (r: Response) => {
    const url = new URL(r.url());
    if (url.origin !== origin) return;
    if (url.pathname.startsWith('/_next/static/')) return; // shared JS bundles
    pending.push(r.text().catch(() => ''));
  });
  return async () => (await Promise.all(pending)).join('\n');
}

const CLAIM_MARKERS = [/claimed by/i, /claimer/i, /gift_edited_after_claim/i, /you’re getting this/i, /i’m getting this/i];

test.describe('recipient privacy', () => {
  test('§10.1 + §10.2: my pages show no claims and no secret ideas, in the page or in network responses', async ({ page, baseURL }) => {
    const mom = await makeUser('Mom');
    const dad = await makeUser('Dad');
    const kid = await makeUser('Kid');
    await makeFamily(mom, dad, kid);
    const scarf = await addGift(mom, mom, 'Red scarf', 'https://shop.example.com/scarf');
    await addGift(mom, mom, 'Cookbook');
    const secret = await addGift(dad, mom, 'SECRET spa voucher');
    await claimGift(kid, scarf);
    await claimGift(dad, secret);

    await login(page, mom);
    const collected = recordResponses(page, baseURL!);
    for (const path of ['/', '/me', '/shopping', '/family']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    await page.goto('/me');
    await expect(page.getByText('Red scarf')).toBeVisible();
    const everything = (await collected()) + (await page.content());

    expect(everything).not.toContain('SECRET spa voucher');
    for (const marker of CLAIM_MARKERS) {
      expect(await page.content()).not.toMatch(marker);
    }
    // The raw /me HTML + RSC payloads contain no claim fields.
    expect(everything).not.toMatch(/claimer_id|gift_edited_after_claim/);
  });

  test('§10.3: my list looks identical before and after someone claims a gift', async ({ page }) => {
    const mom = await makeUser('Mom');
    const dad = await makeUser('Dad');
    await makeFamily(mom, dad);
    await addGift(mom, mom, 'Alpha');
    const beta = await addGift(mom, mom, 'Beta', 'https://example.com/beta', 'Size M');
    await addGift(mom, mom, 'Gamma');

    await login(page, mom, '/me');
    const before = await page.locator('main').innerHTML();

    await claimGift(dad, beta);
    await page.reload();
    const after = await page.locator('main').innerHTML();
    expect(after).toBe(before);
  });

  test('§10.4: deleting a claimed gift looks exactly like deleting an unclaimed one; the claimer is told', async ({ page, browser }) => {
    const mom = await makeUser('Mom');
    const kid = await makeUser('Kid');
    await makeFamily(mom, kid);
    const claimed = await addGift(mom, mom, 'Gift One');
    await addGift(mom, mom, 'Gift Two');
    await claimGift(kid, claimed);

    await login(page, mom, '/me');
    const dialogText = async (title: string) => {
      const card = page.getByTestId('my-gift').filter({ hasText: title });
      await card.getByRole('button', { name: 'Delete' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const text = (await dialog.innerText()).replace(title, '<TITLE>');
      const html = (await dialog.innerHTML()).replaceAll(title, '<TITLE>');
      await dialog.getByRole('button', { name: 'Yes, remove it' }).click();
      await expect(page.getByTestId('my-gift').filter({ hasText: title })).toHaveCount(0);
      return { text, html: html.replace(/[0-9a-f-]{36}/g, '<ID>') };
    };
    const one = await dialogText('Gift One'); // claimed
    const two = await dialogText('Gift Two'); // unclaimed
    expect(one).toEqual(two);
    await expect(page.getByText('Your list is empty')).toBeVisible();

    // The claimer sees the warning and can dismiss it.
    const kidCtx = await browser.newContext();
    const kidPage = await kidCtx.newPage();
    await login(kidPage, kid, '/shopping');
    const item = kidPage.getByTestId('shopping-item').filter({ hasText: 'Gift One' });
    await expect(item).toContainText('Removed from list by Mom');
    await item.getByRole('button', { name: 'Dismiss' }).click();
    await expect(kidPage.getByTestId('shopping-item')).toHaveCount(0);
    await kidCtx.close();
  });

  test('§10.5: other members see claim status and who claimed', async ({ page }) => {
    const mom = await makeUser('Mom');
    const dad = await makeUser('Dad');
    const kid = await makeUser('Kid');
    await makeFamily(mom, dad, kid);
    const scarf = await addGift(mom, mom, 'Red scarf');
    await addGift(mom, mom, 'Cookbook');
    await addGift(kid, mom, 'Photo album');
    await claimGift(kid, scarf);

    await login(page, dad, `/people/${mom.id}`);
    const card = (t: string) => page.getByTestId('person-gift').filter({ hasText: t });
    await expect(card('Red scarf').getByTestId('claim-status')).toHaveText('Claimed by Kid');
    await expect(card('Cookbook').getByTestId('claim-status')).toHaveText('Unclaimed');
    await expect(card('Photo album')).toContainText('Secret idea, added by Kid');

    // Claim and unclaim through the UI.
    await card('Cookbook').getByRole('button', { name: 'I’m getting this' }).click();
    await expect(card('Cookbook').getByTestId('claim-status')).toContainText('You’re getting this');
    await page.goto('/shopping');
    await expect(page.getByTestId('shopping-item').filter({ hasText: 'Cookbook' })).toBeVisible();
    await page.getByRole('button', { name: 'Unclaim' }).click();
    await expect(page.getByTestId('shopping-item')).toHaveCount(0);
  });

  test('§10.6: two people claiming at the same moment: exactly one gets it', async ({ browser }) => {
    const gran = await makeUser('Gran');
    const dad = await makeUser('Dad');
    const kid = await makeUser('Kid');
    await makeFamily(gran, dad, kid);
    await addGift(gran, gran, 'Knitting kit');

    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    await login(pages[0], dad, `/people/${gran.id}`);
    await login(pages[1], kid, `/people/${gran.id}`);

    await Promise.all(pages.map((p) => p.getByRole('button', { name: 'I’m getting this' }).click()));
    const messages = await Promise.all(
      pages.map(async (p) => {
        const msg = p.getByTestId('person-gift').locator('[role=status], [role=alert]');
        await expect(msg).toBeVisible();
        return msg.innerText();
      }),
    );
    expect(messages.filter((m) => m.includes('You’re getting this'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('Someone just claimed this'))).toHaveLength(1);
    await Promise.all(contexts.map((c) => c.close()));
  });

  test('§10.7: people in another family see nothing', async ({ page }) => {
    const mom = await makeUser('Mom');
    const dad = await makeUser('Dad');
    await makeFamily(mom, dad);
    await addGift(mom, mom, 'Private wish');
    const outsider = await makeUser('Outsider');
    await makeFamily(outsider);

    await login(page, outsider);
    await expect(page.getByText('Mom')).toHaveCount(0);
    await page.goto(`/people/${mom.id}`);
    await expect(page.getByRole('heading', { name: 'We couldn’t find that page' })).toBeVisible();
    await expect(page.getByText('Private wish')).toHaveCount(0);
  });

  test('§10.8: no edit/delete on others’ wishes; opening my own page goes to /me', async ({ page }) => {
    const mom = await makeUser('Mom');
    const dad = await makeUser('Dad');
    const kid = await makeUser('Kid');
    await makeFamily(mom, dad, kid);
    await addGift(mom, mom, 'Mom wish');
    await addGift(kid, mom, 'Kid idea');
    await addGift(dad, mom, 'Dad idea');

    await login(page, dad, `/people/${mom.id}`);
    const card = (t: string) => page.getByTestId('person-gift').filter({ hasText: t });
    await expect(card('Mom wish').getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(card('Kid idea').getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(card('Dad idea').getByRole('button', { name: 'Delete' })).toHaveCount(1);

    await page.goto(`/people/${dad.id}`);
    await expect(page).toHaveURL(/\/me$/);
  });

  test('secret ideas: add, edit, delete through the UI', async ({ page }) => {
    const mom = await makeUser('Mom');
    const dad = await makeUser('Dad');
    await makeFamily(mom, dad);

    await login(page, dad, `/people/${mom.id}`);
    const form = page.getByTestId('add-gift-form');
    await form.getByLabel('What is it?').fill('Garden bench');
    await form.getByLabel(/Link/).fill('https://www.example.com/bench');
    await form.getByRole('button', { name: 'Add secret idea' }).click();
    const card = page.getByTestId('person-gift').filter({ hasText: 'Garden bench' });
    await expect(card).toContainText('Secret idea, added by you');
    await expect(card).toContainText('(example.com)');
    await expect(card.getByRole('link', { name: /Garden bench/ })).toHaveAttribute('rel', 'noopener noreferrer');

    await card.getByText('Edit').click();
    await card.getByLabel('What is it?').fill('Garden bench (oak)');
    await card.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByTestId('person-gift').filter({ hasText: 'Garden bench (oak)' })).toBeVisible();

    // Bad link is rejected with a friendly message.
    await form.getByLabel('What is it?').fill('Bad link');
    await form.getByLabel(/Link/).fill('javascript:alert(1)');
    await form.getByRole('button', { name: 'Add secret idea' }).click();
    await expect(formMessage(page).filter({ hasText: /http/ })).toBeVisible();
  });
});
