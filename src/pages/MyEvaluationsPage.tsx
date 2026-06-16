import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, User, Building2, Calendar, ChevronRight, Inbox, ShieldCheck } from 'lucide-react';

interface PendingEvaluation {
  id: string;
  evaluatee_id: string;
  period: string;
  status: string;
  evaluation_type: string | null;
  created_at: string;
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
interface PendingAnonymousEvaluation {
  id: string;
  title: string;
  created_at: string;
  reveal_identity: boolean;
  submitted: boolean;
}

const MyEvaluationsPage: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useSupabaseAuth();
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<PendingEvaluation[]>([]);
  const [anonEvals, setAnonEvals] = useState<PendingAnonymousEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchPendingEvaluations();
      fetchAnonymousEvaluations();
    }
  }, [user]);

  const fetchPendingEvaluations = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Fetch evaluations where current user is the evaluator and status is pending
      const { data: evalData, error } = await supabase
        .from('evaluations')
        .select('id, evaluatee_id, period, status, evaluation_type, created_at')
        .eq('evaluator_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch evaluatee profiles and departments
      const evaluationsWithDetails: PendingEvaluation[] = [];
      
      for (const evaluation of evalData || []) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('name_en, name_ar, department_id')
          .eq('id', evaluation.evaluatee_id)
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

        evaluationsWithDetails.push({
          ...evaluation,
          evaluatee: profileData,
          department: departmentData,
        });
      }

      setEvaluations(evaluationsWithDetails);
    } catch (error) {
      console.error('Error fetching pending evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnonymousEvaluations = async () => {
    if (!user) return;

    try {
      const { data: recData, error } = await supabase
        .from('anonymous_evaluation_recipients')
        .select('evaluation_id, anonymous_evaluations(id,title,created_at,reveal_identity)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (recData || [])
        .map((r: any) => r.anonymous_evaluations)
        .filter(Boolean);

      // compute submitted flags (RPC works for both anonymous & identified)
      const results: PendingAnonymousEvaluation[] = [];
      for (const e of rows) {
        const { data: hasData } = await supabase.rpc('anonymous_evaluation_has_submitted', { p_evaluation_id: e.id });
        results.push({
          id: e.id,
          title: e.title,
          created_at: e.created_at,
          reveal_identity: !!e.reveal_identity,
          submitted: Boolean(hasData),
        });
      }

      setAnonEvals(results);
    } catch (err) {
      console.error('Error fetching anonymous evaluations:', err);
    }
  };


  const handleEvaluationClick = (evaluationId: string) => {
    navigate(`/evaluations/${evaluationId}`);
  };

  const getEvaluationTypeLabel = (type: string | null) => {
    const t = (type || '').toLowerCase();
    if (t === 'self_station') return language === 'ar' ? 'تقييم داخلي للوحدة / المحطة' : 'Self Station / Unit';
    if (t === 'cross_station') return language === 'ar' ? 'تقييم بين الوحدات / المحطات' : 'Cross Station';
    if (t === 'cross' || t === 'cross_department' || t === 'cross_individuals' || t === 'cross_managers') return language === 'ar' ? 'تقييم بين الأقسام' : 'Cross Department';
    if (t === 'manager_to_team') return language === 'ar' ? 'تقييم المدير للفريق' : 'Manager → Team';
    if (t === 'team_to_manager') return language === 'ar' ? 'تقييم الفريق للمدير' : 'Team → Manager';
    return language === 'ar' ? 'تقييم داخلي قديم' : 'Legacy Self Dept';
  };

  const formatPeriod = (period: string) => {
    return period;
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'ar' ? 'تقييماتي المعلقة' : 'My Pending Evaluations'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {language === 'ar' 
              ? `${evaluations.length} تقييم(ات) بانتظار إكمالها`
              : `${evaluations.length} evaluation(s) waiting to be completed`}
          </p>
        </div>
      </div>

      
      {/* Anonymous Evaluations */}
      {anonEvals.length ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              {language === 'ar' ? 'التقييمات المجهولة' : 'Anonymous Evaluations'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {language === 'ar'
                ? 'استبيانات نصية قد يرسلها المدير. قد تكون مجهولة بالكامل أو مع إظهار الهوية للمدير.'
                : 'Text-only surveys sent by Admin. They can be fully anonymous or identified to admin.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {anonEvals.map(a => (
              <Card
                key={a.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
                onClick={() => navigate(`/anonymous-evaluations/${a.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.reveal_identity ? 'secondary' : 'outline'} className="text-xs">
                        {a.reveal_identity ? (language === 'ar' ? 'هوية ظاهرة' : 'Identified') : (language === 'ar' ? 'مجهول' : 'Anonymous')}
                      </Badge>
                      <Badge variant={a.submitted ? 'secondary' : 'outline'} className={`text-xs ${a.submitted ? 'bg-success/15 text-success' : ''}`}>
                        {a.submitted ? (language === 'ar' ? 'تم الإرسال' : 'Submitted') : (language === 'ar' ? 'جديد' : 'New')}
                      </Badge>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      ) : null}

{/* Evaluations List */}
      {evaluations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              {language === 'ar' ? 'لا توجد تقييمات معلقة' : 'No pending evaluations'}
            </p>
            <p className="text-sm text-muted-foreground/70">
              {language === 'ar' 
                ? 'جميع التقييمات المطلوبة قد تم إكمالها'
                : 'All requested evaluations have been completed'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {evaluations.map((evaluation) => (
            <Card
              key={evaluation.id}
              className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group"
              onClick={() => handleEvaluationClick(evaluation.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                      <User className="w-6 h-6 text-muted-foreground" />
                    </div>

                    {/* Details */}
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">
                        {evaluation.evaluatee 
                          ? (language === 'ar' ? evaluation.evaluatee.name_ar : evaluation.evaluatee.name_en)
                          : (language === 'ar' ? 'موظف غير معروف' : 'Unknown Employee')}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" />
                          {evaluation.department 
                            ? (language === 'ar' ? evaluation.department.name_ar : evaluation.department.name_en)
                            : (language === 'ar' ? 'بدون قسم' : 'No Department')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatPeriod(evaluation.period)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-xs">
                        {getEvaluationTypeLabel(evaluation.evaluation_type)}
                      </Badge>
                      <Badge variant="secondary" className="text-xs bg-warning/20 text-warning">
                        {language === 'ar' ? 'معلق' : 'Pending'}
                      </Badge>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyEvaluationsPage;
