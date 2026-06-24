import { test, expect } from '@playwright/test';

const adminIdentifier = process.env.E2E_ADMIN_IDENTIFIER;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const employeeIdentifier = process.env.E2E_EMPLOYEE_IDENTIFIER;
const employeePassword = process.env.E2E_EMPLOYEE_PASSWORD;

test.describe('RBAC smoke', () => {
  test.skip(!adminIdentifier || !adminPassword || !employeeIdentifier || !employeePassword, 'E2E_* env vars not set');

  test('employee cannot access /users', async ({ page }) => {
    await page.goto('/auth');
    await page.getByTestId('login-identifier').fill(employeeIdentifier!);
    await page.getByTestId('login-password').fill(employeePassword!);
    await page.getByTestId('login-submit').click();

    await page.goto('/users');
    // should not show the user management title
    await expect(page.getByText('User Management')).not.toBeVisible();
  });

  test('admin can access /users', async ({ page }) => {
    await page.goto('/auth');
    await page.getByTestId('login-identifier').fill(adminIdentifier!);
    await page.getByTestId('login-password').fill(adminPassword!);
    await page.getByTestId('login-submit').click();

    await page.goto('/users');
    await expect(page.getByText(/User Management|إدارة المستخدمين/)).toBeVisible();
    await expect(page.getByTestId('users-export-csv-btn')).toBeVisible();
  });
});
