/**
 * Shopping list "Got it" toggle and private note: work for the claimer, and
 * are never visible to the recipient or other family members.
 */
import { expect, test } from '@playwright/test';
import { addGift, claimGift, login, logout, makeFamily, makeUser } from './helpers';

test('got-it toggle and private note are the claimer’s alone', async ({ page }) => {
  const mom = await makeUser('Mom');
  const dad = await makeUser('Dad');
  const kid = await makeUser('Kid');
  await makeFamily(mom, dad, kid);
  const scarf = await addGift(mom, mom, 'Red scarf');
  await addGift(mom, mom, 'Cookbook');
  await claimGift(dad, scarf);

  await login(page, dad, '/shopping');
  const item = page.getByTestId('shopping-item').filter({ hasText: 'Red scarf' });
  await expect(page.getByTestId('got-count')).toHaveText(/Got 0 of 1/);

  // Tick it.
  await item.getByTestId('got-it').click();
  await expect(item.getByTestId('got-it')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('got-count')).toHaveText(/Got 1 of 1/);

  // Add a private note.
  await item.getByRole('button', { name: /Add a note for yourself/ }).click();
  await item.getByLabel(/Your note/).fill('SECRET-NOTE wrapped, in the attic');
  await item.getByRole('button', { name: 'Save note' }).click();
  await expect(item.getByTestId('private-note')).toContainText('SECRET-NOTE wrapped, in the attic');

  // Survives a reload.
  await page.reload();
  await expect(item.getByTestId('got-it')).toHaveAttribute('aria-checked', 'true');
  await expect(item.getByTestId('private-note')).toContainText('SECRET-NOTE');

  // Untick.
  await item.getByTestId('got-it').click();
  await expect(item.getByTestId('got-it')).toHaveAttribute('aria-checked', 'false');

  // Neither the recipient nor another member sees any of it, anywhere.
  for (const who of [mom, kid]) {
    await logout(page);
    await login(page, who);
    for (const path of ['/', '/me', `/people/${mom.id}`, '/shopping']) {
      if (who === mom && path === `/people/${mom.id}`) continue;
      await page.goto(path);
      const html = await page.content();
      expect(html).not.toContain('SECRET-NOTE');
      expect(html).not.toContain('data-testid="got-it"');
      expect(html).not.toContain('private-note');
    }
  }
});
