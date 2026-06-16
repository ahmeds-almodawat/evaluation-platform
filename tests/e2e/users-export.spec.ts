import { test, expect } from '@playwright/test';

// This is a smoke test scaffold.
// It requires a valid session (admin/super_user/audit) to reach /users.
// Configure these env vars to enable the test locally or in CI:
// - E2E_IDENTIFIER, E2E_PASSWORD
// - Optionally: E2E_BASE_URL

test('users page has Export CSV button (when authenticated)', async ({ page }) => {
  const identifier = process.env.E2E_IDENTIFIER;
  const password = process.env.E2E_PASSWORD;

  test.skip(!identifier || !password, 'E2E credentials not provided');

  await page.goto('/auth');
  await page.getByTestId('login-identifier').fill(identifier!);
  await page.getByTestId('login-password').fill(password!);
  await page.getByTestId('login-submit').click();

  // App redirects; navigate explicitly.
  await page.goto('/users');
  await expect(page.getByTestId('users-export-csv-btn')).toBeVisible();
});
