import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type Item = { key: string; titleEn: string; titleAr: string };

const STORAGE_KEY = "onboarding_checklist_v1";

const DEFAULT_ITEMS: Item[] = [
  { key: "users_imported", titleEn: "Upload employees (CSV/Excel)", titleAr: "رفع الموظفين (CSV/Excel)" },
  { key: "departments_set", titleEn: "Review departments & roles", titleAr: "مراجعة الأقسام والأدوار" },
  { key: "templates_ready", titleEn: "Review evaluation template", titleAr: "مراجعة نموذج التقييم" },
  { key: "first_survey", titleEn: "Send your first survey", titleAr: "إرسال أول تقييم" },
  { key: "dashboards_checked", titleEn: "Check dashboards", titleAr: "مراجعة اللوحات" },
  { key: "backup_export", titleEn: "Export a backup (XLSX)", titleAr: "تصدير نسخة احتياطية (XLSX)" },
];

function loadState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(s: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export default function OnboardingChecklistCard({ className }: { className?: string }) {
  const { language } = useLanguage();
  const [state, setState] = useState<Record<string, boolean>>(() => loadState());

  const items = useMemo(() => DEFAULT_ITEMS, []);
  const done = items.filter((it) => state[it.key]).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const toggle = (key: string, v: boolean) => {
    const next = { ...state, [key]: v };
    setState(next);
    saveState(next);
  };

  return (
    <Card className={cn("card-hover", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {language === "ar" ? "قائمة البدء السريع" : "Quick Setup Checklist"}
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          {language === "ar" ? `اكتمل ${done} من ${items.length}` : `${done} of ${items.length} completed`}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} />
        <div className="grid gap-2">
          {items.map((it) => {
            const label = language === "ar" ? it.titleAr : it.titleEn;
            return (
              <label key={it.key} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60 transition-colors">
                <Checkbox checked={!!state[it.key]} onCheckedChange={(v) => toggle(it.key, Boolean(v))} />
                <span className="text-sm">{label}</span>
              </label>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
