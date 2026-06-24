import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

type CategoryKey = 'performance' | 'teamwork' | 'workload' | 'overall';

type EvalRow = {
  id: string;
  created_at: string;
  period: string;
  status: string;
  evaluation_type: string | null;
  evaluator_id: string | null;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
  comment: string | null;
  evaluator?: {
    id: string;
    name_en: string | null;
    name_ar: string | null;
    email: string | null;
  } | null;
};

type AnswerRow = {
  evaluation_id: string;
  question_id: string;
  score: number;
  question?: {
    id: string;
    category: string;
    text_en: string;
    text_ar: string;
    sort_order: number;
  } | null;
};

const scoreOf = (e: EvalRow) => {
  const vals: number[] = [e.performance_score, e.teamwork_score];
  if (typeof e.workload_score === 'number') vals.push(e.workload_score);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);

export interface ScoreBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluateeId: string;
  /** Optional preset. If omitted, shows all periods. */
  initialPeriod?: string | null;
  /** Optional filter: allowed evaluation_type values */
  evaluationTypes?: string[] | null;
  /** Optional: highlight which category the admin clicked */
  focus?: CategoryKey;
}

/**
 * Option A (current schema): Explain a score using existing metrics
 * (performance/teamwork/workload) by listing each submitted evaluation row.
 */
const ScoreBreakdownDialog: React.FC<ScoreBreakdownDialogProps> = ({
  open,
  onOpenChange,
  evaluateeId,
  initialPeriod = null,
  evaluationTypes = null,
  focus = 'overall',
}) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [answersByEval, setAnswersByEval] = useState<Record<string, AnswerRow[]>>({});
  const [period, setPeriod] = useState<string>(initialPeriod ?? 'all');

  useEffect(() => {
    if (!open) return;
    setPeriod(initialPeriod ?? 'all');
    setAnswersByEval({});
  }, [open, initialPeriod]);

  useEffect(() => {
    if (!open) return;
    let isMounted = true;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from('evaluations')
          .select(
            'id,created_at,period,status,evaluation_type,evaluator_id,performance_score,teamwork_score,workload_score,comment,evaluator:profiles!evaluations_evaluator_id_fkey(id,name_en,name_ar,email)'
          )
          .eq('evaluatee_id', evaluateeId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false });

        if (period !== 'all') q = q.eq('period', period);
        if (evaluationTypes?.length) q = q.in('evaluation_type', evaluationTypes);

        const { data, error: qErr } = await q;
        if (qErr) throw qErr;

        if (!isMounted) return;
        const evalRows = (data as any as EvalRow[]) ?? [];
        setRows(evalRows);

        // Option B (if present): fetch per-question answers for richer admin drill-down.
        // If the table doesn't exist in the project yet, we fail silently.
        try {
          const evalIds = evalRows.map((r) => r.id);
          if (evalIds.length) {
            const { data: aData, error: aErr } = await supabase
              .from('evaluation_answers')
              .select('evaluation_id,question_id,score,question:evaluation_questions(id,category,text_en,text_ar,sort_order)')
              .in('evaluation_id', evalIds);
            if (aErr) throw aErr;

            const by: Record<string, AnswerRow[]> = {};
            for (const a of (aData as any as AnswerRow[]) ?? []) {
              (by[a.evaluation_id] ||= []).push(a);
            }
            if (!isMounted) return;
            setAnswersByEval(by);
          } else {
            setAnswersByEval({});
          }
        } catch {
          // ignore (older DB doesn't have the new tables)
          if (!isMounted) return;
          setAnswersByEval({});
        }
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message ?? (language === 'ar' ? 'حدث خطأ غير متوقع.' : 'Unexpected error.'));
        setRows([]);
        setAnswersByEval({});
      } finally {
        if (!isMounted) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [open, evaluateeId, period, language, JSON.stringify(evaluationTypes ?? [])]);

  const availablePeriods = useMemo(() => {
    const unique = Array.from(new Set(rows.map((r) => r.period))).sort();
    return unique;
  }, [rows]);

  const summary = useMemo(() => {
    const perf = avg(rows.map((r) => r.performance_score));
    const team = avg(rows.map((r) => r.teamwork_score));
    const wl = avg(rows.map((r) => (typeof r.workload_score === 'number' ? r.workload_score : 0)).filter((n) => Number.isFinite(n)));
    const overall = avg(rows.map((r) => scoreOf(r)));
    return {
      performance: perf,
      teamwork: team,
      workload: wl,
      overall,
      count: rows.length,
    };
  }, [rows]);

  const title = language === 'ar' ? 'تفاصيل حساب الدرجة' : 'Score breakdown';
  const desc =
    language === 'ar'
      ? 'يعرض هذا الجدول كل تقييم مُرسل (من قيّم؟ وما الدرجة في كل معيار).'
      : 'This shows each submitted evaluation (who rated, and what they gave for each metric).';

  const focusLabel = (k: CategoryKey) => {
    if (language === 'ar') {
      if (k === 'performance') return 'الأداء';
      if (k === 'teamwork') return 'التعاون';
      if (k === 'workload') return 'عبء العمل';
      return 'الإجمالي';
    }
    if (k === 'performance') return 'Performance';
    if (k === 'teamwork') return 'Teamwork';
    if (k === 'workload') return 'Workload';
    return 'Overall';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{title}</span>
            <span className="text-xs text-muted-foreground">{language === 'ar' ? 'التركيز:' : 'Focus:'} {focusLabel(focus)}</span>
          </DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-sm text-muted-foreground">{language === 'ar' ? 'الفترة' : 'Period'}</div>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Choose...'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'ar' ? 'كل الفترات' : 'All periods'}</SelectItem>
                {availablePeriods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            {language === 'ar' ? 'عدد التقييمات:' : 'Evaluations:'} <span className="text-foreground font-medium">{summary.count}</span>
          </div>
        </div>

        <Separator />

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border p-3 bg-background/40">
            <div className="text-xs text-muted-foreground">{language === 'ar' ? 'متوسط الأداء' : 'Avg performance'}</div>
            <div className="text-lg font-semibold">{summary.performance === null ? '—' : summary.performance.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-border p-3 bg-background/40">
            <div className="text-xs text-muted-foreground">{language === 'ar' ? 'متوسط التعاون' : 'Avg teamwork'}</div>
            <div className="text-lg font-semibold">{summary.teamwork === null ? '—' : summary.teamwork.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-border p-3 bg-background/40">
            <div className="text-xs text-muted-foreground">{language === 'ar' ? 'متوسط عبء العمل' : 'Avg workload'}</div>
            <div className="text-lg font-semibold">{summary.workload === null ? '—' : summary.workload.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-border p-3 bg-background/40">
            <div className="text-xs text-muted-foreground">{language === 'ar' ? 'المتوسط الإجمالي' : 'Avg overall'}</div>
            <div className="text-lg font-semibold">{summary.overall === null ? '—' : summary.overall.toFixed(2)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <ScrollArea className="h-[360px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur border-b border-border">
                <tr>
                  <th className="text-start font-medium p-3">{language === 'ar' ? 'المُقيّم' : 'Evaluator'}</th>
                  <th className="text-center font-medium p-3">{language === 'ar' ? 'الأداء' : 'Performance'}</th>
                  <th className="text-center font-medium p-3">{language === 'ar' ? 'التعاون' : 'Teamwork'}</th>
                  <th className="text-center font-medium p-3">{language === 'ar' ? 'عبء العمل' : 'Workload'}</th>
                  <th className="text-center font-medium p-3">{language === 'ar' ? 'الإجمالي' : 'Overall'}</th>
                  <th className="text-start font-medium p-3">{language === 'ar' ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      <div className="inline-flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'ar' ? 'جاري التحميل...' : 'Loading...'}
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-destructive">
                      {error}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {language === 'ar' ? 'لا توجد تقييمات مكتملة لهذا الاختيار.' : 'No completed evaluations for this selection.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const evaluatorName =
                      (language === 'ar' ? r.evaluator?.name_ar : r.evaluator?.name_en) || r.evaluator?.email || r.evaluator_id || '—';
                    const answers = (answersByEval[r.id] || []).slice().sort((a, b) => (a.question?.sort_order ?? 0) - (b.question?.sort_order ?? 0));
                    return (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-3">
                          <div className="font-medium text-foreground">{evaluatorName}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.evaluation_type ?? (language === 'ar' ? '—' : '—')} • {r.period}
                            {r.comment ? ` • ${r.comment.slice(0, 40)}${r.comment.length > 40 ? '…' : ''}` : ''}
                          </div>
                          {answers.length ? (
                            <details className="mt-2">
                              <summary className="text-xs text-primary cursor-pointer select-none">
                                {language === 'ar' ? 'عرض تفاصيل الأسئلة' : 'Show question details'}
                              </summary>
                              <div className="mt-2 space-y-1">
                                {answers.map((a) => (
                                  <div key={a.question_id} className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 px-2 py-1">
                                    <div className="text-xs text-muted-foreground leading-5">
                                      {(language === 'ar' ? a.question?.text_ar : a.question?.text_en) || (language === 'ar' ? 'سؤال' : 'Question')}
                                    </div>
                                    <div className="text-xs font-semibold text-foreground">{a.score}</div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </td>
                        <td className="p-3 text-center">{r.performance_score}</td>
                        <td className="p-3 text-center">{r.teamwork_score}</td>
                        <td className="p-3 text-center">{typeof r.workload_score === 'number' ? r.workload_score : '—'}</td>
                        <td className="p-3 text-center font-medium">{scoreOf(r).toFixed(2)}</td>
                        <td className="p-3 text-start text-muted-foreground">{new Date(r.created_at).toLocaleString(language === 'ar' ? 'ar' : 'en')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScoreBreakdownDialog;
