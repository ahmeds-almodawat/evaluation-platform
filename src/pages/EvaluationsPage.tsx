import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DebouncedInput from '@/components/common/DebouncedInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import InitiateEvaluationDialog from '@/components/evaluations/InitiateEvaluationDialog';
import {
  ClipboardCheck,
  Search,
  Filter,
  Calendar,
  Star,
  User,
  TrendingUp,
  Users,
  Briefcase,
  MessageSquare,
  ChevronRight,
  Bell,
  Lock,
  ArrowLeftRight,
  Building2,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface EvaluationWithProfiles {
  id: string;
  evaluator_id: string | null;
  evaluatee_id: string;
  performance_score: number;
  teamwork_score: number;
  workload_score: number | null;
  period: string;
  comment: string | null;
  created_at: string;
  evaluatee_name_en?: string;
  evaluatee_name_ar?: string;
  evaluatee_department_id?: string | null;
  evaluator_name_en?: string;
  evaluator_name_ar?: string;
  evaluator_department_id?: string | null;
}

interface DisplayEvaluation {
  id: string;
  type: string;
  typeAr: string;
  rawType: string;
  rawScope: string;
  normalizedType: Exclude<EvaluationFilterType, 'all'> | 'other';
  date: string;
  score: number;
  performance: number;
  teamwork: number;
  workload: number | null;
  comment: string | null;
  evaluateeName: string;
  evaluateeNameAr: string;
}

type EvaluationFilterType =
  | 'all'
  | 'self_station'
  | 'cross_station'
  | 'cross_department'
  | 'manager_to_team'
  | 'team_to_manager'
  | 'manager_to_supervisors'
  | 'legacy';

const matchesEvaluationTypeFilter = (
  evaluation: DisplayEvaluation,
  selectedFilter: EvaluationFilterType,
) => {
  if (selectedFilter === 'all') return true;

  const rawType = evaluation.rawType;
  const rawScope = evaluation.rawScope;

  if (selectedFilter === 'self_station') {
    return rawType === 'self_station' || rawScope === 'unit_peer';
  }
  if (selectedFilter === 'cross_station') {
    return rawType === 'cross_station' || rawScope === 'cross_unit';
  }
  if (selectedFilter === 'cross_department') {
    return (
      rawType === 'cross_department' ||
      rawType === 'cross_individuals' ||
      rawType === 'cross_managers' ||
      rawType === 'cross' ||
      rawScope === 'cross_department'
    );
  }
  if (selectedFilter === 'manager_to_team') {
    return rawType === 'manager_to_team';
  }
  if (selectedFilter === 'team_to_manager') {
    return rawType === 'team_to_manager';
  }
  if (selectedFilter === 'manager_to_supervisors') {
    return rawType === 'manager_to_supervisors';
  }
  if (selectedFilter === 'legacy') {
    return evaluation.normalizedType === 'legacy';
  }

  return false;
};

const EvaluationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { role, user, profile, hasPermission } = useSupabaseAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<EvaluationFilterType>('all');
  const [selectedEvaluation, setSelectedEvaluation] = useState<DisplayEvaluation | null>(null);
  const [evaluations, setEvaluations] = useState<DisplayEvaluation[]>([]);
  const [departmentLinks, setDepartmentLinks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSelfStationDialog, setShowSelfStationDialog] = useState(false);
  const [showCrossStationDialog, setShowCrossStationDialog] = useState(false);
  const [showCrossDepartmentDialog, setShowCrossDepartmentDialog] = useState(false);
  const [showManagerToTeamDialog, setShowManagerToTeamDialog] = useState(false);
  const [showTeamToManagerDialog, setShowTeamToManagerDialog] = useState(false);
  const [showManagerToSupervisorsDialog, setShowManagerToSupervisorsDialog] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    average: 0,
    thisMonth: 0,
    participation: 0,
  });

  useEffect(() => {
    fetchEvaluations();
    if (profile?.department_id) {
      fetchDepartmentLinks(profile.department_id);
    }
  }, [profile?.department_id, role]);

  const fetchDepartmentLinks = async (deptId: string) => {
    try {
      const { data } = await supabase
        .from('department_links')
        .select('source_department_id, target_department_id')
        .or(`source_department_id.eq.${deptId},target_department_id.eq.${deptId}`);
      
      if (data) {
        const linkedDepts = data.map(link => 
          link.source_department_id === deptId ? link.target_department_id : link.source_department_id
        );
        setDepartmentLinks([deptId, ...linkedDepts]);
      }
    } catch (error) {
      console.error('Error fetching department links:', error);
    }
  };

  const fetchEvaluations = async () => {
    setLoading(true);
    try {
      // Fetch evaluations
      const { data: evalData, error: evalError } = await supabase
        .from('evaluations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (evalError) throw evalError;

      // Fetch all profiles to join with evaluations
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name_en, name_ar, department_id, is_active, deleted_at');
      
      if (profilesError) throw profilesError;

      // Create a profile lookup map
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const activeProfileIds = new Set(
        (profiles || [])
          .filter((p) => p.is_active !== false && p.deleted_at == null)
          .map((p) => p.id),
      );

      // Transform evaluations with profile data
      const transformedEvaluations: DisplayEvaluation[] = (evalData || []).map(e => {
        const evaluatee = profileMap.get(e.evaluatee_id);
        const evaluator = profileMap.get(e.evaluator_id || '');
        
        // Determine evaluation label. Legacy values are preserved for history, while new campaigns use explicit station/manager types.
        const evalType = (e.evaluation_type || '').toLowerCase();
        const evalScope = ((e as any).evaluation_scope || '').toLowerCase();
        const isLegacySame = evalType === 'same' || (!evalType && !!evaluator && !!evaluatee && evaluator.department_id === evaluatee.department_id);
        const avgScore = (e.performance_score + e.teamwork_score + (e.workload_score || 0)) / 
          (e.workload_score ? 3 : 2);

        const normalizedType: DisplayEvaluation['normalizedType'] = (() => {
          if (evalType === 'self_station' || evalScope === 'unit_peer') return 'self_station';
          if (evalType === 'cross_station' || evalScope === 'cross_unit') return 'cross_station';
          if (evalType === 'manager_to_team') return 'manager_to_team';
          if (evalType === 'team_to_manager') return 'team_to_manager';
          if (evalType === 'manager_to_supervisors') return 'manager_to_supervisors';
          if (evalType === 'cross_department' || evalType === 'cross_individuals' || evalType === 'cross_managers' || evalType === 'cross' || evalScope === 'cross_department') return 'cross_department';
          if (isLegacySame) return 'legacy';
          return 'other';
        })();

        const getTypeLabel = () => {
          if (normalizedType === 'self_station') return { en: 'Self Station / Unit', ar: 'تقييم داخلي للوحدة / المحطة' };
          if (normalizedType === 'cross_station') return { en: 'Multi-Station Cross Evaluation', ar: 'تقييم متعدد بين المحطات / الوحدات' };
          if (normalizedType === 'manager_to_team') return { en: 'Supervisor/Manager → Team', ar: 'المشرف/المدير → الفريق' };
          if (normalizedType === 'team_to_manager') return { en: 'Team → Supervisor/Manager', ar: 'الفريق → المشرف/المدير' };
          if (normalizedType === 'manager_to_supervisors') return { en: 'Manager → Supervisors', ar: 'المدير → المشرفين' };
          if (normalizedType === 'cross_department') return { en: 'Cross Department', ar: 'تقييم بين الأقسام' };
          if (normalizedType === 'legacy') return { en: 'Legacy Self Dept', ar: 'تقييم داخلي قديم' };
          return { en: 'Evaluation', ar: 'تقييم' };
        };

        const label = getTypeLabel();

        return {
          id: e.id,
          type: label.en,
          typeAr: label.ar,
          rawType: evalType,
          rawScope: evalScope,
          normalizedType,
          date: new Date(e.created_at).toLocaleDateString(),
          score: avgScore,
          performance: e.performance_score,
          teamwork: e.teamwork_score,
          workload: e.workload_score,
          comment: e.comment,
          evaluateeName: evaluatee?.name_en || 'Unknown',
          evaluateeNameAr: evaluatee?.name_ar || 'غير معروف',
        };
      });

      setEvaluations(transformedEvaluations);

      // Calculate stats
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const thisMonthEvals = (evalData || []).filter(e => {
        const evalDate = new Date(e.created_at);
        return evalDate.getMonth() === currentMonth && evalDate.getFullYear() === currentYear;
      });

      const activeProfileCount = activeProfileIds.size;
      const evaluatedActiveUsers = new Set(
        (evalData || [])
          .map(e => e.evaluatee_id)
          .filter((id): id is string => Boolean(id) && activeProfileIds.has(id)),
      );
      
      setStats({
        total: transformedEvaluations.length,
        average: transformedEvaluations.length > 0 
          ? transformedEvaluations.reduce((sum, e) => sum + e.score, 0) / transformedEvaluations.length
          : 0,
        thisMonth: thisMonthEvals.length,
        participation: activeProfileCount > 0
          ? Math.round((evaluatedActiveUsers.size / activeProfileCount) * 100)
          : 0,
      });

    } catch (error) {
      console.error('Error fetching evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreClass = (score: number) => {
    if (score >= 2.5) return 'score-high';
    if (score >= 1.8) return 'score-mid';
    return 'score-low';
  };

  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Filter evaluations based on search and filter type. Deferred search keeps typing responsive.
  const filteredEvaluations = useMemo(() => {
    const trimmedSearch = deferredSearchTerm.trim();
    const searchLower = trimmedSearch.toLowerCase();

    return evaluations.filter((evaluation) => {
      // Filter by type
      if (!matchesEvaluationTypeFilter(evaluation, filterType)) return false;
      
      // Filter by search term
      if (trimmedSearch) {
        return (
          evaluation.evaluateeName.toLowerCase().includes(searchLower) ||
          evaluation.evaluateeNameAr.includes(trimmedSearch)
        );
      }
      
      return true;
    });
  }, [evaluations, filterType, deferredSearchTerm]);

  // Check if current user can create evaluations (permission-first; legacy role is fallback only)
  const canCreateEvaluations = hasPermission('evaluations.manage') || hasPermission('evaluations.custom.create');
  const canManageAnonymous = hasPermission('evaluations.anonymous.manage');
  const isAuditorOrUser = !canCreateEvaluations;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header title={t('nav.evaluations')} />
      
      <div className="p-6 space-y-6">
        {/* Header with Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {language === 'ar' ? 'سجل التقييمات' : 'Evaluation History'}
            </h2>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' 
                ? 'عرض وإدارة التقييمات الشهرية'
                : 'View and manage monthly evaluations'}
            </p>
          </div>
          
          {canCreateEvaluations ? (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowSelfStationDialog(true)}
              >
                <Users className="w-4 h-4" />
                {language === 'ar' ? 'تقييم داخلي للوحدة / المحطة' : 'Self Station / Unit'}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowCrossStationDialog(true)}
              >
                <ArrowLeftRight className="w-4 h-4" />
                {language === 'ar' ? 'تقييم بين الوحدات / المحطات' : 'Cross Station'}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowCrossDepartmentDialog(true)}
              >
                <Building2 className="w-4 h-4" />
                {language === 'ar' ? 'تقييم بين الأقسام' : 'Cross Department'}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowManagerToTeamDialog(true)}
              >
                <User className="w-4 h-4" />
                {language === 'ar' ? 'المشرف/المدير → الفريق' : 'Supervisor/Manager → Team'}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowTeamToManagerDialog(true)}
              >
                <ShieldCheck className="w-4 h-4" />
                {language === 'ar' ? 'الفريق → المشرف/المدير' : 'Team → Supervisor/Manager'}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowManagerToSupervisorsDialog(true)}
              >
                <Briefcase className="w-4 h-4" />
                {language === 'ar' ? 'المدير → المشرفين' : 'Manager → Supervisors'}
              </Button>
              {canManageAnonymous ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate('/evaluations/anonymous')}
                >
                  <ShieldCheck className="w-4 h-4" />
                  {language === 'ar' ? 'تقييم مجهول' : 'Anonymous Evaluation'}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground bg-secondary/50 px-4 py-2 rounded-lg">
              <Lock className="w-4 h-4" />
              <span className="text-sm">
                {language === 'ar' 
                  ? 'التقييمات تُنشأ بواسطة المشرفين فقط'
                  : 'Evaluations are created by supervisors only'}
              </span>
            </div>
          )}
        </div>

        {/* Info banner for auditors and regular users */}
        {isAuditorOrUser && (
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3 animate-fade-in-up">
            <Bell className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {language === 'ar' ? 'إشعارات التقييم' : 'Evaluation Notifications'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'ar' 
                  ? 'ستتلقى إشعارات عند إنشاء تقييمات جديدة بواسطة المشرفين. راجع أيقونة الإشعارات للتحديثات.'
                  : 'You will receive notifications when new evaluations are created by supervisors. Check the notification icon for updates.'}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 animate-fade-in-up">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <DebouncedInput
              type="text"
              placeholder={t('action.search')}
              value={searchTerm}
              onValueChange={setSearchTerm}
              className="pl-10"
            />
          </div>
          
          <Select value={filterType} onValueChange={(value) => setFilterType(value as EvaluationFilterType)}>
            <SelectTrigger className="w-full md:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder={t('action.filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {language === 'ar' ? 'جميع الأنواع' : 'All Types'}
              </SelectItem>
              <SelectItem value="self_station">
                {language === 'ar' ? 'تقييم داخلي للوحدة / المحطة' : 'Self Station / Unit'}
              </SelectItem>
              <SelectItem value="cross_station">
                {language === 'ar' ? 'تقييم متعدد بين المحطات / الوحدات' : 'Multi-Station Cross Evaluation'}
              </SelectItem>
              <SelectItem value="cross_department">
                {language === 'ar' ? 'تقييم بين الأقسام' : 'Cross Department'}
              </SelectItem>
              <SelectItem value="manager_to_team">
                {language === 'ar' ? 'المشرف/المدير → الفريق' : 'Supervisor/Manager → Team'}
              </SelectItem>
              <SelectItem value="team_to_manager">
                {language === 'ar' ? 'الفريق → المشرف/المدير' : 'Team → Supervisor/Manager'}
              </SelectItem>
              <SelectItem value="manager_to_supervisors">
                {language === 'ar' ? 'المدير → المشرفين' : 'Manager → Supervisors'}
              </SelectItem>
              <SelectItem value="legacy">
                {language === 'ar' ? 'تقييمات قديمة' : 'Legacy Evaluations'}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Evaluation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEvaluations.length === 0 ? (
            <div className="col-span-2 bg-card rounded-xl p-8 shadow-md text-center text-muted-foreground">
              {language === 'ar' ? 'لا توجد تقييمات حتى الآن' : 'No evaluations yet'}
            </div>
          ) : (
            filteredEvaluations.map((evaluation, index) => (
              <button
                key={evaluation.id}
                onClick={() => setSelectedEvaluation(evaluation)}
                className="bg-card rounded-xl p-5 shadow-md border border-border/50 hover:shadow-lg hover:border-primary/30 transition-all duration-300 animate-fade-in-up text-left w-full cursor-pointer group"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <ClipboardCheck className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {language === 'ar' ? evaluation.evaluateeNameAr : evaluation.evaluateeName}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-2 py-0.5 bg-secondary rounded">
                          {language === 'ar' ? evaluation.typeAr : evaluation.type}
                        </span>
                        <Calendar className="w-3 h-3" />
                        <span>{evaluation.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`score-badge ${getScoreClass(evaluation.score)}`}>
                      <Star className="w-3 h-3 mr-1" />
                      {evaluation.score.toFixed(1)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>

                {/* Category Scores */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t('category.performance')}
                    </p>
                    <p className={`text-lg font-bold ${evaluation.performance >= 2.5 ? 'text-success' : evaluation.performance >= 1.8 ? 'text-warning' : 'text-danger'}`}>
                      {evaluation.performance.toFixed(1)}
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t('category.teamwork')}
                    </p>
                    <p className={`text-lg font-bold ${evaluation.teamwork >= 2.5 ? 'text-success' : evaluation.teamwork >= 1.8 ? 'text-warning' : 'text-danger'}`}>
                      {evaluation.teamwork.toFixed(1)}
                    </p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t('category.workload')}
                    </p>
                    <p className={`text-lg font-bold ${(evaluation.workload || 0) >= 2.5 ? 'text-success' : (evaluation.workload || 0) >= 1.8 ? 'text-warning' : 'text-danger'}`}>
                      {evaluation.workload?.toFixed(1) || '—'}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-lg p-4 shadow-md text-center animate-fade-in-up">
            <p className="text-3xl font-bold text-primary">{stats.total}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'ar' ? 'إجمالي التقييمات' : 'Total Evaluations'}
            </p>
          </div>
          <div className="bg-card rounded-lg p-4 shadow-md text-center animate-fade-in-up">
            <p className="text-3xl font-bold text-success">{stats.average.toFixed(1)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'ar' ? 'متوسط الدرجات' : 'Average Score'}
            </p>
          </div>
          <div className="bg-card rounded-lg p-4 shadow-md text-center animate-fade-in-up">
            <p className="text-3xl font-bold text-warning">{stats.thisMonth}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'ar' ? 'هذا الشهر' : 'This Month'}
            </p>
          </div>
          <div className="bg-card rounded-lg p-4 shadow-md text-center animate-fade-in-up">
            <p className="text-3xl font-bold text-foreground">{stats.participation}%</p>
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'ar' ? 'معدل المشاركة' : 'Participation Rate'}
            </p>
          </div>
        </div>
      </div>

      {/* Evaluation Creation Dialogs - legacy Self Dept creation is intentionally hidden; old records remain visible in history. */}
      {canCreateEvaluations && (
        <>
          <InitiateEvaluationDialog
            open={showSelfStationDialog}
            onOpenChange={setShowSelfStationDialog}
            type="self_station"
          />
          <InitiateEvaluationDialog
            open={showCrossStationDialog}
            onOpenChange={setShowCrossStationDialog}
            type="cross_station"
          />
          <InitiateEvaluationDialog
            open={showCrossDepartmentDialog}
            onOpenChange={setShowCrossDepartmentDialog}
            type="cross_department"
          />
          <InitiateEvaluationDialog
            open={showManagerToTeamDialog}
            onOpenChange={setShowManagerToTeamDialog}
            type="manager_to_team"
          />
          <InitiateEvaluationDialog
            open={showTeamToManagerDialog}
            onOpenChange={setShowTeamToManagerDialog}
            type="team_to_manager"
          />
          <InitiateEvaluationDialog
            open={showManagerToSupervisorsDialog}
            onOpenChange={setShowManagerToSupervisorsDialog}
            type="manager_to_supervisors"
          />
        </>
      )}

      {/* Evaluation Detail Modal */}
      <Dialog open={!!selectedEvaluation} onOpenChange={() => setSelectedEvaluation(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-primary" />
              {language === 'ar' ? 'تفاصيل التقييم' : 'Evaluation Details'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedEvaluation && (
            <div className="space-y-6">
              {/* Header Info */}
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {language === 'ar' ? selectedEvaluation.evaluateeNameAr : selectedEvaluation.evaluateeName}
                    </p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="px-2 py-0.5 bg-secondary rounded text-xs">
                        {language === 'ar' ? selectedEvaluation.typeAr : selectedEvaluation.type}
                      </span>
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{selectedEvaluation.date}</span>
                    </div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${selectedEvaluation.score >= 2.5 ? 'text-success' : selectedEvaluation.score >= 1.8 ? 'text-warning' : 'text-danger'}`}>
                  {selectedEvaluation.score.toFixed(2)}
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="space-y-4">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {language === 'ar' ? 'تفصيل الفئات' : 'Category Breakdown'}
                </h4>
                
                <div className="space-y-3">
                  {/* Performance */}
                  <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-primary" />
                      <span className="text-sm">{t('category.performance')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${selectedEvaluation.performance >= 2.5 ? 'bg-success' : selectedEvaluation.performance >= 1.8 ? 'bg-warning' : 'bg-danger'}`}
                          style={{ width: `${(selectedEvaluation.performance / 3) * 100}%` }}
                        />
                      </div>
                      <span className={`font-bold ${selectedEvaluation.performance >= 2.5 ? 'text-success' : selectedEvaluation.performance >= 1.8 ? 'text-warning' : 'text-danger'}`}>
                        {selectedEvaluation.performance.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {/* Teamwork */}
                  <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <span className="text-sm">{t('category.teamwork')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${selectedEvaluation.teamwork >= 2.5 ? 'bg-success' : selectedEvaluation.teamwork >= 1.8 ? 'bg-warning' : 'bg-danger'}`}
                          style={{ width: `${(selectedEvaluation.teamwork / 3) * 100}%` }}
                        />
                      </div>
                      <span className={`font-bold ${selectedEvaluation.teamwork >= 2.5 ? 'text-success' : selectedEvaluation.teamwork >= 1.8 ? 'text-warning' : 'text-danger'}`}>
                        {selectedEvaluation.teamwork.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  {/* Workload */}
                  <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span className="text-sm">{t('category.workload')}</span>
                      <span className="text-xs text-muted-foreground">
                        ({language === 'ar' ? 'اختياري' : 'Optional'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedEvaluation.workload ? (
                        <>
                          <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${selectedEvaluation.workload >= 2.5 ? 'bg-success' : selectedEvaluation.workload >= 1.8 ? 'bg-warning' : 'bg-danger'}`}
                              style={{ width: `${(selectedEvaluation.workload / 3) * 100}%` }}
                            />
                          </div>
                          <span className={`font-bold ${selectedEvaluation.workload >= 2.5 ? 'text-success' : selectedEvaluation.workload >= 1.8 ? 'text-warning' : 'text-danger'}`}>
                            {selectedEvaluation.workload.toFixed(1)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Comment */}
              {selectedEvaluation.comment && (
                <div className="space-y-2">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    {language === 'ar' ? 'ملاحظات' : 'Feedback'}
                  </h4>
                  <div className="p-3 bg-secondary/30 rounded-lg text-sm text-muted-foreground">
                    {selectedEvaluation.comment}
                  </div>
                </div>
              )}

              {/* Close Button */}
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setSelectedEvaluation(null)}
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EvaluationsPage;
