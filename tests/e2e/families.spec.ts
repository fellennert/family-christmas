/**
 * Several families per person: each family has its own lists, and the header
 * switcher changes which one every page shows.
 */
import { expect, test } from '@playwright/test';
import { addGift, claimGift, login, makeFamily, makeUser } from './helpers';

test('someone in two families switches between them; lists never mix', async ({ page }) => {
  const dad = await makeUser('Dad');
  const mom = await makeUser('Mom');
  const inLaw = await makeUser('InLaw');
  const { familyId: home } = await makeFamily(mom, dad);
  const { familyId: inLaws } = await makeFamily(inLaw);

  // Dad joins the in-laws through the UI, with the invite link.
  const code = await inLaw.db.rpc('get_invite_code', { p_family_id: inLaws }).then((r) => r.data as string);
  await login(page, dad, `/join/${code}`);
  await expect(page.getByText('You’ll keep your current family too.')).toBeVisible();
  await page.getByRole('button', { name: 'Join family' }).click();

  // Joining switches to the new family.
  const switcher = page.getByTestId('family-switcher');
  await expect(switcher).toContainText("E2E InLaw's family");
  await expect(page.getByRole('link', { name: /InLaw/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mom/ })).toHaveCount(0);

  // A wish Dad adds here belongs to the in-laws' list only.
  await page.goto('/me');
  const form = page.getByTestId('add-gift-form');
  await form.getByLabel('What is it?').fill('IN-LAWS wish');
  await form.getByRole('button', { name: 'Add to list' }).click();
  await expect(page.getByTestId('my-gift').filter({ hasText: 'IN-LAWS wish' })).toBeVisible();

  // Things in the home family.
  dad.familyId = home;
  mom.familyId = home;
  await addGift(dad, dad, 'HOME wish');
  const momsWish = await addGift(mom, mom, 'Mom HOME wish');
  await claimGift(dad, momsWish);
  await page.reload();
  await expect(page.getByTestId('my-gift')).toHaveCount(1);
  await page.goto('/shopping');
  await expect(page.getByText('Mom HOME wish')).toHaveCount(0);

  // The menu closes on a tap elsewhere and on Escape.
  await switcher.locator('summary').click();
  await expect(switcher).toHaveAttribute('open', '');
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height - 20); // well below the menu
  await expect(switcher).not.toHaveAttribute('open', '');
  await switcher.locator('summary').click();
  await page.keyboard.press('Escape');
  await expect(switcher).not.toHaveAttribute('open', '');

  // Switch to the home family.
  await switcher.locator('summary').click();
  await switcher.getByRole('button', { name: "E2E Mom's family" }).click();
  await expect(switcher).toContainText("E2E Mom's family");
  await expect(page.getByRole('link', { name: /Mom/ })).toBeVisible();
  await page.goto('/me');
  await expect(page.getByTestId('my-gift')).toHaveCount(1);
  await expect(page.getByTestId('my-gift')).toContainText('HOME wish');
  await page.goto('/shopping');
  await expect(page.getByText('Mom HOME wish', { exact: true })).toBeVisible();

  // The in-law, in the other family, sees none of it.
  inLaw.familyId = inLaws;
  const { data: seen } = await inLaw.db.from('gifts').select('title');
  expect((seen ?? []).map((g) => g.title)).toEqual(['IN-LAWS wish']);
});
