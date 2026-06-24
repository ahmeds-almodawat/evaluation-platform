import { expect, type Page } from '@playwright/test';

export async function login(page: Page, identifier: string, password: string) {
  await page.goto('/auth');
  await page.getByTestId('login-identifier').fill(identifier);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForLoadState('networkidle');
}

export async function expectNoPrivilegedPage(page: Page, path: string, forbiddenText: RegExp | string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(forbiddenText)).toHaveCount(0);
}
