export type BackupKind = "setup" | "operational" | "full_public";

export type BackupTarget = {
  key: string;
  table: string;
  labelEn: string;
  labelAr: string;
  group: "setup" | "evaluations" | "communication" | "dashboard" | "audit" | "integration" | "system";
  select?: string;
  onConflict?: string;
  deleteColumn?: string;
  backupKinds: BackupKind[];
  restoreOrder: number;
  sensitive?: boolean;
  authDependent?: boolean;
  notesEn?: string;
  notesAr?: string;
};

export type BackupBundleV2 = {
  version: 2;
  source: "export_center";
  backupKind: BackupKind;
  generatedAtIso: string;
  app: "evaluation-platform";
  warnings: string[];
  tables: Array<{
    key: string;
    table: string;
    rows: Record<string, unknown>[];
  }>;
  manifest: {
    tableCount: number;
    totalRows: number;
    tables: Array<{
      key: string;
      table: string;
      rows: number;
      group: BackupTarget["group"];
      sensitive?: boolean;
      authDependent?: boolean;
    }>;
  };
};

export type LegacyRestoreBundleV1 = {
  version: 1;
  generatedAtIso: string;
  source: "export_center";
  tables: Array<{ key: string; table: string; rows: Record<string, unknown>[] }>;
};

export const BACKUP_KIND_LABELS: Record<BackupKind, { en: string; ar: string; descriptionEn: string; descriptionAr: string }> = {
  setup: {
    en: "Setup Baseline Backup",
    ar: "نسخة إعدادات أساسية",
    descriptionEn: "Departments, units/stations, manager assignments, profiles, roles, permissions, templates, branding and settings. Best for repeating tests without re-entering structure.",
    descriptionAr: "الأقسام، الوحدات/المحطات، توزيع المدراء، الملفات، الأدوار، الصلاحيات، القوالب، الهوية والإعدادات. الأفضل لتكرار الاختبارات بدون إعادة إدخال الهيكل.",
  },
  operational: {
    en: "Operational Backup",
    ar: "نسخة تشغيلية",
    descriptionEn: "Setup data plus evaluations, campaigns, answers, messages, notifications, tickets and dashboards.",
    descriptionAr: "بيانات الإعداد بالإضافة إلى التقييمات والحملات والإجابات والرسائل والتنبيهات والتذاكر واللوحات.",
  },
  full_public: {
    en: "Full Public Data Backup",
    ar: "نسخة كاملة لبيانات التطبيق",
    descriptionEn: "All supported public application tables, including audit/integration/system tables. Does not include Supabase Auth passwords or Storage files.",
    descriptionAr: "جميع جداول التطبيق العامة المدعومة، بما فيها التدقيق والتكامل والنظام. لا تشمل كلمات مرور Supabase Auth أو ملفات التخزين.",
  },
};

const ALL_KINDS: BackupKind[] = ["setup", "operational", "full_public"];
const OPERATIONAL_AND_FULL: BackupKind[] = ["operational", "full_public"];
const FULL_ONLY: BackupKind[] = ["full_public"];

export const BACKUP_TARGETS: BackupTarget[] = [
  // Core setup and people structure
  { key: "departments", table: "departments", labelEn: "Departments", labelAr: "الأقسام", group: "setup", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 10 },
  { key: "org_units", table: "org_units", labelEn: "Units / Stations", labelAr: "الوحدات / المحطات", group: "setup", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 20 },
  { key: "profiles", table: "profiles", labelEn: "Employees / Profiles", labelAr: "الموظفين / الملفات", group: "setup", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 30, authDependent: true, notesEn: "Requires matching Supabase Auth users when restoring.", notesAr: "تحتاج وجود مستخدمي Supabase Auth المطابقين عند الاستعادة." },
  { key: "user_roles", table: "user_roles", labelEn: "User Roles", labelAr: "أدوار المستخدمين", group: "setup", onConflict: "user_id,role", deleteColumn: "user_id", backupKinds: ALL_KINDS, restoreOrder: 40, authDependent: true },
  { key: "role_permissions", table: "role_permissions", labelEn: "Role Permissions", labelAr: "صلاحيات الأدوار", group: "setup", onConflict: "role,permission", deleteColumn: "role", backupKinds: ALL_KINDS, restoreOrder: 50 },
  { key: "user_permissions", table: "user_permissions", labelEn: "User Permission Overrides", labelAr: "استثناءات صلاحيات المستخدمين", group: "setup", onConflict: "user_id,permission", deleteColumn: "user_id", backupKinds: ALL_KINDS, restoreOrder: 60, authDependent: true },
  { key: "custom_roles", table: "custom_roles", labelEn: "Custom Roles", labelAr: "الأدوار المخصصة", group: "setup", onConflict: "role_key", deleteColumn: "role_key", backupKinds: ALL_KINDS, restoreOrder: 70 },
  { key: "custom_role_permissions", table: "custom_role_permissions", labelEn: "Custom Role Permissions", labelAr: "صلاحيات الأدوار المخصصة", group: "setup", onConflict: "role_key,permission", deleteColumn: "role_key", backupKinds: ALL_KINDS, restoreOrder: 80 },
  { key: "user_custom_roles", table: "user_custom_roles", labelEn: "User Custom Roles", labelAr: "الأدوار المخصصة للمستخدمين", group: "setup", onConflict: "user_id", deleteColumn: "user_id", backupKinds: ALL_KINDS, restoreOrder: 90, authDependent: true },
  { key: "manager_unit_assignments", table: "manager_unit_assignments", labelEn: "Manager Assignments", labelAr: "توزيع المدراء", group: "setup", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 100, authDependent: true },
  { key: "department_links", table: "department_links", labelEn: "Department Links", labelAr: "روابط الأقسام", group: "setup", onConflict: "source_department_id,target_department_id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 110 },

  // Templates and evaluation setup
  { key: "evaluation_templates", table: "evaluation_templates", labelEn: "Evaluation Templates", labelAr: "قوالب التقييم", group: "setup", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 120 },
  { key: "evaluation_template_questions", table: "evaluation_template_questions", labelEn: "Template Questions", labelAr: "أسئلة القوالب", group: "setup", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 130 },
  { key: "evaluation_questions", table: "evaluation_questions", labelEn: "Legacy Evaluation Questions", labelAr: "أسئلة التقييم القديمة", group: "setup", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 140 },

  // Settings / branding
  { key: "branding_settings", table: "branding_settings", labelEn: "Branding Settings", labelAr: "إعدادات الهوية", group: "system", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 150 },
  { key: "branding_pages", table: "branding_pages", labelEn: "Branding Page Overrides", labelAr: "تخصيص صفحات الهوية", group: "system", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 160 },
  { key: "user_settings", table: "user_settings", labelEn: "User Settings", labelAr: "إعدادات المستخدمين", group: "system", onConflict: "user_id", deleteColumn: "user_id", backupKinds: ALL_KINDS, restoreOrder: 170, authDependent: true },
  { key: "dashboard_flags", table: "dashboard_flags", labelEn: "Dashboard Flags", labelAr: "علامات اللوحات", group: "dashboard", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 180, authDependent: true },
  { key: "saved_filters", table: "saved_filters", labelEn: "Saved Filters", labelAr: "الفلاتر المحفوظة", group: "dashboard", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 190, authDependent: true },
  { key: "custom_dashboards", table: "custom_dashboards", labelEn: "Custom Dashboards", labelAr: "لوحات مخصصة", group: "dashboard", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 200, authDependent: true },
  { key: "custom_dashboard_widgets", table: "custom_dashboard_widgets", labelEn: "Custom Dashboard Widgets", labelAr: "ويدجت اللوحات المخصصة", group: "dashboard", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 210 },
  { key: "custom_dashboard_shares", table: "custom_dashboard_shares", labelEn: "Custom Dashboard Shares", labelAr: "مشاركة اللوحات المخصصة", group: "dashboard", onConflict: "id", deleteColumn: "id", backupKinds: ALL_KINDS, restoreOrder: 220, authDependent: true },

  // Operational evaluation data
  { key: "evaluation_campaigns", table: "evaluation_campaigns", labelEn: "Evaluation Campaigns", labelAr: "حملات التقييم", group: "evaluations", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 300, authDependent: true },
  { key: "evaluations", table: "evaluations", labelEn: "Evaluations", labelAr: "التقييمات", group: "evaluations", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 310, authDependent: true },
  { key: "evaluation_answers", table: "evaluation_answers", labelEn: "Evaluation Answers", labelAr: "إجابات التقييم", group: "evaluations", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 320 },
  { key: "evaluation_drafts", table: "evaluation_drafts", labelEn: "Evaluation Drafts", labelAr: "مسودات التقييم", group: "evaluations", onConflict: "evaluation_id,evaluator_id", deleteColumn: "evaluation_id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 330, authDependent: true },
  { key: "anonymous_evaluations", table: "anonymous_evaluations", labelEn: "Anonymous Evaluations", labelAr: "التقييمات المجهولة", group: "evaluations", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 340, authDependent: true },
  { key: "anonymous_evaluation_recipients", table: "anonymous_evaluation_recipients", labelEn: "Anonymous Recipients", labelAr: "مستلمو التقييم المجهول", group: "evaluations", onConflict: "evaluation_id,user_id", deleteColumn: "evaluation_id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 350, authDependent: true },
  { key: "anonymous_evaluation_responses", table: "anonymous_evaluation_responses", labelEn: "Anonymous Responses", labelAr: "ردود التقييم المجهول", group: "evaluations", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 360, sensitive: true },
  { key: "anonymous_evaluation_drafts", table: "anonymous_evaluation_drafts", labelEn: "Anonymous Drafts", labelAr: "مسودات التقييم المجهول", group: "evaluations", onConflict: "evaluation_id,responder_id", deleteColumn: "evaluation_id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 370, authDependent: true },
  { key: "anonymous_evaluation_secrets", table: "anonymous_evaluation_secrets", labelEn: "Anonymous Evaluation Secrets", labelAr: "أسرار التقييم المجهول", group: "evaluations", onConflict: "evaluation_id", deleteColumn: "evaluation_id", backupKinds: FULL_ONLY, restoreOrder: 380, sensitive: true, notesEn: "Sensitive anonymity lookup table. Export only for full backup testing.", notesAr: "جدول حساس لكشف/ربط المجهولية. يصدر فقط في النسخة الكاملة للاختبار." },
  { key: "custom_evaluation_send_events", table: "custom_evaluation_send_events", labelEn: "Custom Evaluation Send Events", labelAr: "أحداث إرسال التقييمات المخصصة", group: "evaluations", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 390, authDependent: true },
  { key: "monthly_employee_scores", table: "monthly_employee_scores", labelEn: "Monthly Employee Scores", labelAr: "درجات الموظفين الشهرية", group: "evaluations", onConflict: "period,employee_id,evaluation_type", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 400, authDependent: true },
  { key: "monthly_department_scores", table: "monthly_department_scores", labelEn: "Monthly Department Scores", labelAr: "درجات الأقسام الشهرية", group: "evaluations", onConflict: "period,department_id,evaluation_type", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 410 },
  { key: "monthly_unit_scores", table: "monthly_unit_scores", labelEn: "Monthly Unit Scores", labelAr: "درجات الوحدات الشهرية", group: "evaluations", onConflict: "period,unit_id,evaluation_type", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 420 },

  // Communication and action follow-up
  { key: "messages", table: "messages", labelEn: "Messages", labelAr: "الرسائل", group: "communication", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 500, authDependent: true },
  { key: "message_recipients", table: "message_recipients", labelEn: "Message Recipients", labelAr: "مستلمو الرسائل", group: "communication", onConflict: "message_id,recipient_id", deleteColumn: "message_id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 510, authDependent: true },
  { key: "notifications", table: "notifications", labelEn: "Notifications", labelAr: "الإشعارات", group: "communication", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 520, authDependent: true },
  { key: "action_tickets", table: "action_tickets", labelEn: "Action Tickets", labelAr: "تذاكر المتابعة", group: "communication", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 530, authDependent: true },
  { key: "action_ticket_targets", table: "action_ticket_targets", labelEn: "Action Ticket Targets", labelAr: "أهداف تذاكر المتابعة", group: "communication", onConflict: "id", deleteColumn: "id", backupKinds: OPERATIONAL_AND_FULL, restoreOrder: 540 },

  // Audit, integrations, and internal system tables
  { key: "audit_logs", table: "audit_logs", labelEn: "Audit Logs", labelAr: "سجل التدقيق", group: "audit", onConflict: "id", deleteColumn: "id", backupKinds: FULL_ONLY, restoreOrder: 600, sensitive: true, authDependent: true },
  { key: "audit_events", table: "audit_events", labelEn: "Audit Events", labelAr: "أحداث التدقيق", group: "audit", onConflict: "id", deleteColumn: "id", backupKinds: FULL_ONLY, restoreOrder: 610, sensitive: true, authDependent: true },
  { key: "admin_allowlist", table: "admin_allowlist", labelEn: "Admin Allowlist", labelAr: "قائمة المسؤولين المسموحين", group: "system", onConflict: "id", deleteColumn: "id", backupKinds: FULL_ONLY, restoreOrder: 620, sensitive: true },
  { key: "external_mappings", table: "external_mappings", labelEn: "External Mappings", labelAr: "ربط الأنظمة الخارجية", group: "integration", onConflict: "system,entity_type,entity_id", deleteColumn: "id", backupKinds: FULL_ONLY, restoreOrder: 630 },
  { key: "integration_clients", table: "integration_clients", labelEn: "Integration Clients", labelAr: "عملاء التكامل", group: "integration", onConflict: "client_id", deleteColumn: "client_id", backupKinds: FULL_ONLY, restoreOrder: 640, sensitive: true },
  { key: "api_idempotency", table: "api_idempotency", labelEn: "API Idempotency", labelAr: "منع تكرار طلبات API", group: "integration", onConflict: "client_id,key", deleteColumn: "id", backupKinds: FULL_ONLY, restoreOrder: 650 },
  { key: "export_history", table: "export_history", labelEn: "Server Export History", labelAr: "سجل التصدير الخادمي", group: "system", onConflict: "id", deleteColumn: "id", backupKinds: FULL_ONLY, restoreOrder: 660, authDependent: true },
];

export const BACKUP_TARGET_BY_TABLE = new Map(BACKUP_TARGETS.map((t) => [t.table, t]));

export function getBackupTargets(kind: BackupKind) {
  return BACKUP_TARGETS.filter((t) => t.backupKinds.includes(kind)).sort((a, b) => a.restoreOrder - b.restoreOrder);
}

export function getRestoreTargetsForBundle(tables: string[]) {
  const set = new Set(tables);
  return BACKUP_TARGETS.filter((t) => set.has(t.table)).sort((a, b) => a.restoreOrder - b.restoreOrder);
}

export function getDeleteOrderForBundle(tables: string[]) {
  return getRestoreTargetsForBundle(tables).slice().sort((a, b) => b.restoreOrder - a.restoreOrder);
}

export function buildBackupManifest(kind: BackupKind, tables: BackupBundleV2["tables"]): BackupBundleV2["manifest"] {
  const manifestTables = tables.map((t) => {
    const target = BACKUP_TARGET_BY_TABLE.get(t.table);
    return {
      key: t.key,
      table: t.table,
      rows: t.rows.length,
      group: target?.group ?? "system",
      sensitive: target?.sensitive,
      authDependent: target?.authDependent,
    };
  });
  return {
    tableCount: manifestTables.length,
    totalRows: manifestTables.reduce((sum, item) => sum + item.rows, 0),
    tables: manifestTables,
  };
}

export function makeBackupWarnings(kind: BackupKind) {
  const warnings = [
    "This backup contains public application tables only. It does not include Supabase Auth passwords, auth.users, or Storage bucket files.",
    "For a true disaster-recovery backup, also keep CLI/database backups outside the browser.",
  ];
  if (kind === "full_public") {
    warnings.push("Full Public Data Backup may include sensitive audit, anonymous-evaluation, integration, and allowlist data. Store it securely.");
  }
  return warnings;
}


export type BackupHealthSeverity = "info" | "warning" | "danger";

export type BackupHealthIssue = {
  id: string;
  severity: BackupHealthSeverity;
  group: "structure" | "users" | "roles" | "evaluations" | "restore" | "backup";
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
  count?: number;
};

function getRowsFromBundleTables(
  tables: BackupBundleV2["tables"] | LegacyRestoreBundleV1["tables"],
  tableName: string,
): Record<string, unknown>[] {
  return (tables.find((table) => table.table === tableName)?.rows ?? []) as Record<string, unknown>[];
}

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function pushHealthIssue(issues: BackupHealthIssue[], issue: BackupHealthIssue) {
  if (!issues.some((existing) => existing.id === issue.id)) issues.push(issue);
}

export function analyzeBackupHealth(
  tables: BackupBundleV2["tables"] | LegacyRestoreBundleV1["tables"],
): BackupHealthIssue[] {
  const issues: BackupHealthIssue[] = [];
  const departments = getRowsFromBundleTables(tables, "departments");
  const orgUnits = getRowsFromBundleTables(tables, "org_units");
  const profiles = getRowsFromBundleTables(tables, "profiles");
  const managerAssignments = getRowsFromBundleTables(tables, "manager_unit_assignments");
  const customRoles = getRowsFromBundleTables(tables, "custom_roles");
  const customRolePermissions = getRowsFromBundleTables(tables, "custom_role_permissions");
  const rolePermissions = getRowsFromBundleTables(tables, "role_permissions");
  const evaluationQuestions = getRowsFromBundleTables(tables, "evaluation_questions");

  const departmentsById = new Map(departments.map((row) => [String(row.id), row]));
  const activeUnits = orgUnits.filter((row) => row.is_active !== false);
  const unitsById = new Map(orgUnits.map((row) => [String(row.id), row]));
  const activeUnitIds = new Set(activeUnits.map((row) => String(row.id)));
  const profilesById = new Map(profiles.map((row) => [String(row.id), row]));

  const activeCodeBuckets = new Map<string, Record<string, unknown>[]>();
  const allCodeBuckets = new Map<string, Record<string, unknown>[]>();
  for (const unit of orgUnits) {
    const code = normalizeCode(unit.code);
    if (!code) continue;
    const key = `${unit.department_id || "none"}::${code}`;
    allCodeBuckets.set(key, [...(allCodeBuckets.get(key) ?? []), unit]);
    if (unit.is_active !== false) {
      activeCodeBuckets.set(key, [...(activeCodeBuckets.get(key) ?? []), unit]);
    }
  }

  const duplicateActiveCodes = [...activeCodeBuckets.values()].filter((items) => items.length > 1);
  if (duplicateActiveCodes.length > 0) {
    pushHealthIssue(issues, {
      id: "duplicate-active-unit-codes",
      severity: "danger",
      group: "structure",
      titleEn: "Duplicate active unit/station codes",
      titleAr: "أكواد وحدات/محطات نشطة مكررة",
      messageEn: `${duplicateActiveCodes.length} active department/code group(s) are duplicated. Restore or campaign creation may fail until codes are corrected.`,
      messageAr: `يوجد ${duplicateActiveCodes.length} مجموعة قسم/كود مكررة في وحدات نشطة. قد تفشل الاستعادة أو إنشاء الحملات حتى يتم تصحيح الأكواد.`,
      count: duplicateActiveCodes.length,
    });
  }

  const inactiveActiveConflicts = [...allCodeBuckets.values()].filter((items) => {
    const active = items.filter((item) => item.is_active !== false).length;
    const inactive = items.filter((item) => item.is_active === false).length;
    return active > 0 && inactive > 0;
  });
  if (inactiveActiveConflicts.length > 0) {
    pushHealthIssue(issues, {
      id: "inactive-active-code-conflicts",
      severity: "warning",
      group: "structure",
      titleEn: "Inactive unit uses an active unit code",
      titleAr: "وحدة معطلة تستخدم كود وحدة نشطة",
      messageEn: `${inactiveActiveConflicts.length} inactive/active unit code conflict(s) found. This is allowed by the new active-only rule, but should be cleaned before final baseline backups.`,
      messageAr: `يوجد ${inactiveActiveConflicts.length} تعارض كود بين وحدات معطلة ونشطة. هذا مسموح بقاعدة النشط فقط، لكن الأفضل تنظيفه قبل النسخة الأساسية النهائية.`,
      count: inactiveActiveConflicts.length,
    });
  }

  const misspelledOutpatient = orgUnits.filter((row) => /OUT\s*PAI?TIENT/i.test(String(row.name_en ?? "")) || /OUTPAITENT/i.test(String(row.name_en ?? "")) || /OUT PAITENT/i.test(String(row.name_en ?? "")));
  if (misspelledOutpatient.length > 0) {
    pushHealthIssue(issues, {
      id: "outpatient-spelling",
      severity: "warning",
      group: "structure",
      titleEn: "OUTPATIENT spelling needs review",
      titleAr: "مراجعة تهجئة OUTPATIENT",
      messageEn: `${misspelledOutpatient.length} unit/station name(s) look like OUT PAITENT/OUTPAITENT. Use OUTPATIENT - NURSING.`,
      messageAr: `يوجد ${misspelledOutpatient.length} اسم وحدة/محطة يبدو مكتوبًا OUT PAITENT/OUTPAITENT. استخدم OUTPATIENT - NURSING.`,
      count: misspelledOutpatient.length,
    });
  }

  const unitsByDepartment = new Map<string, Record<string, unknown>[]>();
  for (const unit of activeUnits) {
    const deptId = String(unit.department_id ?? "");
    unitsByDepartment.set(deptId, [...(unitsByDepartment.get(deptId) ?? []), unit]);
  }

  const profilesWithoutDepartment = profiles.filter((row) => !row.department_id && row.is_active !== false);
  if (profilesWithoutDepartment.length > 0) {
    pushHealthIssue(issues, {
      id: "profiles-without-department",
      severity: "warning",
      group: "users",
      titleEn: "Active profiles without department",
      titleAr: "ملفات نشطة بدون قسم",
      messageEn: `${profilesWithoutDepartment.length} active profile(s) do not have a department. They will not participate in department/station campaigns.`,
      messageAr: `${profilesWithoutDepartment.length} ملف نشط بدون قسم. لن يشاركوا في حملات القسم/المحطة.`,
      count: profilesWithoutDepartment.length,
    });
  }

  const employeesMissingUnits = profiles.filter((row) => {
    if (row.is_active === false) return false;
    const deptId = String(row.department_id ?? "");
    return unitsByDepartment.has(deptId) && !row.unit_id;
  });
  if (employeesMissingUnits.length > 0) {
    pushHealthIssue(issues, {
      id: "employees-without-stations",
      severity: "warning",
      group: "users",
      titleEn: "Employees without station in a unit-based department",
      titleAr: "موظفون بدون محطة في قسم يستخدم الوحدات",
      messageEn: `${employeesMissingUnits.length} active employee(s) are in departments with units/stations but have no unit assigned. Self Station campaigns skip them.`,
      messageAr: `${employeesMissingUnits.length} موظف نشط داخل أقسام بها وحدات/محطات لكن بدون وحدة. حملات التقييم الذاتي للمحطة ستتخطاهم.`,
      count: employeesMissingUnits.length,
    });
  }

  const unitEmployeeCounts = new Map<string, number>();
  for (const profile of profiles) {
    if (profile.is_active === false || !profile.unit_id) continue;
    const unitId = String(profile.unit_id);
    unitEmployeeCounts.set(unitId, (unitEmployeeCounts.get(unitId) ?? 0) + 1);
  }
  const emptyActiveUnits = activeUnits.filter((unit) => (unitEmployeeCounts.get(String(unit.id)) ?? 0) === 0);
  if (emptyActiveUnits.length > 0) {
    pushHealthIssue(issues, {
      id: "stations-with-no-employees",
      severity: "info",
      group: "structure",
      titleEn: "Active stations with no employees",
      titleAr: "محطات نشطة بدون موظفين",
      messageEn: `${emptyActiveUnits.length} active unit/station(s) have no employees. They will produce no peer forms.`,
      messageAr: `${emptyActiveUnits.length} وحدة/محطة نشطة بدون موظفين. لن تنتج نماذج تقييم زملاء.`,
      count: emptyActiveUnits.length,
    });
  }

  const activeManagerAssignments = managerAssignments.filter((row) => row.is_active !== false);
  const departmentHasDepartmentManager = new Set(
    activeManagerAssignments
      .filter((row) => row.assignment_scope === "department")
      .map((row) => String(row.department_id)),
  );
  const unitManagerUnitIds = new Set(
    activeManagerAssignments
      .filter((row) => row.assignment_scope === "unit" && row.unit_id)
      .map((row) => String(row.unit_id)),
  );
  const stationsWithoutManagers = activeUnits.filter((unit) => {
    const deptId = String(unit.department_id ?? "");
    return !departmentHasDepartmentManager.has(deptId) && !unitManagerUnitIds.has(String(unit.id));
  });
  if (stationsWithoutManagers.length > 0) {
    pushHealthIssue(issues, {
      id: "stations-without-manager-assignments",
      severity: "warning",
      group: "structure",
      titleEn: "Stations without manager assignment",
      titleAr: "محطات بدون تعيين مدير",
      messageEn: `${stationsWithoutManagers.length} active station(s) have no unit manager and no department-level manager assignment. Manager→Team and Team→Manager campaigns will not cover them.`,
      messageAr: `${stationsWithoutManagers.length} محطة نشطة بدون مدير وحدة وبدون تعيين مدير على كامل القسم. حملات المدير→الفريق والفريق→المدير لن تغطيها.`,
      count: stationsWithoutManagers.length,
    });
  }

  const managerAssignmentsToInactiveUnits = activeManagerAssignments.filter((row) => row.unit_id && !activeUnitIds.has(String(row.unit_id)));
  if (managerAssignmentsToInactiveUnits.length > 0) {
    pushHealthIssue(issues, {
      id: "manager-assigned-to-inactive-unit",
      severity: "danger",
      group: "structure",
      titleEn: "Manager assigned to inactive/missing station",
      titleAr: "مدير معين على محطة معطلة/غير موجودة",
      messageEn: `${managerAssignmentsToInactiveUnits.length} active manager assignment(s) target inactive or missing units.`,
      messageAr: `${managerAssignmentsToInactiveUnits.length} تعيين مدير نشط مرتبط بوحدة معطلة أو غير موجودة.`,
      count: managerAssignmentsToInactiveUnits.length,
    });
  }

  const managerAssignmentsToWrongDepartment = activeManagerAssignments.filter((row) => {
    if (!row.unit_id) return false;
    const unit = unitsById.get(String(row.unit_id));
    return unit && String(unit.department_id) !== String(row.department_id);
  });
  if (managerAssignmentsToWrongDepartment.length > 0) {
    pushHealthIssue(issues, {
      id: "manager-assigned-to-wrong-department-unit",
      severity: "danger",
      group: "structure",
      titleEn: "Manager assignment unit belongs to another department",
      titleAr: "تعيين مدير لوحدة تتبع قسمًا آخر",
      messageEn: `${managerAssignmentsToWrongDepartment.length} manager assignment(s) point to a unit from a different department.`,
      messageAr: `${managerAssignmentsToWrongDepartment.length} تعيين مدير يشير إلى وحدة تتبع قسمًا مختلفًا.`,
      count: managerAssignmentsToWrongDepartment.length,
    });
  }

  const managerMissingProfile = activeManagerAssignments.filter((row) => !profilesById.has(String(row.manager_id)));
  if (managerMissingProfile.length > 0) {
    pushHealthIssue(issues, {
      id: "manager-profile-missing",
      severity: "danger",
      group: "users",
      titleEn: "Manager assignment has missing profile",
      titleAr: "تعيين مدير بدون ملف موظف",
      messageEn: `${managerMissingProfile.length} manager assignment(s) refer to missing profile IDs.`,
      messageAr: `${managerMissingProfile.length} تعيين مدير يشير إلى ملفات غير موجودة.`,
      count: managerMissingProfile.length,
    });
  }

  const hasAdmin0 = customRoles.some((row) => String(row.role_key) === "admin0");
  if (hasAdmin0) {
    pushHealthIssue(issues, {
      id: "legacy-admin0-role",
      severity: "warning",
      group: "roles",
      titleEn: "Legacy admin0 role exists",
      titleAr: "يوجد دور admin0 قديم",
      messageEn: "The legacy admin0 custom role exists. Remove it before production if it is not intentionally used.",
      messageAr: "يوجد دور مخصص قديم باسم admin0. احذفه قبل الإنتاج إذا لم يكن مستخدمًا عمدًا.",
    });
  }

  const hasTestRole = customRoles.some((row) => String(row.role_key) === "test");
  if (hasTestRole) {
    pushHealthIssue(issues, {
      id: "test-hr-manager-role",
      severity: "warning",
      group: "roles",
      titleEn: "Test / HR Manager role exists",
      titleAr: "يوجد دور تجريبي / مدير موارد بشرية",
      messageEn: "A custom role with key test exists. Confirm its permissions before production or remove it from the baseline.",
      messageAr: "يوجد دور مخصص بمفتاح test. راجع صلاحياته قبل الإنتاج أو احذفه من النسخة الأساسية.",
    });
  }

  const superUserScoreBreakdown = customRolePermissions.some((row) => String(row.role_key) === "super_user" && String(row.permission) === "evaluations.score_breakdown.view");
  if (superUserScoreBreakdown) {
    pushHealthIssue(issues, {
      id: "super-user-score-breakdown",
      severity: "warning",
      group: "roles",
      titleEn: "Super User can view score breakdown",
      titleAr: "المستخدم المتميز يمكنه عرض تفصيل الدرجات",
      messageEn: "Super User has evaluations.score_breakdown.view. If HR/Audit should not see calculation details, remove this permission.",
      messageAr: "المستخدم المتميز لديه صلاحية evaluations.score_breakdown.view. إذا لم يكن يجب على الموارد البشرية/التدقيق رؤية تفاصيل الحساب، أزل هذه الصلاحية.",
    });
  }

  const userBroadcast = [...customRolePermissions, ...rolePermissions].some((row) => String(row.role ?? row.role_key) === "user" && String(row.permission) === "messages.broadcast");
  if (userBroadcast) {
    pushHealthIssue(issues, {
      id: "user-can-broadcast",
      severity: "warning",
      group: "roles",
      titleEn: "Normal user can broadcast messages",
      titleAr: "المستخدم العادي يمكنه بث الرسائل",
      messageEn: "Normal User has messages.broadcast. Confirm this is intentional; otherwise remove it before production.",
      messageAr: "المستخدم العادي لديه messages.broadcast. تأكد أنها مقصودة؛ وإلا احذفها قبل الإنتاج.",
    });
  }

  const activeLegacyWorkloadOrText = evaluationQuestions.filter((row) => row.is_active === true && (String(row.category).toLowerCase() === "workload" || String(row.answer_type).toLowerCase() === "text" || /comment/i.test(String(row.text_en ?? ""))));
  if (activeLegacyWorkloadOrText.length > 0) {
    pushHealthIssue(issues, {
      id: "active-legacy-workload-comment",
      severity: "warning",
      group: "evaluations",
      titleEn: "Active old workload/comment question",
      titleAr: "سؤال قديم نشط للتعليق/عبء العمل",
      messageEn: `${activeLegacyWorkloadOrText.length} legacy evaluation question(s) for workload/comment are still active. Default template is correct, but fallback screens may show them.`,
      messageAr: `${activeLegacyWorkloadOrText.length} سؤال تقييم قديم للتعليق/عبء العمل ما زال نشطًا. القالب الافتراضي صحيح، لكن شاشات fallback قد تعرضها.`,
      count: activeLegacyWorkloadOrText.length,
    });
  }

  if (departments.length === 0) {
    pushHealthIssue(issues, {
      id: "no-departments",
      severity: "danger",
      group: "structure",
      titleEn: "No departments in backup",
      titleAr: "لا توجد أقسام في النسخة",
      messageEn: "The backup has no departments. Restore will not create a usable organizational structure.",
      messageAr: "النسخة لا تحتوي أقسامًا. الاستعادة لن تنشئ هيكلًا تنظيميًا قابلًا للاستخدام.",
    });
  }

  const authDependentRows = BACKUP_TARGETS.reduce((sum, target) => {
    if (!target.authDependent) return sum;
    return sum + getRowsFromBundleTables(tables, target.table).length;
  }, 0);
  if (authDependentRows > 0) {
    pushHealthIssue(issues, {
      id: "auth-dependent-rows",
      severity: "info",
      group: "restore",
      titleEn: "Backup contains Auth-dependent rows",
      titleAr: "النسخة تحتوي صفوف مرتبطة بحسابات الدخول",
      messageEn: `${authDependentRows} row(s) depend on Supabase Auth users. The app backup does not restore passwords/auth.users.`,
      messageAr: `${authDependentRows} صف مرتبط بمستخدمي Supabase Auth. نسخة التطبيق لا تستعيد كلمات المرور أو auth.users.`,
      count: authDependentRows,
    });
  }

  return issues.sort((a, b) => {
    const weight: Record<BackupHealthSeverity, number> = { danger: 0, warning: 1, info: 2 };
    return weight[a.severity] - weight[b.severity] || a.group.localeCompare(b.group) || a.titleEn.localeCompare(b.titleEn);
  });
}
