import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, RotateCcw, Upload, ClipboardCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  BACKUP_KIND_LABELS,
  BACKUP_TARGET_BY_TABLE,
  getDeleteOrderForBundle,
  getRestoreTargetsForBundle,
  analyzeBackupHealth,
  type BackupBundleV2,
  type LegacyRestoreBundleV1,
} from "@/utils/backupRegistry";

type RestoreBundle = BackupBundleV2 | LegacyRestoreBundleV1;

type RestoreProgress = {
  table: string;
  insertedOrUpdated: number;
  skipped: number;
  warnings: string[];
};

const CONFIRM_PHRASE = "RESTORE NOW";

function isV2Bundle(bundle: RestoreBundle): bundle is BackupBundleV2 {
  return bundle.version === 2;
}

function isMissingTableError(err: unknown) {
  const msg = String((err as { message?: unknown })?.message ?? err).toLowerCase();
  return (
    msg.includes("could not find the table") ||
    (msg.includes("relation") && msg.includes("does not exist")) ||
    (msg.includes("schema cache") && msg.includes("could not find the table"))
  );
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeRows(rows: unknown): Record<string, unknown>[] {
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function getBundleTables(bundle: RestoreBundle | null) {
  return bundle?.tables ?? [];
}

function getBundleKindLabel(bundle: RestoreBundle | null, isAr: boolean) {
  if (!bundle) return "";
  if (!isV2Bundle(bundle)) return isAr ? "حزمة قديمة v1" : "Legacy v1 bundle";
  const labels = BACKUP_KIND_LABELS[bundle.backupKind];
  return labels ? (isAr ? labels.ar : labels.en) : bundle.backupKind;
}

export default function RestoreCenterPage() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { toast } = useToast();

  const [bundle, setBundle] = useState<RestoreBundle | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [confirmText, setConfirmText] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RestoreProgress[]>([]);
  const [mode, setMode] = useState<"upsert" | "replace">("upsert");

  const tableIndex = useMemo(() => {
    const map = new Map<string, { key: string; table: string; rows: Record<string, unknown>[] }>();
    for (const table of getBundleTables(bundle)) {
      map.set(table.table, { key: table.key, table: table.table, rows: normalizeRows(table.rows) });
    }
    return map;
  }, [bundle]);

  const healthIssues = useMemo(() => (bundle ? analyzeBackupHealth(getBundleTables(bundle) as BackupBundleV2["tables"]) : []), [bundle]);

  const summary = useMemo(() => {
    const items = getBundleTables(bundle).map((t) => ({ table: t.table, rows: normalizeRows(t.rows).length }));
    const total = items.reduce((a, b) => a + b.rows, 0);
    const knownTables = items.filter((item) => BACKUP_TARGET_BY_TABLE.has(item.table));
    const unknownTables = items.filter((item) => !BACKUP_TARGET_BY_TABLE.has(item.table));
    const authDependentRows = items.reduce((sum, item) => {
      const target = BACKUP_TARGET_BY_TABLE.get(item.table);
      return sum + (target?.authDependent ? item.rows : 0);
    }, 0);
    const sensitiveRows = items.reduce((sum, item) => {
      const target = BACKUP_TARGET_BY_TABLE.get(item.table);
      return sum + (target?.sensitive ? item.rows : 0);
    }, 0);
    return { items, knownTables, unknownTables, total, authDependentRows, sensitiveRows };
  }, [bundle]);

  async function handleFile(file: File) {
    setProgress([]);
    setConfirmText("");
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || ![1, 2].includes(parsed.version) || !Array.isArray(parsed.tables)) {
        throw new Error("Invalid restore bundle format. Use a JSON file exported from Export Center.");
      }
      if (parsed.version === 2 && parsed.source !== "export_center") {
        throw new Error("This JSON does not look like an Export Center backup bundle.");
      }
      setBundle(parsed as RestoreBundle);
      toast({ title: isAr ? "تم تحميل الحزمة" : "Bundle loaded" });
    } catch (e) {
      setBundle(null);
      toast({ title: isAr ? "ملف غير صالح" : "Invalid file", description: String((e as Error)?.message ?? e), variant: "destructive" });
    }
  }

  async function runReplaceMode() {
    const deleteTargets = getDeleteOrderForBundle(Array.from(tableIndex.keys()));
    const replaceProgress: RestoreProgress[] = [];

    for (const target of deleteTargets) {
      if (!target.deleteColumn) {
        replaceProgress.push({ table: target.table, insertedOrUpdated: 0, skipped: 0, warnings: ["No safe delete column configured; replace delete skipped for this table."] });
        setProgress([...replaceProgress]);
        continue;
      }

      try {
        const { error } = await supabase.from(target.table).delete().not(target.deleteColumn, "is", null);
        if (error) throw error;
      } catch (e) {
        if (isMissingTableError(e)) continue;
        replaceProgress.push({
          table: target.table,
          insertedOrUpdated: 0,
          skipped: 0,
          warnings: [`Replace delete failed; restore will continue with upsert for this table. ${String((e as Error)?.message ?? e)}`],
        });
        setProgress([...replaceProgress]);
      }
    }
  }

  function dryRunRestore() {
    if (!bundle) return;
    const restoreTargets = getRestoreTargetsForBundle(Array.from(tableIndex.keys()));
    const nextProgress: RestoreProgress[] = restoreTargets.map((target) => {
      const bundleTable = tableIndex.get(target.table);
      const rows = normalizeRows(bundleTable?.rows ?? []);
      const warnings: string[] = [];
      if (!target.onConflict) warnings.push("No safe conflict key configured; restore would skip this table.");
      if (target.authDependent && rows.length > 0) warnings.push("Auth-dependent rows: matching Supabase Auth users must already exist.");
      if (target.sensitive && rows.length > 0) warnings.push("Sensitive table: store and restore carefully.");
      return { table: target.table, insertedOrUpdated: rows.length, skipped: target.onConflict ? 0 : rows.length, warnings };
    });

    for (const issue of healthIssues) {
      if (issue.severity === "info") continue;
      nextProgress.unshift({
        table: `HEALTH: ${issue.titleEn}`,
        insertedOrUpdated: 0,
        skipped: 0,
        warnings: [isAr ? issue.messageAr : issue.messageEn],
      });
    }

    const unknownTables = Array.from(tableIndex.keys()).filter((table) => !BACKUP_TARGET_BY_TABLE.has(table));
    for (const table of unknownTables) {
      const rows = tableIndex.get(table)?.rows.length ?? 0;
      nextProgress.push({ table, insertedOrUpdated: 0, skipped: rows, warnings: ["Unknown table in this app version; restore would skip it."] });
    }

    setProgress(nextProgress);
    toast({ title: isAr ? "اكتملت المعاينة الجافة" : "Dry run completed", description: isAr ? "لم يتم تغيير أي بيانات." : "No data was changed." });
  }

  async function restore() {
    if (!bundle) return;
    if (confirmText.trim() !== CONFIRM_PHRASE) {
      toast({ title: isAr ? "اكتب عبارة التأكيد" : "Type confirmation phrase", description: CONFIRM_PHRASE, variant: "destructive" });
      return;
    }

    setBusy(true);
    setProgress([]);
    try {
      if (mode === "replace") {
        await runReplaceMode();
      }

      const restoreTargets = getRestoreTargetsForBundle(Array.from(tableIndex.keys()));
      const nextProgress: RestoreProgress[] = [];

      for (const target of restoreTargets) {
        const bundleTable = tableIndex.get(target.table);
        if (!bundleTable) continue;
        const rows = normalizeRows(bundleTable.rows);
        const warnings: string[] = [];

        if (rows.length === 0) {
          nextProgress.push({ table: target.table, insertedOrUpdated: 0, skipped: 0, warnings });
          setProgress([...nextProgress]);
          continue;
        }

        if (!target.onConflict) {
          warnings.push("No safe conflict key configured; skipped.");
          nextProgress.push({ table: target.table, insertedOrUpdated: 0, skipped: rows.length, warnings });
          setProgress([...nextProgress]);
          continue;
        }

        let insertedOrUpdated = 0;
        let skipped = 0;
        for (const part of chunk(rows, 500)) {
          try {
            const { error } = await supabase.from(target.table).upsert(part, { onConflict: target.onConflict });
            if (error) throw error;
            insertedOrUpdated += part.length;
          } catch (e) {
            if (isMissingTableError(e)) {
              warnings.push("Table is not available in this database. Skipped.");
              skipped += part.length;
              continue;
            }
            warnings.push(String((e as Error)?.message ?? e));
            skipped += part.length;
          }
        }

        nextProgress.push({ table: target.table, insertedOrUpdated, skipped, warnings });
        setProgress([...nextProgress]);
      }

      const unknownTables = Array.from(tableIndex.keys()).filter((table) => !BACKUP_TARGET_BY_TABLE.has(table));
      for (const table of unknownTables) {
        const rows = tableIndex.get(table)?.rows.length ?? 0;
        nextProgress.push({ table, insertedOrUpdated: 0, skipped: rows, warnings: ["Unknown table in this app version; skipped."] });
      }
      setProgress([...nextProgress]);

      toast({ title: isAr ? "اكتملت الاستعادة" : "Restore completed" });
    } catch (e) {
      toast({ title: isAr ? "فشلت الاستعادة" : "Restore failed", description: String((e as Error)?.message ?? e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const generatedAt = bundle?.generatedAtIso ? new Date(bundle.generatedAtIso).toLocaleString() : "";
  const restoreTargetsCount = getRestoreTargetsForBundle(Array.from(tableIndex.keys())).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold">{isAr ? "مركز الاستيراد والاستعادة" : "Import & Restore Center"}</h1>
          <div className="text-sm text-muted-foreground">
            {isAr
              ? "استعادة ملفات JSON التي تم إنشاؤها من مركز التصدير. استخدم المعاينة أولاً ثم استعد بأمان."
              : "Restore JSON files generated by Export Center. Review the preview first, then restore safely."}
          </div>
        </div>
        <Badge variant="secondary">v2</Badge>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{isAr ? "مهم قبل الاستعادة" : "Important before restore"}</AlertTitle>
        <AlertDescription>
          {isAr
            ? "هذا المركز لا يستعيد كلمات المرور أو مستخدمي Supabase Auth أو ملفات التخزين. إذا كانت الحزمة تحتوي ملفات موظفين/أدوار مرتبطة بالمستخدمين، يجب أن تكون حسابات Auth المطابقة موجودة أو ستظهر أخطاء مفاتيح خارجية ويتم تخطي الصفوف الفاشلة."
            : "This center does not restore passwords, Supabase Auth users, or Storage files. If the bundle contains profiles/roles linked to users, matching Auth accounts must already exist or foreign-key errors will be reported and failed rows skipped."}
        </AlertDescription>
      </Alert>

      <Card className="border/50">
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            {isAr ? "تحميل ملف النسخة" : "Load backup file"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bundle">{isAr ? "ملف JSON" : "JSON file"}</Label>
            <Input
              id="bundle"
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {fileName ? <div className="text-xs text-muted-foreground">{fileName}</div> : null}
          </div>

          {bundle ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{getBundleKindLabel(bundle, isAr)}</Badge>
                <Badge variant="outline">v{bundle.version}</Badge>
                {summary.sensitiveRows > 0 ? <Badge variant="destructive">{isAr ? "حساس" : "Sensitive"}</Badge> : null}
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-muted-foreground">{isAr ? "تاريخ الإنشاء:" : "Created:"}</span> {generatedAt}</div>
                <div><span className="text-muted-foreground">{isAr ? "الجداول:" : "Tables:"}</span> {summary.items.length}</div>
                <div><span className="text-muted-foreground">{isAr ? "الجداول المدعومة:" : "Supported:"}</span> {restoreTargetsCount}</div>
                <div><span className="text-muted-foreground">{isAr ? "إجمالي الصفوف:" : "Total rows:"}</span> {summary.total}</div>
              </div>
              {summary.authDependentRows > 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{isAr ? "بيانات مرتبطة بحسابات الدخول" : "Auth-dependent data"}</AlertTitle>
                  <AlertDescription>
                    {isAr
                      ? `توجد ${summary.authDependentRows} صفوف مرتبطة بمستخدمي Auth. تأكد من وجود المستخدمين قبل الاستعادة.`
                      : `${summary.authDependentRows} rows are linked to Auth users. Make sure matching users exist before restore.`}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {isAr ? "صدّر ملف JSON من مركز التصدير ثم ارفعه هنا." : "Export a JSON backup from Export Center, then upload it here."}
            </div>
          )}
        </CardContent>
      </Card>

      {bundle ? (
        <Card className="border/50">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4" />
              {isAr ? "فحص صحة النسخة" : "Backup Health Check"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {healthIssues.length === 0 ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{isAr ? "لا توجد ملاحظات" : "No health findings"}</AlertTitle>
                <AlertDescription>{isAr ? "لم يتم العثور على مخاطر واضحة في ملف النسخة." : "No obvious backup risks were found in this file."}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {healthIssues.slice(0, 12).map((issue) => (
                  <Alert key={issue.id} variant={issue.severity === "danger" ? "destructive" : "default"}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{isAr ? issue.titleAr : issue.titleEn}</AlertTitle>
                    <AlertDescription>{isAr ? issue.messageAr : issue.messageEn}</AlertDescription>
                  </Alert>
                ))}
                {healthIssues.length > 12 ? (
                  <div className="text-xs text-muted-foreground">
                    {isAr ? `و ${healthIssues.length - 12} ملاحظات أخرى...` : `And ${healthIssues.length - 12} more findings...`}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {bundle ? (
        <Card className="border/50">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileJson className="h-4 w-4" />
              {isAr ? "معاينة الجداول" : "Table preview"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {summary.items.map((item) => {
                const target = BACKUP_TARGET_BY_TABLE.get(item.table);
                return (
                  <div key={item.table} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs">{item.table}</div>
                      <Badge variant={target ? "outline" : "destructive"}>{item.rows}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {!target ? <Badge variant="destructive">{isAr ? "غير معروف" : "Unknown"}</Badge> : null}
                      {target?.authDependent ? <Badge variant="secondary">Auth</Badge> : null}
                      {target?.sensitive ? <Badge variant="destructive">{isAr ? "حساس" : "Sensitive"}</Badge> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border/50">
        <CardHeader className="py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4" />
            {isAr ? "تشغيل الاستعادة" : "Run restore"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={mode === "upsert" ? "default" : "outline"} onClick={() => setMode("upsert")} disabled={busy}>
              {isAr ? "آمن: تحديث/إضافة" : "Safe: Upsert"}
            </Button>
            <Button type="button" variant={mode === "replace" ? "destructive" : "outline"} onClick={() => setMode("replace")} disabled={busy}>
              {isAr ? "استبدال: حذف ثم استعادة" : "Replace: Delete then restore"}
            </Button>
          </div>

          <Alert variant={mode === "replace" ? "destructive" : "default"}>
            <AlertTitle>{mode === "replace" ? (isAr ? "وضع خطر" : "Danger mode") : (isAr ? "وضع آمن" : "Safe mode")}</AlertTitle>
            <AlertDescription>
              {mode === "replace"
                ? isAr
                  ? "سيحاول حذف الجداول الموجودة داخل الحزمة ثم يستعيدها. استخدمه فقط بعد أخذ نسخة احتياطية وعند اختبار الاستعادة."
                  : "This attempts to delete existing rows for tables included in the bundle, then restore them. Use only after a backup and for restore testing."
                : isAr
                ? "سيضيف أو يحدث الصفوف الموجودة في الملف بدون حذف كامل. هذا هو الخيار الافتراضي الأكثر أمانًا."
                : "This inserts or updates rows from the file without full deletion. This is the safer default."}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="confirm">{isAr ? "اكتب عبارة التأكيد" : "Type confirmation"}</Label>
            <Input id="confirm" placeholder={CONFIRM_PHRASE} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} disabled={busy} />
            <div className="text-xs text-muted-foreground">
              {isAr ? "اكتب بالضبط:" : "Type exactly:"} <span className="font-mono">{CONFIRM_PHRASE}</span>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <Button type="button" variant="outline" onClick={dryRunRestore} disabled={busy || !bundle} className="gap-2">
              <ClipboardCheck className="h-4 w-4" />
              {isAr ? "معاينة جافة - بدون تغيير بيانات" : "Dry Run - No Data Changes"}
            </Button>
            <Button onClick={restore} disabled={busy || !bundle}>
              {busy ? (isAr ? "جارٍ الاستعادة..." : "Restoring...") : isAr ? "بدء الاستعادة" : "Start restore"}
            </Button>
          </div>

          {progress.length > 0 ? (
            <div className="space-y-2">
              {progress.map((p) => (
                <div key={p.table} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium">
                      {p.warnings.length === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      {p.table}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isAr ? "تم:" : "Done:"} {p.insertedOrUpdated} • {isAr ? "تم تخطي:" : "Skipped:"} {p.skipped}
                    </div>
                  </div>
                  {p.warnings.length ? (
                    <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                      {p.warnings.slice(0, 4).join("\n")}
                      {p.warnings.length > 4 ? "\n..." : ""}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
