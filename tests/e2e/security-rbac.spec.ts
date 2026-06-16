import { expect, test } from '@playwright/test';
import { expectNoPrivilegedPage, login } from './helpers/auth';

const adminIdentifier = process.env.E2E_ADMIN_IDENTIFIER;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const employeeIdentifier = process.env.E2E_EMPLOYEE_IDENTIFIER;
const employeePassword = process.env.E2E_EMPLOYEE_PASSWORD;
const auditIdentifier = process.env.E2E_AUDIT_IDENTIFIER;
const auditPassword = process.env.E2E_AUDIT_PASSWORD;

test.describe('security/RBAC smoke validation', () => {
  test.skip(
    !adminIdentifier || !adminPassword || !employeeIdentifier || !employeePassword,
    'Set E2E_ADMIN_IDENTIFIER/E2E_ADMIN_PASSWORD and E2E_EMPLOYEE_IDENTIFIER/E2E_EMPLOYEE_PASSWORD to enable RBAC tests.',
  );

  test('regular employee cannot open privileged administration pages', async ({ page }) => {
    await login(page, employeeIdentifier!, employeePassword!);

    await expectNoPrivilegedPage(page, '/users', /User Management|إدارة المستخدمين/i);
    await expectNoPrivilegedPage(page, '/settings/roles-permissions', /Roles|Permissions|الأدوار|الصلاحيات/i);
    await expectNoPrivilegedPage(page, '/settings/sensitive-access', /Sensitive|حساس/i);
    await expectNoPrivilegedPage(page, '/evaluations', /Create|Initiate|إنشاء|بدء/i);
  });

  test('admin can open user management and role/security areas', async ({ page }) => {
    await login(page, adminIdentifier!, adminPassword!);

    await page.goto('/users');
    await expect(page.getByText(/User Management|إدارة المستخدمين/i)).toBeVisible();

    await page.goto('/settings/roles-permissions');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Roles|Permissions|الأدوار|الصلاحيات/i).first()).toBeVisible();
  });
});

test.describe('audit role smoke validation', () => {
  test.skip(!auditIdentifier || !auditPassword, 'Set E2E_AUDIT_IDENTIFIER/E2E_AUDIT_PASSWORD to enable audit-role checks.');

  test('audit can view reports but should not access user management', async ({ page }) => {
    await login(page, auditIdentifier!, auditPassword!);

    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Reports|Analytics|التقارير|التحليلات/i).first()).toBeVisible();

    await expectNoPrivilegedPage(page, '/users', /User Management|إدارة المستخدمين/i);
  });
});
