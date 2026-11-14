/**
 * Accounts and families through the UI: signup, onboarding, invite links,
 * password reset (via the local Mailpit inbox), logout, account deletion.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { formMessage, latestEmailTo, login, logout, makeFamily, makeUser } from './helpers';

test('sign up, create a family, invite someone with the link', async ({ page, browser }) => {
  const email = `owner-${randomUUID()}@test.local`;
  await page.goto('/signup');
  await page.getByLabel('Your name').fill('Aunt Sue');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('christmas-2026');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Local Supabase has "confirm email" off, so we land in onboarding.
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Welcome, Aunt Sue!' })).toBeVisible();
  await page.getByLabel('Family name').fill('The Testers');
  await page.getByRole('button', { name: 'Create family' }).click();

  await expect(page).toHaveURL(/\/family/);
  const code = (await page.getByTestId('invite-code').innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  const link = (await page.getByTestId('invite-link').innerText()).trim();
  expect(link).toMatch(new RegExp(`/join/${code}$`));

  // A new relative opens the link on their own device.
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByText(code)).toBeVisible();
  await guest.getByRole('link', { name: /create an account/i }).click();
  await guest.getByLabel('Your name').fill('Cousin Joe');
  await guest.getByLabel('Email').fill(`joe-${randomUUID()}@test.local`);
  await guest.getByLabel('Password').fill('christmas-2026');
  await guest.getByRole('button', { name: 'Create account' }).click();

  // Back on the join page with the code prefilled.
  await expect(guest).toHaveURL(new RegExp(`/join/${code}`));
  await expect(guest.getByLabel('Invite code')).toHaveValue(code);
  await guest.getByRole('button', { name: 'Join family' }).click();
  await expect(guest).toHaveURL(/\/\?joined=1$/);
  await expect(guest.getByRole('link', { name: /Aunt Sue/ })).toBeVisible();
  await ctx.close();

  // The owner now sees the new member.
  await page.reload();
  await expect(page.getByText('Cousin Joe', { exact: true })).toBeVisible();
});

test('regenerating the invite code invalidates the old one', async ({ page }) => {
  const owner = await makeUser('Owner');
  const { code } = await makeFamily(owner);
  await login(page, owner, '/family');
  await page.getByText('Make a new code').first().click();
  await page.getByRole('button', { name: 'Make a new code' }).click();
  await expect(formMessage(page).filter({ hasText: 'New code created' })).toBeVisible();
  await expect(page.getByTestId('invite-code')).not.toHaveText(code);

  const late = await makeUser('Late');
  await logout(page);
  await login(page, late, '/onboarding');
  await page.getByLabel('Invite code').fill(code);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(formMessage(page)).toContainText('doesn’t match any family');
});

test('wrong password shows a friendly message', async ({ page }) => {
  const u = await makeUser('Forgetful');
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(formMessage(page)).toContainText('don’t match');
});

test('forgot password: email link lets you set a new password', async ({ page }) => {
  const u = await makeUser('Grandpa');
  await makeFamily(u);
  await page.goto('/reset-password');
  await page.getByLabel('Email').fill(u.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(formMessage(page)).toContainText('we’ve sent a link');

  const mail = await latestEmailTo(u.email);
  expect(mail.subject).toContain('Reset your Family Christmas password');
  const href = /href="([^"]+)"/.exec(mail.html)![1].replaceAll('&amp;', '&');
  const url = new URL(href);
  expect(url.pathname).toBe('/auth/confirm');

  await page.goto(url.pathname + url.search);
  await expect(page).toHaveURL(/\/reset-password\/update/);
  await page.getByLabel('New password').fill('brand-new-pass');
  await page.getByLabel('Type it again').fill('brand-new-pass');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Your new password is saved.')).toBeVisible();

  await logout(page);
  await login(page, { ...u, password: 'brand-new-pass' });
  await expect(page).toHaveURL(/\/$/);

  // The link is single-use.
  await logout(page);
  await page.goto(url.pathname + url.search);
  await expect(page.getByText('expired or was already used')).toBeVisible();
});

test('signed-out visitors are sent to login and back', async ({ page }) => {
  const u = await makeUser('Visitor');
  await makeFamily(u);
  await page.goto('/shopping');
  await expect(page).toHaveURL(/\/login\?next=%2Fshopping/);
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/shopping$/);
});

test('edit display name, then delete account', async ({ page }) => {
  const owner = await makeUser('Owner');
  const member = await makeUser('Member');
  await makeFamily(owner, member);

  await login(page, member, '/family');
  await page.getByLabel('Your name').fill('Uncle Bob');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(formMessage(page).filter({ hasText: 'Name saved' })).toBeVisible();

  await page.getByRole('heading', { name: 'Delete my account' }).scrollIntoViewIfNeeded();
  await page.locator('section', { hasText: 'Delete my account' }).getByText('Show').click();
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await page.getByRole('button', { name: 'Delete my account forever' }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1/);
  await expect(page.getByText('Your account has been deleted')).toBeVisible();

  // Logging in again fails.
  await page.getByLabel('Email').fill(member.email);
  await page.getByLabel('Password').fill(member.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(formMessage(page)).toContainText('don’t match');
});

test('owner removes a member', async ({ page, browser }) => {
  const owner = await makeUser('Owner');
  const member = await makeUser('Leaving');
  await makeFamily(owner, member);

  await login(page, owner, '/family');
  const row = page.locator('li', { hasText: 'Leaving' });
  await row.getByText('Remove…').click();
  await row.getByRole('button', { name: 'Remove Leaving' }).click();
  await expect(page.locator('li', { hasText: 'Leaving' })).toHaveCount(0);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, member);
  await expect(p2).toHaveURL(/\/onboarding/);
  await ctx.close();
});
