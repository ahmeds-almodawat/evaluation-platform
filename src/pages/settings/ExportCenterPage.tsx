import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Database, Download, FileJson, FileSpreadsheet, ShieldCheck, ClipboardCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { downloadXlsx, type XlsxSheet } from "@/utils/exportXlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  BACKUP_KIND_LABELS,
  BACKUP_TARGETS,
  buildBackupManifest,
  getBackupTargets,
  makeBackupWarnings,
  analyzeBackupHealth,
  type BackupBundleV2,
  type BackupKind,
  type BackupTarget,
} from "@/utils/backupRegistry";

type ExportHistoryItem = {
  id: string;
  createdAtIso: string;
  byUserId?: string | null;
  kind: "xlsx_single" | "xlsx_all" | "json_setup" | "json_operational" | "json_full_public";
  filename: string;
  tables: Array<{ name: string; rows: number }>;
};

const EXPORT_HISTORY_KEY = "eval_export_history_v2";

function readExportHistory(): ExportHistoryItem[] {
  try {
    const raw = localStorage.getItem(EXPORT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExportHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function writeExportHistory(items: ExportHistoryItem[]) {
  try {
    localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // Local storage history is convenience only.
  }
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function backupStamp() {
  const now = new Date();
  return `${now.toISOString().slice(0, 10)}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

async function fetchAllInRanges(table: string, select = "*") {
  const pageSize = 1000;
  let from = 0;
  let all: Record<string, unknown>[] = [];

  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = ((data || []) as unknown as Record<string, unknown>[]);
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

function isMissingTableError(err: unknown) {
  const msg = String((err as { message?: unknown })?.message ?? err).toLowerCase();
  return (
    msg.includes("could not find the table") ||
    (msg.includes("relation") && msg.includes("does not exist")) ||
    (msg.includes("schema cache") && msg.includes("could not find the table"))
  );
}

async function fetchAllInRangesSafe(table: string, select = "*") {
  try {
    return { rows: await fetchAllInRanges(table, select), warning: undefined as string | undefined };
  } catch (err) {
    if (isMissingTableError(err)) {
      return { rows: [] as Record<string, unknown>[], warning: `Table "${table}" is not available in this database. Skipped.` };
    }
    throw err;
  }
}

function groupLabel(group: BackupTarget["group"], isAr: boolean) {
  const labels: Record<BackupTarget["group"], { en: string; ar: string }> = {
    setup: { en: "Setup / Structure", ar: "الإعداد / الهيكل" },
    evaluations: { en: "Evaluations", ar: "التقييمات" },
    communication: { en: "Messages / Actions", ar: "الرسائل / المتابعة" },
    dashboard: { en: "Dashboards", ar: "اللوحات" },
    audit: { en: "Audit / Sensitive", ar: "التدقيق / حساس" },
    integration: { en: "Integrations", ar: "التكامل" },
    system: { en: "System Settings", ar: "إعدادات النظام" },
  };
  return isAr ? labels[group].ar : labels[group].en;
}

export default function ExportCenterPage() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<ExportHistoryItem[]>(() => readExportHistory());

  const groupedTargets = useMemo(() => {
    const groups = new Map<BackupTarget["group"], BackupTarget[]>();
    for (const target of BACKUP_TARGETS) {
      const current = groups.get(target.group) ?? [];
      current.push(target);
      groups.set(target.group, current);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  }, []);

  async function rememberExport(item: Omit<ExportHistoryItem, "id" | "createdAtIso" | "byUserId">) {
    const { data: u } = await supabase.auth.getUser();
    const historyItem: ExportHistoryItem = {
      id: crypto?.randomUUID?.() ?? String(Date.now()),
      createdAtIso: new Date().toISOString(),
      byUserId: u?.user?.id ?? null,
      ...item,
    };
    const next = [historyItem, ...readExportHistory()].slice(0, 50);
    writeExportHistory(next);
    setHistory(next);
  }

  async function exportOneXlsx(target: BackupTarget) {
    try {
      setBusy(target.key);
      const result = await fetchAllInRangesSafe(target.table, target.select ?? "*");
      if (result.warning) toast({ title: isAr ? "ملاحظة" : "Note", description: result.warning });
      const filename = `${target.key}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      downloadXlsx(filename, [{ name: target.key, rows: result.rows }]);
      await rememberExport({ kind: "xlsx_single", filename, tables: [{ name: target.key, rows: result.rows.length }] });
      toast({ title: isAr ? "تم التصدير" : "Exported" });
    } catch (e) {
      toast({ title: isAr ? "فشل التصدير" : "Export failed", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function exportAllXlsx() {
    try {
      setBusy("__xlsx_all__");
      const sheets: XlsxSheet[] = [];
      const meta: Array<{ name: string; rows: number }> = [];
      for (const target of BACKUP_TARGETS) {
        const result = await fetchAllInRangesSafe(target.table, target.select ?? "*");
        if (result.warning) toast({ title: isAr ? "ملاحظة" : "Note", description: result.warning });
        sheets.push({ name: target.key.slice(0, 31), rows: result.rows });
        meta.push({ name: target.key, rows: result.rows.length });
      }
      const filename = `ALL_PUBLIC_DATA_${backupStamp()}.xlsx`;
      downloadXlsx(filename, sheets);
      await rememberExport({ kind: "xlsx_all", filename, tables: meta });
      toast({ title: isAr ? "تم تصدير كل البيانات" : "All data exported" });
    } catch (e) {
      toast({ title: isAr ? "فشل التصدير" : "Export failed", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function exportBackupBundle(kind: BackupKind) {
    try {
      setBusy(`__json_${kind}__`);
      const targets = getBackupTargets(kind);
      const tables: BackupBundleV2["tables"] = [];
      const meta: Array<{ name: string; rows: number }> = [];

      for (const target of targets) {
        const result = await fetchAllInRangesSafe(target.table, "*");
        if (result.warning) toast({ title: isAr ? "ملاحظة" : "Note", description: result.warning });
        tables.push({ key: target.key, table: target.table, rows: result.rows });
        meta.push({ name: target.key, rows: result.rows.length });
      }

      const healthIssues = analyzeBackupHealth(tables);
      const healthWarnings = healthIssues
        .filter((issue) => issue.severity !== "info")
        .map((issue) => `${issue.titleEn}: ${issue.messageEn}`);

      const bundle: BackupBundleV2 = {
        version: 2,
        source: "export_center",
        backupKind: kind,
        generatedAtIso: new Date().toISOString(),
        app: "evaluation-platform",
        warnings: [...makeBackupWarnings(kind), ...healthWarnings],
        tables,
        manifest: buildBackupManifest(kind, tables),
      };

      const filename = `${kind.toUpperCase()}_BACKUP_${backupStamp()}.json`;
      downloadJson(filename, bundle);
      await rememberExport({ kind: `json_${kind}` as ExportHistoryItem["kind"], filename, tables: meta });
      const highRiskCount = healthIssues.filter((issue) => issue.severity === "danger").length;
      const warningCount = healthIssues.filter((issue) => issue.severity === "warning").length;
      toast({
        title: isAr ? "تم إنشاء ملف النسخة الاحتياطية" : "Backup file created",
        description:
          highRiskCount || warningCount
            ? isAr
              ? `فحص النسخة: ${highRiskCount} خطر / ${warningCount} تحذير`
              : `Backup health: ${highRiskCount} danger / ${warningCount} warning`
            : undefined,
      });
    } catch (e) {
      toast({ title: isAr ? "فشل النسخ الاحتياطي" : "Backup failed", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const totalSupportedTables = BACKUP_TARGETS.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{isAr ? "مركز التصدير والنسخ الاحتياطي" : "Export & Backup Center"}</h1>
          <div className="text-sm text-muted-foreground">
            {isAr
              ? "تصدير Excel للتقارير أو JSON للاستعادة. يدعم الهيكل، التشغيل، والنسخة الكاملة لبيانات التطبيق العامة."
              : "Export Excel for reporting or JSON for restore. Supports setup, operational, and full public application backups."}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => navigate("/settings/restore-center")} disabled={busy !== null}>
            {isAr ? "فتح مركز الاستعادة" : "Open Restore Center"}
          </Button>
          <Button variant="default" onClick={() => exportBackupBundle("setup")} disabled={busy !== null} className="gap-2">
            <ClipboardCheck className="h-4 w-4" />
            {busy === "__json_setup__" ? (isAr ? "جارٍ..." : "Working...") : isAr ? "نسخة اختبار أساسية" : "Testing Baseline Backup"}
          </Button>
          <Button variant="outline" onClick={exportAllXlsx} disabled={busy !== null} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            {busy === "__xlsx_all__" ? (isAr ? "جارٍ..." : "Working...") : isAr ? "أرشيف Excel كامل" : "Full Excel Archive"}
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>{isAr ? "حدود مهمة" : "Important limits"}</AlertTitle>
        <AlertDescription>
          {isAr
            ? "نسخ JSON تستعيد جداول التطبيق العامة فقط. لا تشمل كلمات المرور أو مستخدمي Supabase Auth أو ملفات التخزين. إذا عملت Reset كامل لقاعدة البيانات، ستحتاج لإعادة إنشاء مستخدمي الدخول أو استخدام نسخة CLI كاملة."
            : "JSON backups restore public application tables only. They do not include passwords, Supabase Auth users, or Storage files. If you fully reset the database, you must recreate login users or use a full CLI/database backup."}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        {(["setup", "operational", "full_public"] as BackupKind[]).map((kind) => {
          const labels = BACKUP_KIND_LABELS[kind];
          const count = getBackupTargets(kind).length;
          const busyKey = `__json_${kind}__`;
          return (
            <Card key={kind} className="border/50">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>{isAr ? labels.ar : labels.en}</span>
                  <Badge variant={kind === "full_public" ? "destructive" : "secondary"}>JSON</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">{isAr ? labels.descriptionAr : labels.descriptionEn}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="h-4 w-4" />
                  {count} / {totalSupportedTables} {isAr ? "جدول مدعوم" : "supported tables"}
                </div>
                <Button onClick={() => exportBackupBundle(kind)} disabled={busy !== null} className="w-full gap-2" variant={kind === "full_public" ? "destructive" : "default"}>
                  <FileJson className="h-4 w-4" />
                  {busy === busyKey ? (isAr ? "جارٍ إنشاء النسخة..." : "Building backup...") : isAr ? "تصدير ملف استعادة" : "Export Restore File"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border/50">
        <CardHeader className="py-4">
          <CardTitle className="text-base">{isAr ? "الجداول المدعومة" : "Supported tables"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {groupedTargets.map(({ group, items }) => (
            <div key={group} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="font-medium">{groupLabel(group, isAr)}</div>
                <Badge variant="outline">{items.length}</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((target) => (
                  <div key={target.key} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{isAr ? target.labelAr : target.labelEn}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate">{target.table}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => exportOneXlsx(target)} disabled={busy !== null} className="gap-1">
                        <Download className="h-3 w-3" />
                        {busy === target.key ? (isAr ? "جارٍ" : "..." ) : "XLSX"}
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {target.authDependent ? <Badge variant="secondary">Auth</Badge> : null}
                      {target.sensitive ? <Badge variant="destructive">{isAr ? "حساس" : "Sensitive"}</Badge> : null}
                      {target.notesEn ? (
                        <Badge variant="outline" title={isAr ? target.notesAr : target.notesEn}>
                          <AlertTriangle className="h-3 w-3" />
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border/50">
        <CardHeader className="py-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{isAr ? "سجل التصدير المحلي" : "Local export history"}</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              {isAr ? "يتم حفظ آخر 50 عملية على هذا الجهاز فقط." : "The last 50 exports are saved on this device only."}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              writeExportHistory([]);
              setHistory([]);
              toast({ title: isAr ? "تم المسح" : "Cleared" });
            }}
            disabled={history.length === 0}
          >
            {isAr ? "مسح" : "Clear"}
          </Button>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">{isAr ? "لا توجد عمليات تصدير بعد." : "No exports yet."}</div>
          ) : (
            <div className="space-y-3">
              {history.slice(0, 10).map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.kind.includes("full") ? "destructive" : item.kind.includes("json") ? "secondary" : "outline"}>{item.kind}</Badge>
                      <span className="truncate text-sm font-medium">{item.filename}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.createdAtIso).toLocaleString()} • {item.tables.reduce((a, s) => a + (s.rows || 0), 0)} {isAr ? "صف" : "rows"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.tables.slice(0, 4).map((s) => `${s.name}:${s.rows}`).join(" | ")}
                    {item.tables.length > 4 ? " ..." : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
