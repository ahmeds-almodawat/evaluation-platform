import React, { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";

type HealthCounts = {
  profiles: number;
  departments: number;
  evaluations: number;
  completedEvaluations: number;
  actionTicketsOpen: number;
  lastEvaluationAtIso: string | null;
};

type ExportHistoryItem = {
  id: string;
  createdAtIso: string;
  kind: string;
  filename: string;
};

const EXPORT_HISTORY_KEY = "eval_export_history_v1";

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

export default function SystemHealthPage() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [counts, setCounts] = useState<HealthCounts | null>(null);

  const exportHistory = useMemo(() => readExportHistory(), []);
  const lastExport = exportHistory[0] ?? null;

  const refresh = async () => {
    setLoading(true);
    try {
      // Connection check (cheap)
      const ping = await supabase.from("profiles").select("id", { count: "exact", head: true }).limit(1);
      if (ping.error) throw ping.error;
      setOnline(true);

      const [{ count: profilesC }, { count: departmentsC }, { count: evaluationsC }, { count: completedC }] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("departments").select("id", { count: "exact", head: true }),
        supabase.from("evaluations").select("id", { count: "exact", head: true }),
        supabase.from("evaluations").select("id", { count: "exact", head: true }).eq("status", "completed"),
      ]);

      const openTickets = await supabase
        .from("action_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]);

      // Last evaluation timestamp (best effort)
      const lastEval = await supabase
        .from("evaluations")
        .select("created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1);

      const lastEvaluationAtIso = lastEval.data?.[0]?.created_at ?? null;

      setCounts({
        profiles: profilesC ?? 0,
        departments: departmentsC ?? 0,
        evaluations: evaluationsC ?? 0,
        completedEvaluations: completedC ?? 0,
        actionTicketsOpen: openTickets.count ?? 0,
        lastEvaluationAtIso,
      });
    } catch (err: any) {
      console.error("System health refresh error", err);
      setOnline(false);
      toast({
        title: isAr ? "تعذر التحديث" : "Could not refresh",
        description: String(err?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{isAr ? "صحة النظام" : "System Health"}</h1>
          <div className="text-sm text-muted-foreground">
            {isAr
              ? "لوحة سريعة لمتابعة جاهزية النظام قبل الإرسال أو التصدير."
              : "Quick status view to confirm the system is healthy before sending or exporting."}
          </div>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading} className="gap-2">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {isAr ? "تحديث" : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border/50">
          <CardHeader className="py-4">
            <CardTitle className="text-base">{isAr ? "الاتصال بقاعدة البيانات" : "Database connectivity"}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{isAr ? "الحالة" : "Status"}</div>
            {online === null ? (
              <Badge variant="secondary">{isAr ? "جارٍ الفحص" : "Checking"}</Badge>
            ) : online ? (
              <Badge>{isAr ? "متصل" : "Online"}</Badge>
            ) : (
              <Badge variant="destructive">{isAr ? "غير متصل" : "Offline"}</Badge>
            )}
          </CardContent>
        </Card>

        <Card className="border/50">
          <CardHeader className="py-4">
            <CardTitle className="text-base">{isAr ? "البيانات" : "Data"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{isAr ? "الموظفون" : "Employees"}</span><span className="font-medium">{counts?.profiles ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{isAr ? "الأقسام" : "Departments"}</span><span className="font-medium">{counts?.departments ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{isAr ? "التقييمات" : "Evaluations"}</span><span className="font-medium">{counts?.evaluations ?? "—"}</span></div>
          </CardContent>
        </Card>

        <Card className="border/50">
          <CardHeader className="py-4">
            <CardTitle className="text-base">{isAr ? "التقدم" : "Progress"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{isAr ? "مكتملة" : "Completed"}</span><span className="font-medium">{counts?.completedEvaluations ?? "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{isAr ? "آخر تقييم مكتمل" : "Last completed"}</span><span className="font-medium">{counts?.lastEvaluationAtIso ? new Date(counts.lastEvaluationAtIso).toLocaleString() : "—"}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">{isAr ? "تذاكر مفتوحة" : "Open tickets"}</span><span className="font-medium">{counts?.actionTicketsOpen ?? "—"}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border/50">
        <CardHeader className="py-4">
          <CardTitle className="text-base">{isAr ? "النسخ الاحتياطي والتصدير" : "Backups & exports"}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="flex items-center justify-between">
            <span>{isAr ? "آخر تصدير" : "Last export"}</span>
            <span className="text-foreground font-medium">{lastExport ? new Date(lastExport.createdAtIso).toLocaleString() : "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{isAr ? "اسم الملف" : "Filename"}</span>
            <span className="text-foreground font-medium truncate max-w-[60%]">{lastExport ? lastExport.filename : "—"}</span>
          </div>
          <div className="text-xs">
            {isAr
              ? "ملاحظة: سجل التصدير يتم حفظه محليًا على جهازك."
              : "Note: export history is stored locally on this device."}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
