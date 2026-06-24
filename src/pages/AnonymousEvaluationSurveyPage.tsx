import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, ShieldCheck } from 'lucide-react';

type AnonEval = {
  id: string;
  title: string;
  question_en: string;
  question_ar: string;
  reveal_identity: boolean;
};

const AnonymousEvaluationSurveyPage: React.FC = () => {
  const { evaluationId } = useParams();
  const { language } = useLanguage();
  const { user } = useSupabaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [evaluation, setEvaluation] = useState<AnonEval | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState('');

  // Autosave draft
  useEffect(() => {
    if (!evaluationId) return;
    if (submitted) {
      try { localStorage.removeItem(`anon_draft_${evaluationId}`); } catch {}
      return;
    }
    try { localStorage.setItem(`anon_draft_${evaluationId}`, answer); } catch {}
  }, [evaluationId, submitted, answer]);

  const clearDraft = () => {
    if (!evaluationId) return;
    try { localStorage.removeItem(`anon_draft_${evaluationId}`); } catch {}
    setAnswer('');
    toast({
      title: language === 'ar' ? 'تم' : 'Done',
      description: language === 'ar' ? 'تم حذف المسودة' : 'Draft cleared',
    });
  };

  useEffect(() => {
    if (!evaluationId || !user) return;
    void load();
  }, [evaluationId, user?.id]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('anonymous_evaluations')
        .select('id,title,question_en,question_ar,reveal_identity')
        .eq('id', evaluationId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error(language === 'ar' ? 'غير موجود' : 'Not found');

      setEvaluation(data as any);

      const { data: hasData, error: hasErr } = await supabase
        .rpc('anonymous_evaluation_has_submitted', { p_evaluation_id: evaluationId });

      if (hasErr) throw hasErr;
      setSubmitted(Boolean(hasData));


      // Load draft if any
      try {
        const d = localStorage.getItem(`anon_draft_${evaluationId}`);
        if (d) setAnswer(d);
      } catch {}
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل التحميل' : 'Failed to load'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!evaluationId) return;
    if (!answer.trim()) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اكتب إجابتك أولاً' : 'Please type your answer first',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .rpc('submit_anonymous_evaluation_response', { p_evaluation_id: evaluationId, p_answer_text: answer });

      if (error) throw error;

      toast({
        title: language === 'ar' ? 'تم' : 'Done',
        description: language === 'ar' ? 'تم إرسال إجابتك' : 'Your response was submitted',
      });
      setSubmitted(true);
      setAnswer('');
      navigate('/my-evaluations');
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل الإرسال' : 'Submit failed'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={language === 'ar' ? 'التقييم المجهول' : 'Anonymous Evaluation'} />
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {language === 'ar' ? 'لم يتم العثور على التقييم' : 'Evaluation not found'}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={language === 'ar' ? 'التقييم المجهول' : 'Anonymous Evaluation'} />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              {evaluation.title}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 flex-wrap">
              <Badge variant={evaluation.reveal_identity ? 'secondary' : 'outline'}>
                {evaluation.reveal_identity
                  ? (language === 'ar' ? 'هوية ظاهرة للمدير' : 'Identity visible to admin')
                  : (language === 'ar' ? 'مجهول بالكامل' : 'Fully anonymous')}
              </Badge>
              {submitted ? (
                <Badge variant="secondary" className="bg-success/15 text-success">
                  {language === 'ar' ? 'تم الإرسال' : 'Submitted'}
                </Badge>
              ) : null}
            </CardDescription>
              {!submitted ? (
                <div className="pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={clearDraft}>
                    {language === 'ar' ? 'حذف المسودة' : 'Clear draft'}
                  </Button>
                </div>
              ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-foreground whitespace-pre-wrap">
              {language === 'ar' ? evaluation.question_ar : evaluation.question_en}
            </div>

            {submitted ? (
              <div className="text-sm text-muted-foreground">
                {language === 'ar' ? 'لقد قمت بإرسال إجابتك بالفعل.' : 'You already submitted your response.'}
              </div>
            ) : (
              <>
                <Textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={6}
                  placeholder={language === 'ar' ? 'اكتب إجابتك هنا...' : 'Type your answer...'}
                />
                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="outline" onClick={clearDraft} disabled={submitting}>
                    {language === 'ar' ? 'حذف المسودة' : 'Clear draft'}
                  </Button>
                  <Button onClick={() => void submit()} disabled={submitting} className="gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {language === 'ar' ? 'إرسال' : 'Submit'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AnonymousEvaluationSurveyPage;
