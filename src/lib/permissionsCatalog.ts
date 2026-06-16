// Central permissions catalog for Roles & Permissions UI.
//
// IMPORTANT:
// - `key` is the stable identifier stored in the DB.
// - Labels are shown in the current UI language.
//
// Keep this list in sync with PermissionCode in `src/hooks/useSupabaseAuth.tsx`.

export type PermissionKey =
  | 'dashboards.department.view'
  | 'dashboards.company.view'
  | 'dashboards.exec.view'
  | 'dashboards.custom.view'
  | 'dashboards.custom.create'
  | 'dashboards.custom.edit'
  | 'dashboards.custom.share'
  | 'dashboards.custom.export'
  | 'reports.view'
  | 'reports.export'
  | 'employees.read'
  | 'departments.manage'
  | 'departments.manage_members'
  | 'users.manage'
  | 'users.create'
  | 'users.update'
  | 'users.archive'
  | 'users.restore'
  | 'users.export'
  | 'users.bulk'
  | 'audit.read'
  | 'templates.manage'
  | 'branding.manage'
  | 'messages.broadcast'
  | 'alerts.view'
  | 'evaluations.manage'
  | 'evaluations.custom.create'
  | 'evaluations.anonymous.manage'
  | 'evaluations.score_breakdown.view'
  | 'evaluations.rater_identity.view'
  | 'evaluations.anonymous.reveal'
  | 'actions.view'
  | 'actions.manage'
  | 'roles.manage';

export type PermissionModule =
  | 'dashboards'
  | 'people'
  | 'users'
  | 'departments'
  | 'evaluations'
  | 'reports'
  | 'messaging'
  | 'audit_system'
  | 'admin';

export type PermissionCatalogItem = {
  key: PermissionKey;
  module: PermissionModule;
  label_en: string;
  label_ar: string;
};

export const PERMISSIONS_CATALOG: PermissionCatalogItem[] = [
  // Dashboards
  { key: 'dashboards.exec.view', module: 'dashboards', label_en: 'View Executive Dashboards', label_ar: 'عرض لوحات الإدارة العليا' },
  { key: 'dashboards.company.view', module: 'dashboards', label_en: 'View Company Dashboard', label_ar: 'عرض لوحة الشركة' },
  { key: 'dashboards.department.view', module: 'dashboards', label_en: 'View Department Dashboard', label_ar: 'عرض لوحة القسم' },
  { key: 'dashboards.custom.view', module: 'dashboards', label_en: 'View Custom Dashboards', label_ar: 'عرض اللوحات المخصصة' },
  { key: 'dashboards.custom.create', module: 'dashboards', label_en: 'Create Custom Dashboards', label_ar: 'إنشاء لوحات مخصصة' },
  { key: 'dashboards.custom.edit', module: 'dashboards', label_en: 'Edit Custom Dashboards', label_ar: 'تعديل اللوحات المخصصة' },
  { key: 'dashboards.custom.share', module: 'dashboards', label_en: 'Share Custom Dashboards', label_ar: 'مشاركة اللوحات المخصصة' },
  { key: 'dashboards.custom.export', module: 'dashboards', label_en: 'Export Custom Dashboards', label_ar: 'تصدير اللوحات المخصصة' },

  // Reports
  { key: 'reports.view', module: 'reports', label_en: 'View Reports', label_ar: 'عرض التقارير' },
  { key: 'reports.export', module: 'reports', label_en: 'Export Reports & Data', label_ar: 'تصدير التقارير والبيانات' },

  // People
  { key: 'employees.read', module: 'people', label_en: 'View Employees', label_ar: 'عرض الموظفين' },

  // Departments
  { key: 'departments.manage', module: 'departments', label_en: 'Manage Departments', label_ar: 'إدارة الأقسام' },
  { key: 'departments.manage_members', module: 'departments', label_en: 'Assign Employees to Departments', label_ar: 'تعيين الموظفين للأقسام' },

  // Users
  { key: 'users.manage', module: 'users', label_en: 'Manage Users', label_ar: 'إدارة المستخدمين' },
  { key: 'users.create', module: 'users', label_en: 'Create Users', label_ar: 'إنشاء مستخدمين' },
  { key: 'users.update', module: 'users', label_en: 'Edit Users', label_ar: 'تعديل المستخدمين' },
  { key: 'users.archive', module: 'users', label_en: 'Archive Users', label_ar: 'أرشفة المستخدمين' },
  { key: 'users.restore', module: 'users', label_en: 'Restore Users', label_ar: 'استرجاع المستخدمين' },
  { key: 'users.export', module: 'users', label_en: 'Export Users', label_ar: 'تصدير المستخدمين' },
  { key: 'users.bulk', module: 'users', label_en: 'Bulk Actions on Users', label_ar: 'إجراءات جماعية للمستخدمين' },

  // Evaluations
  { key: 'evaluations.manage', module: 'evaluations', label_en: 'Manage Evaluations', label_ar: 'إدارة التقييمات' },
  { key: 'evaluations.custom.create', module: 'evaluations', label_en: 'Create Custom Evaluation', label_ar: 'إنشاء تقييم مخصص' },
  { key: 'evaluations.anonymous.manage', module: 'evaluations', label_en: 'Manage Anonymous Evaluations', label_ar: 'إدارة التقييمات المجهولة' },
  { key: 'evaluations.score_breakdown.view', module: 'evaluations', label_en: 'View score breakdown (per period)', label_ar: 'عرض تفصيل احتساب الدرجة (لكل فترة)' },
  { key: 'evaluations.rater_identity.view', module: 'evaluations', label_en: 'View rater identities & answers (per period)', label_ar: 'عرض هوية المقيم وإجاباته (لكل فترة)' },
  { key: 'evaluations.anonymous.reveal', module: 'evaluations', label_en: 'Sensitive: reveal who rated whom', label_ar: 'صلاحية حساسة: كشف من قيّم من' },

  // Messaging
  { key: 'messages.broadcast', module: 'messaging', label_en: 'Broadcast Messages', label_ar: 'إرسال رسائل جماعية' },
  { key: 'alerts.view', module: 'messaging', label_en: 'View Alerts', label_ar: 'عرض التنبيهات' },

  // Audit & System
  { key: 'audit.read', module: 'audit_system', label_en: 'View Audit Logs', label_ar: 'عرض سجل التدقيق' },

  // Branding
  { key: 'branding.manage', module: 'admin', label_en: 'Manage Branding', label_ar: 'إدارة الهوية البصرية' },
  { key: 'templates.manage', module: 'admin', label_en: 'Manage Templates', label_ar: 'إدارة القوالب' },
  { key: 'actions.view', module: 'admin', label_en: 'View Action Tickets', label_ar: 'عرض التذاكر' },
  { key: 'actions.manage', module: 'admin', label_en: 'Manage Action Tickets', label_ar: 'إدارة التذاكر' },

  // RBAC Admin
  { key: 'roles.manage', module: 'admin', label_en: 'Manage Roles & Permissions', label_ar: 'إدارة الأدوار والصلاحيات' },
];

export const PERMISSION_MODULES_ORDER: { id: PermissionModule; title_en: string; title_ar: string }[] = [
  { id: 'dashboards', title_en: 'Dashboards', title_ar: 'لوحات المتابعة' },
  { id: 'people', title_en: 'People', title_ar: 'الموظفون' },
  { id: 'departments', title_en: 'Departments', title_ar: 'الأقسام' },
  { id: 'users', title_en: 'Users', title_ar: 'المستخدمون' },
  { id: 'evaluations', title_en: 'Evaluations', title_ar: 'التقييمات' },
  { id: 'reports', title_en: 'Reports', title_ar: 'التقارير' },
  { id: 'messaging', title_en: 'Messaging', title_ar: 'الرسائل والتنبيهات' },
  { id: 'audit_system', title_en: 'Audit & System', title_ar: 'التدقيق والنظام' },
  { id: 'admin', title_en: 'Administration', title_ar: 'الإدارة' },
];