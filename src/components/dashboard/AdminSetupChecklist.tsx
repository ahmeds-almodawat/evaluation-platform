import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";

type Step = {
  key: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  path: string;
};

function readDone(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem("admin_setup_done") || "{}");
  } catch {
    return {};
  }
}

function writeDone(done: Record<string, boolean>) {
  localStorage.setItem("admin_setup_done", JSON.stringify(done));
}

export default function AdminSetupChecklist() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const fn = () => setVersion((v) => v + 1);
    window.addEventListener("storage", fn);
    return () => window.removeEventListener("storage", fn);
  }, []);

  const navigate = useNavigate();
  const { language } = useLanguage();
  const isAr = language === "ar";

  const steps: Step[] = useMemo(
    () => [
      {
        key: "departments",
        titleEn: "Add departments",
        titleAr: "إضافة الأقسام",
        descEn: "Create your departments (Arabic/English names).",
        descAr: "أنشئ الأقسام (الأسماء بالعربية والإنجليزية).",
        path: "/settings/departments",
      },
      {
        key: "users",
        titleEn: "Upload users",
        titleAr: "رفع المستخدمين",
        descEn: "Bulk upload employees and validate the roster.",
        descAr: "ارفع الموظفين دفعة واحدة وتأكد من صحة البيانات.",
        path: "/settings/users",
      },
      {
        key: "templates",
        titleEn: "Review evaluation template",
        titleAr: "مراجعة نموذج التقييم",
        descEn: "Confirm questions, choices, and anonymity settings.",
        descAr: "أكد الأسئلة والاختيارات وإعدادات المجهولية.",
        path: "/evaluation-templates",
      },
      {
        key: "send",
        titleEn: "Send first evaluation",
        titleAr: "إرسال أول تقييم",
        descEn: "Start a test cycle for a small group.",
        descAr: "ابدأ دورة تجريبية لمجموعة صغيرة.",
        path: "/evaluations",
      },
      {
        key: "dashboards",
        titleEn: "Review dashboards",
        titleAr: "مراجعة اللوحات",
        descEn: "Check Executive / Company / Department dashboards.",
        descAr: "راجع لوحات الإدارة / الشركة / القسم.",
        path: "/dashboard",
      },
      {
        key: "exports",
        titleEn: "Export backup",
        titleAr: "تصدير نسخة احتياطية",
        descEn: "Use Export Center to export key data to Excel.",
        descAr: "استخدم مركز التصدير لإخراج البيانات إلى Excel.",
        path: "/settings/export-center",
      },
    ],
    []
  );

  const done = readDone();
  void version;
  const completed = steps.filter((s) => done[s.key]).length;

  return (
    <Card className="border-muted/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          {isAr ? "قائمة بدء سريعة (للإدارة)" : "Quick setup checklist (Admin)"}
          <span className="text-xs text-muted-foreground font-normal">
            {completed}/{steps.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((s) => {
          const isDone = !!done[s.key];
          return (
            <div
              key={s.key}
              className="flex items-start gap-3 rounded-xl border border-muted/60 p-3 hover:shadow-sm transition-all"
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground mt-0.5" />
              )}
              <div className="flex-1">
                <div className="text-sm font-semibold">
                  {isAr ? s.titleAr : s.titleEn}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isAr ? s.descAr : s.descEn}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate(s.path)}
                >
                  {isAr ? "فتح" : "Open"}
                </Button>
                <Button
                  size="sm"
                  variant={isDone ? "secondary" : "default"}
                  onClick={() => {
                    const next = { ...done, [s.key]: !isDone };
                    writeDone(next);
                    // force re-render
                    window.dispatchEvent(new Event("storage"));
                  }}
                >
                  {isDone ? (isAr ? "إلغاء" : "Undo") : (isAr ? "تم" : "Done")}
                </Button>
              </div>
            </div>
          );
        })}

        <div className="text-xs text-muted-foreground">
          {isAr
            ? "نصيحة: ابدأ بقسم واحد ومجموعة صغيرة، ثم وسّع إلى 500 موظف."
            : "Tip: start with one department and a small pilot, then scale to 500 employees."}
        </div>
      </CardContent>
    </Card>
  );
}
