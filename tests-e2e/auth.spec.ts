import { test, expect } from '@playwright/test';

test('login page renders', async ({ page }) => {
  await page.goto('/auth');
  await expect(page.getByTestId('login-identifier')).toBeVisible();
  await expect(page.getByTestId('login-password')).toBeVisible();
  await expect(page.getByTestId('login-submit')).toBeVisible();
});

// RBAC / admin flows require real credentials + seeded data.
// Keep a placeholder that can be enabled in CI later.

test.skip('admin can open users page', async ({ page }) => {
  // TODO: set env vars E2E_ADMIN_IDENTIFIER + E2E_ADMIN_PASSWORD
});
