import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { exportRowsToXlsx, exportRowsToCsvBom } from "@/utils/evaluationExports";
import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

type PeriodRow = { period: string; avg_score: number | null; evaluations_count: number | null };

export default function PeriodScoreDrilldown({
  targetUserId,
  targetName,
  language,
}: {
  targetUserId: string;
  targetName: string;
  language: "en" | "ar";
}) {
  const isAr = language === "ar";
  const { hasPermission } = useSupabaseAuth();

  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);

  const [breakdown, setBreakdown] = useState<any>(null);
  const [questionAgg, setQuestionAgg] = useState<any[]>([]);
  const [details, setDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const canBreakdown = hasPermission("evaluations.score_breakdown.view");
  const canIdentity = hasPermission("evaluations.rater_identity.view");
  const canReveal = hasPermission("evaluations.anonymous.reveal");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_user_period_scores", {
        p_evaluatee: targetUserId,
      });
      if (!error) {
        const rows = (data || []).map((r: any) => ({
          period: r.period,
          avg_score: r.avg_score,
          evaluations_count: r.evaluations_count,
        }));
        setPeriods(rows);
        if (rows.length > 0) setSelectedPeriod(rows[rows.length - 1].period); // pick latest
      }
    })();
  }, [targetUserId]);

  const periodLabel = (p: string) => {
    // Common format in your app is YYYY-MM; if not, show as-is.
    try {
      const parts = p.split("-");
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        if (y && m) {
          return new Date(y, m - 1, 1).toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "short" });
        }
      }
    } catch {}
    return p;
  };

  async function loadPeriod(p: string) {
    setSelectedPeriod(p);
    setBreakdown(null);
    setQuestionAgg([]);
    setDetails([]);
    setLoading(true);
    setDetailsError(null);
    try {
      if (canBreakdown) {
        const b = await supabase.rpc("get_period_score_breakdown", {
          p_evaluatee: targetUserId,
          p_period: p,
        });
        if (!b.error) setBreakdown(b.data);

        const qa = await supabase.rpc("get_period_question_aggregates", {
          p_evaluatee: targetUserId,
          p_period: p,
        });
        if (!qa.error) setQuestionAgg(qa.data || []);
      }

      // Rater identities are extremely sensitive:
      // - canIdentity: allowed to view rater identities/answers
      // - canReveal: allowed to reveal identities in anonymous contexts
      // In some DB versions, the RPC signature is (uuid,text) and in others it is (uuid,text,uuid).
      // We support BOTH safely.
      if (canIdentity && canReveal) {
        const { data: userRes } = await supabase.auth.getUser();
        const requesterId = userRes?.user?.id ?? null;

        // First try the 3-argument signature (preferred when present)
        let d = await supabase.rpc("get_period_detailed_answers", {
          p_evaluatee: targetUserId,
          p_period: p,
          ...(requesterId ? { p_requester: requesterId } : {}),
        } as any);

        // If the function doesn't accept p_requester (older signature), retry without it.
        if (d.error && /p_requester|function get_period_detailed_answers|does not exist|invalid input/i.test(d.error.message || "")) {
          d = await supabase.rpc("get_period_detailed_answers", {
            p_evaluatee: targetUserId,
            p_period: p,
          } as any);
        }

        if (!d.error) {
          setDetails(d.data || []);
        } else {
          setDetails([]);
          setDetailsError(d.error.message || "Failed to load rater details");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedPeriod) loadPeriod(selectedPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const exportRedacted = () => {
    const file = `score_redacted_${targetName}_${selectedPeriod}.xlsx`;
    exportRowsToXlsx(file, {
      Summary: [breakdown || {}],
      Questions: (questionAgg || []).map((r) => ({
        question_en: r.question_text_en,
        question_ar: r.question_text_ar,
        avg: r.avg_value,
        count: r.count_answers,
      })),
    });
  };

  const exportRevealed = () => {
    const file = `score_revealed_${targetName}_${selectedPeriod}.xlsx`;
    exportRowsToXlsx(file, {
      DetailedAnswers: (details || []).map((r) => ({
        evaluator_en: r.evaluator_name_en,
        evaluator_ar: r.evaluator_name_ar,
        question_en: r.question_text_en,
        question_ar: r.question_text_ar,
        value: r.value,
      })),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-4">
        <CardHeader>
          <CardTitle>{isAr ? "الفترات" : "Periods"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {periods.map((p) => (
            <button
              key={p.period}
              onClick={() => loadPeriod(p.period)}
              className={`w-full rounded-lg border px-3 py-2 text-left ${
                selectedPeriod === p.period ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{periodLabel(p.period)}</div>
                <div className="text-sm">{p.avg_score ?? "—"}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {isAr ? "عدد التقييمات" : "Evaluations"}: {p.evaluations_count ?? 0}
              </div>
            </button>
          ))}
          {periods.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {isAr ? "لا توجد بيانات تقييم حتى الآن." : "No evaluation data yet."}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-8">
        <CardHeader>
          <CardTitle>{isAr ? "تفاصيل الفترة" : "Period Details"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <div className="text-sm text-muted-foreground">{isAr ? "جاري التحميل..." : "Loading..."}</div>}

          {!canBreakdown && (
            <div className="text-sm text-muted-foreground">
              {isAr ? "لا تملك صلاحية عرض تفصيل احتساب الدرجة." : "You don't have permission to view score breakdown."}
            </div>
          )}

          {canBreakdown && breakdown && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div><b>{isAr ? "عدد التقييمات" : "Evaluations"}:</b> {breakdown.evaluations_count ?? "—"}</div>
              <div><b>{isAr ? "المتوسط" : "Average"}:</b> {breakdown.average ?? "—"}</div>
              <div><b>{isAr ? "الأدنى" : "Min"}:</b> {breakdown.min ?? "—"}</div>
              <div><b>{isAr ? "الأعلى" : "Max"}:</b> {breakdown.max ?? "—"}</div>
            </div>
          )}

          {canBreakdown && questionAgg.length > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="font-medium">{isAr ? "متوسط كل سؤال" : "Per-question averages"}</div>
                <Button variant="outline" onClick={exportRedacted} disabled={!breakdown}>
                  {isAr ? "تصدير (بدون أسماء)" : "Export (Redacted)"}
                </Button>
              </div>

              <div className="space-y-2">
                {questionAgg.map((q, idx) => (
                  <div key={idx} className="rounded-lg border p-3">
                    <div className="font-medium">{isAr ? q.question_text_ar : q.question_text_en}</div>
                    <div className="text-sm text-muted-foreground">
                      {isAr ? "المتوسط" : "Avg"}: {q.avg_value} • {isAr ? "عدد" : "Count"}: {q.count_answers}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="font-medium">{isAr ? "تفاصيل المقيمين" : "Rater Details"}</div>
              {canIdentity && canReveal && details.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {isAr ? "وضع التحقيق (كشف الهوية)" : "Investigation Mode (Identities Revealed)"}
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => exportRowsToCsvBom(`details_${targetName}_${selectedPeriod}.csv`, details)}
                disabled={details.length === 0}
              >
                CSV
              </Button>
              <Button onClick={exportRevealed} disabled={details.length === 0}>
                {isAr ? "تصدير (مع الأسماء)" : "Export (Revealed)"}
              </Button>
            </div>
          </div>

          {canIdentity && canReveal && details.length > 0 ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive">
                {isAr ? "تنبيه" : "Sensitive Access"}
              </div>
              <div className="text-muted-foreground">
                {isAr
                  ? "أنت الآن ترى هويات المقيمين. يتم تسجيل هذا الوصول في سجل التدقيق." 
                  : "You are currently viewing rater identities. This access is logged in the audit trail."}
              </div>
              <div className="mt-2">
                <Link className="text-primary underline" to="/settings/sensitive-access">
                  {isAr ? "عرض سجل الوصول الحساس" : "View sensitive access log"}
                </Link>
              </div>
            </div>
          ) : null}

          {(!canIdentity || !canReveal) && (
            <div className="text-sm text-muted-foreground">
              {isAr
                ? "هذه البيانات مجهولة. يلزم صلاحية كشف الهوية لعرض التفاصيل."
                : "This data is anonymous by default. You need reveal permissions to see identities and full details."}
            </div>
          )}

          {canIdentity && canReveal && detailsError && (
            <div className="text-sm text-destructive">
              {isAr ? "تعذر تحميل تفاصيل المقيمين:" : "Failed to load rater details:"} {detailsError}
            </div>
          )}

          {canIdentity && canReveal && details.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {detailsError
                ? (isAr ? `تعذر تحميل التفاصيل: ${detailsError}` : `Failed to load details: ${detailsError}`)
                : (isAr ? "لا توجد بيانات لهذه الفترة." : "No data for this period.")}
            </div>
          )}

          {details.length > 0 && (
            <div className="space-y-2">
              {details.map((r, idx) => (
                <div key={idx} className="rounded-lg border p-3">
                  <div className="font-medium">{isAr ? r.evaluator_name_ar : r.evaluator_name_en}</div>
                  <div className="text-sm text-muted-foreground">
                    {isAr ? r.question_text_ar : r.question_text_en} — <b>{r.value}</b>
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
