import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Star, User, Building2, Calendar, Send, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';

interface ScoreOption {
  value: number;
  labelEn: string;
  labelAr: string;
  color: string;
}

const scoreOptions: ScoreOption[] = [
  { value: 1, labelEn: 'Bad', labelAr: 'سيء', color: 'bg-danger' },
  { value: 2, labelEn: 'Neutral', labelAr: 'محايد', color: 'bg-warning' },
  { value: 3, labelEn: 'Good', labelAr: 'جيد', color: 'bg-success' },
  { value: 4, labelEn: 'Excellent', labelAr: 'ممتاز', color: 'bg-success' },
];

interface EvaluationData {
  id: string;
  evaluatee_id: string;
  evaluator_id: string | null;
  period: string;
  status: string;
  evaluation_type: string | null;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
  comment: string | null;
  template_snapshot?: any | null;
  scale_max?: number | null;
  labels_snapshot?: any | null;
  evaluatee: {
    name_en: string;
    name_ar: string;
    department_id: string | null;
  } | null;
  department: {
    name_en: string;
    name_ar: string;
  } | null;
}

const EvaluationSurveyPage: React.FC = () => {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { user } = useSupabaseAuth();
  const { toast } = useToast();

  const [evaluation, setEvaluation] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [performance, setPerformance] = useState<number | null>(null);
  const [teamwork, setTeamwork] = useState<number | null>(null);

  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const isTemplateBased = Boolean(evaluation?.template_snapshot && evaluation?.template_snapshot?.questions?.length);

  // Autosave draft to localStorage (best-effort)
  useEffect(() => {
    if (!evaluationId) return;
    if (evaluation?.status === 'completed') return;
    try {
      localStorage.setItem(`eval_draft_${evaluationId}`, JSON.stringify({ answers, performance, teamwork, updatedAt: Date.now() }));
    } catch {}
  }, [evaluationId, evaluation?.status, answers, performance, teamwork]);

  const clearDraft = () => {
    if (!evaluationId) return;
    try { localStorage.removeItem(`eval_draft_${evaluationId}`); } catch {}
    toast({
      title: language === 'ar' ? 'تم' : 'Done',
      description: language === 'ar' ? 'تم حذف المسودة' : 'Draft cleared',
    });
  };

  useEffect(() => {
    if (evaluationId && user) {
      fetchEvaluation();
    }
  }, [evaluationId, user]);

  const fetchEvaluation = async () => {
    if (!evaluationId) return;

    setLoading(true);
    try {
      const { data: evalData, error } = await supabase
        .from('evaluations')
        .select('*')
        .eq('id', evaluationId)
        .maybeSingle();

      if (error) throw error;
      if (!evalData) {
        toast({
          title: language === 'ar' ? 'خطأ' : 'Error',
          description: language === 'ar' ? 'التقييم غير موجود' : 'Evaluation not found',
          variant: 'destructive',
        });
        navigate('/my-evaluations');
        return;
      }

      // Fetch evaluatee profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name_en, name_ar, department_id')
        .eq('id', evalData.evaluatee_id)
        .maybeSingle();

      let departmentData = null;
      if (profileData?.department_id) {
        const { data: deptData } = await supabase
          .from('departments')
          .select('name_en, name_ar')
          .eq('id', profileData.department_id)
          .maybeSingle();
        departmentData = deptData;
      }

      const fullEvaluation: EvaluationData = {
        ...evalData,
        evaluatee: profileData,
        department: departmentData,
      };

      setEvaluation(fullEvaluation);

      // Load local draft (autosave)
      try {
        const raw = localStorage.getItem(`eval_draft_${evaluationId}`);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && typeof d === 'object') {
            if (d.answers && typeof d.answers === 'object') setAnswers(d.answers);
            if (typeof d.performance === 'number') setPerformance(d.performance);
            if (typeof d.teamwork === 'number') setTeamwork(d.teamwork);
          }
        }
      } catch {}

      // Load question answers for template-based evaluations
      if (fullEvaluation?.template_snapshot?.questions?.length) {
        const { data: ansData, error: ansErr } = await supabase
          .from('evaluation_answers')
          .select('question_id,score,text_value')
          .eq('evaluation_id', evaluationId);
        if (ansErr) throw ansErr;
        const map: Record<string, string | number> = {};
        (ansData || []).forEach((a: any) => { map[a.question_id] = (a.text_value ?? a.score); });
        setAnswers(map);
      } else {
        setAnswers({});
      }

      // Pre-fill if already has scores (legacy / editing)
      if (evalData.performance_score > 0) setPerformance(evalData.performance_score);
      if (evalData.teamwork_score > 0) setTeamwork(evalData.teamwork_score);
    } catch (error) {
      console.error('Error fetching evaluation:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'فشل في تحميل التقييم' : 'Failed to load evaluation',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    // Template-based evaluation (questions)
    if (isTemplateBased) {
      const qs: any[] = (evaluation?.template_snapshot?.questions || [])
        .slice()
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
      const requiredQs = qs.filter(q => q.required !== false);
      const missing = requiredQs.filter(q => {
        const v = answers[q.id];
        if ((q.question_type || 'scale') === 'text') return !(typeof v === 'string' && v.trim().length > 0);
        return !(Number.isFinite(Number(v)) && Number(v) >= 1);
      });
      if (missing.length) {
        toast({
          title: language === 'ar' ? 'خطأ' : 'Error',
          description: language === 'ar'
            ? 'يرجى الإجابة على جميع الأسئلة الإجبارية'
            : 'Please answer all required questions',
          variant: 'destructive',
        });
        return;
      }

      const max = Number(evaluation?.scale_max || evaluation?.template_snapshot?.scale_max || 4);
      const values = qs
        .filter(q => (q.question_type || 'scale') !== 'text')
        .map(q => Number(answers[q.id]))
        .filter(v => Number.isFinite(v) && v >= 1 && v <= max);
      if (!values.length) {
        toast({
          title: language === 'ar' ? 'خطأ' : 'Error',
          description: language === 'ar' ? 'لا توجد إجابات للحفظ' : 'No answers to submit',
          variant: 'destructive',
        });
        return;
      }

      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const finalScore = Math.min(max, Math.max(1, Math.round(avg)));

      setSubmitting(true);
      try {
        // Upsert answers
        const upsertPayload = qs
          .filter(q => answers[q.id] !== undefined && answers[q.id] !== null && String(answers[q.id]).length > 0)
          .map(q => {
            const qt = (q.question_type || 'scale') as string;
            if (qt === 'text') {
              const maxChars = Number(q.max_chars || 200);
              const txt = String(answers[q.id] || '').slice(0, maxChars);
              return {
                evaluation_id: evaluationId,
                question_id: q.id,
                score: null,
                text_value: txt,
                updated_at: new Date().toISOString(),
              };
            }
            return {
              evaluation_id: evaluationId,
              question_id: q.id,
              score: Number(answers[q.id]),
              updated_at: new Date().toISOString(),
            };
          });

        const { error: ansErr } = await supabase
          .from('evaluation_answers')
          .upsert(upsertPayload, { onConflict: 'evaluation_id,question_id' });
        if (ansErr) throw ansErr;

        const { error: evalErr } = await supabase
          .from('evaluations')
          .update({
            performance_score: finalScore,
            teamwork_score: finalScore,
            workload_score: null,
            comment: null,
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', evaluationId);
        if (evalErr) throw evalErr;

        toast({
          title: language === 'ar' ? 'تم بنجاح' : 'Success',
          description: language === 'ar'
            ? 'تم حفظ التقييم بنجاح'
            : 'Evaluation submitted successfully',
        });
        navigate('/my-evaluations');
      } catch (error) {
        console.error('Error submitting evaluation:', error);
        toast({
          title: language === 'ar' ? 'خطأ' : 'Error',
          description: language === 'ar'
            ? 'فشل في حفظ التقييم'
            : 'Failed to submit evaluation',
          variant: 'destructive',
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Legacy evaluation (performance/teamwork)
    if (performance === null || teamwork === null) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar'
          ? 'يرجى ملء جميع الحقول المطلوبة'
          : 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('evaluations')
        .update({
          performance_score: performance,
          teamwork_score: teamwork,
          workload_score: null,
          comment: null,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', evaluationId);

      if (error) throw error;

      toast({
        title: language === 'ar' ? 'تم بنجاح' : 'Success',
        description: language === 'ar'
          ? 'تم حفظ التقييم بنجاح'
          : 'Evaluation submitted successfully',
      });

      navigate('/my-evaluations');
    } catch (error) {
      console.error('Error submitting evaluation:', error);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar'
          ? 'فشل في حفظ التقييم'
          : 'Failed to submit evaluation',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const ScoreSelector = ({
    label,
    value,
    onChange,
    required = false,
  }: {
    label: string;
    value: number | null;
    onChange: (val: number) => void;
    required?: boolean;
  }) => (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </Label>
      <div className="flex gap-2">
        {scoreOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex-1 p-3 rounded-lg border-2 transition-all duration-200 ${
              value === option.value
                ? `border-primary ${option.color} text-white`
                : 'border-border hover:border-primary/50 bg-card'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                {[...Array(option.value)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      value === option.value ? 'fill-current' : 'fill-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-medium">
                {language === 'ar' ? option.labelAr : option.labelEn}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!evaluation) {
    return null;
  }

  const isCompleted = evaluation.status === 'completed';

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={() => navigate('/my-evaluations')}
        className="gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        {language === 'ar' ? 'العودة للتقييمات' : 'Back to Evaluations'}
      </Button>

      {/* Employee Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
                <User className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-xl">
                  {evaluation.evaluatee 
                    ? (language === 'ar' ? evaluation.evaluatee.name_ar : evaluation.evaluatee.name_en)
                    : (language === 'ar' ? 'موظف غير معروف' : 'Unknown Employee')}
                </CardTitle>
                <CardDescription className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {evaluation.department 
                      ? (language === 'ar' ? evaluation.department.name_ar : evaluation.department.name_en)
                      : (language === 'ar' ? 'بدون قسم' : 'No Department')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {evaluation.period}
                  </span>
                </CardDescription>
              </div>
            </div>
            <Badge variant={isCompleted ? 'default' : 'secondary'} className={isCompleted ? 'bg-success' : 'bg-warning/20 text-warning'}>
              {isCompleted 
                ? (language === 'ar' ? 'مكتمل' : 'Completed')
                : (language === 'ar' ? 'معلق' : 'Pending')}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Survey Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            {language === 'ar' ? 'نموذج التقييم' : 'Evaluation Form'}
          </CardTitle>
          <CardDescription>
            {isTemplateBased
              ? (language === 'ar'
                  ? 'اختر الإجابة لكل سؤال حسب الخيارات المحددة في القالب.'
                  : 'Answer each question using the template choices.')
              : (language === 'ar'
                  ? 'قيّم زميلك على الأداء والعمل الجماعي'
                  : 'Rate your colleague on Performance and Teamwork')}
          </CardDescription>
          {!isCompleted ? (
            <div className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={clearDraft}>
                {language === 'ar' ? 'حذف المسودة' : 'Clear draft'}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Score Selectors */}
          {isTemplateBased ? (
            <div className="space-y-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-foreground">
                  {evaluation?.template_snapshot?.name || (language === 'ar' ? 'قالب التقييم' : 'Template')}
                </div>
                <Badge variant="outline">
                  {language === 'ar' ? 'الخيارات' : 'Choices'}: {Number(evaluation?.scale_max || evaluation?.template_snapshot?.scale_max || 4)}
                </Badge>

                {/* template_progress_bar */}
                {(() => {
                  const qs: any[] = (evaluation?.template_snapshot?.questions || [])
                    .slice()
                    .sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
                  const required = qs.filter((q: any) => q.required !== false);
                  const answered = required.filter((q: any) => {
                    const v = (answers as any)[q.id];
                    if ((q.question_type || 'scale') === 'text') return typeof v === 'string' && v.trim().length > 0;
                    return Number.isFinite(Number(v)) && Number(v) >= 1;
                  });
                  const pct = required.length ? Math.round((answered.length / required.length) * 100) : 0;
                  return (
                    <div className="w-full mt-2 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{language === 'ar' ? 'التقدم' : 'Progress'}</span>
                        <span>{answered.length}/{required.length} ({pct}%)</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}

              </div>

              {(evaluation?.template_snapshot?.questions || [])
                .slice()
                .sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
                .map((q: any, idx: number) => {
                  const max = Number(evaluation?.scale_max || evaluation?.template_snapshot?.scale_max || 4);
                  const labels = (evaluation?.labels_snapshot || evaluation?.template_snapshot?.labels || {}) as Record<string, any>;
                  return (
                    <div key={q.id} className="space-y-2">
                      <Label className="text-sm font-medium">
                        {language === 'ar' ? `سؤال ${idx + 1}` : `Question ${idx + 1}`}
                        {q.required !== false ? <span className="text-danger ms-1">*</span> : null}
                      </Label>
                      <div className="text-sm text-foreground">
                        {language === 'ar' ? q.text_ar : q.text_en}
                      </div>
                      {(q.question_type || 'scale') === 'text' ? (
                      <div className="space-y-2">
                        <Textarea
                          value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                          onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder={language === 'ar' ? 'اكتب إجابتك هنا...' : 'Type your answer...'}
                          maxLength={Number(q.max_chars || 200)}
                          rows={3}
                        />
                        <div className="text-xs text-muted-foreground">
                          {(typeof answers[q.id] === 'string' ? (answers[q.id] as string).length : 0)}/{Number(q.max_chars || 200)}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Array.from({ length: max }).map((_, i) => {
                          const v = i + 1;
                          const l = labels[String(v)] || {};
                          const active = Number(answers[q.id]) === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: v }))}
                              className={`rounded-lg border-2 p-3 text-left transition ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50 bg-card'}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium opacity-90">{v}</div>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: v }).map((__, s) => (
                                    <Star key={s} className={`w-3.5 h-3.5 ${active ? 'fill-current' : 'fill-muted-foreground/30'}`} />
                                  ))}
                                </div>
                              </div>
                              <div className="mt-1 text-xs font-medium">
                                {language === 'ar' ? (l.ar || '') : (l.en || '')}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="space-y-5 p-4 rounded-lg bg-secondary/30 border border-border/50">
              <ScoreSelector
                label={t('category.performance')}
                value={performance}
                onChange={setPerformance}
                required
              />
              <ScoreSelector
                label={t('category.teamwork')}
                value={teamwork}
                onChange={setTeamwork}
                required
              />
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => navigate('/my-evaluations')}
              disabled={submitting}
            >
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="w-4 h-4 me-2 animate-spin" />
              ) : isCompleted ? (
                <CheckCircle className="w-4 h-4 me-2" />
              ) : (
                <Send className="w-4 h-4 me-2" />
              )}
              {submitting
                ? (language === 'ar' ? 'جاري الإرسال...' : 'Submitting...')
                : isCompleted
                ? (language === 'ar' ? 'تحديث التقييم' : 'Update Evaluation')
                : (language === 'ar' ? 'إرسال التقييم' : 'Submit Evaluation')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EvaluationSurveyPage;
