import { test, expect } from '@playwright/test';

test('login page shows identifier + password fields', async ({ page }) => {
  await page.goto('/auth');

  await expect(page.getByTestId('login-identifier')).toBeVisible();
  await expect(page.getByTestId('login-password')).toBeVisible();
  await expect(page.getByTestId('login-submit')).toBeVisible();
});
