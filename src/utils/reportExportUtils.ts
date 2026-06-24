import { exportToPDF, exportToExcel } from '@/utils/exportUtils';

type AnyRecord = Record<string, any>;

interface ReportPayload {
  title: string;
  subtitle: string;
  date: string;
  filters: AnyRecord;
  metrics: AnyRecord;
  trend: AnyRecord[];
  deptBench: AnyRecord[];
  history: AnyRecord[];
  profiles: Record<string, AnyRecord>;
  departments: Record<string, AnyRecord>;
  comments: AnyRecord[];
  deptRankings?: AnyRecord[];
  evaluatorLeaderboard?: AnyRecord[];
  followUps?: AnyRecord[];
  lowScoreAlerts?: AnyRecord[];
  heatmapMonths?: string[];
  deptMonthHeatmap?: AnyRecord[];
  insights?: string[];
  isManager?: boolean;
  myTeamCompletion?: AnyRecord | null;
  myDeptSnapshot?: AnyRecord | null;
  language: 'en' | 'ar';
}

const prettyType = (type: string, language: 'en' | 'ar') => {
  const map: Record<string, { en: string; ar: string }> = {
    same_dept: { en: 'Legacy Self Dept', ar: 'تقييم داخلي قديم' },
    same: { en: 'Legacy Self Dept', ar: 'تقييم داخلي قديم' },
    self_station: { en: 'Self Station / Unit', ar: 'تقييم داخلي للوحدة / المحطة' },
    cross_station: { en: 'Cross Station', ar: 'تقييم بين الوحدات / المحطات' },
    cross_department: { en: 'Cross Department', ar: 'تقييم بين الأقسام' },
    cross_managers: { en: 'Cross Department', ar: 'تقييم بين الأقسام' },
    cross_individuals: { en: 'Cross Department', ar: 'تقييم بين الأقسام' },
    cross: { en: 'Cross Department', ar: 'تقييم بين الأقسام' },
    manager_to_team: { en: 'Manager → Team', ar: 'تقييم المدير للفريق' },
    team_to_manager: { en: 'Team → Manager', ar: 'تقييم الفريق للمدير' },
    cross_other: { en: 'Cross Department', ar: 'تقييم بين الأقسام' },
  };
  const v = map[type] || { en: type, ar: type };
  return language === 'ar' ? v.ar : v.en;
};

const buildSections = (payload: ReportPayload) => {
  const {
    filters,
    metrics,
    trend,
    deptBench,
    history,
    profiles,
    departments,
    comments,
    deptRankings = [],
    evaluatorLeaderboard = [],
    followUps = [],
    lowScoreAlerts = [],
    heatmapMonths = [],
    deptMonthHeatmap = [],
    insights = [],
    isManager = false,
    myTeamCompletion = null,
    myDeptSnapshot,
    language,
  } = payload;

  const sections: Array<{ header: string; type: 'kpi' | 'table' | 'text'; data: AnyRecord[] | AnyRecord }> = [];

  sections.push({
    header: language === 'ar' ? 'المرشحات' : 'Filters',
    type: 'kpi',
    data: filters,
  });

  sections.push({
    header: language === 'ar' ? 'ملخص' : 'Executive Summary',
    type: 'kpi',
    data: {
      ...(language === 'ar'
        ? {
            'إجمالي التقييمات': metrics.total,
            'نسبة الإكمال': `${metrics.completionRate}%`,
            'عدد المُقيّمين (فريد)': metrics.uniqueEvaluators,
            'عدد المُقيّمين عليهم (فريد)': metrics.uniqueEvaluatees,
            'متوسط الأداء': metrics.avgPerformance,
            'متوسط العمل الجماعي': metrics.avgTeamwork,
            'متوسط عبء العمل': metrics.avgWorkload,
          }
        : {
            'Total evaluations': metrics.total,
            'Completion rate': `${metrics.completionRate}%`,
            'Unique evaluators': metrics.uniqueEvaluators,
            'Unique evaluatees': metrics.uniqueEvaluatees,
            'Avg performance': metrics.avgPerformance,
            'Avg teamwork': metrics.avgTeamwork,
            'Avg workload': metrics.avgWorkload,
          }),
    },
  });

  // Ultra Pro: narrative summary (executive-friendly)
  const topDept = deptRankings[0];
  const bottomDept = deptRankings.length ? deptRankings[deptRankings.length - 1] : null;
  const pendingCount = (payload.history || []).filter((e: AnyRecord) => e.status !== 'completed').length;
  const narrative = language === 'ar'
    ? `خلال نطاق المرشحات الحالية تم تسجيل ${metrics.total} تقييم(ات) بنسبة إكمال ${metrics.completionRate}%. متوسط الأداء ${metrics.avgPerformance} ومتوسط العمل الجماعي ${metrics.avgTeamwork}. ` +
      `${topDept ? `أعلى قسم هو ${topDept.nameAr || topDept.nameEn} (${topDept.avgPerformance}). ` : ''}` +
      `${bottomDept && deptRankings.length > 1 ? `أقل قسم هو ${bottomDept.nameAr || bottomDept.nameEn} (${bottomDept.avgPerformance}). ` : ''}` +
      `${pendingCount ? `يوجد ${pendingCount} تقييم(ات) معلّقة تحتاج متابعة.` : ''}`
    : `Across the current filters, ${metrics.total} evaluation(s) were recorded with a ${metrics.completionRate}% completion rate. ` +
      `Average performance is ${metrics.avgPerformance} and average teamwork is ${metrics.avgTeamwork}. ` +
      `${topDept ? `Top department is ${topDept.nameEn || topDept.nameAr} (${topDept.avgPerformance}). ` : ''}` +
      `${bottomDept && deptRankings.length > 1 ? `Lowest department is ${bottomDept.nameEn || bottomDept.nameAr} (${bottomDept.avgPerformance}). ` : ''}` +
      `${pendingCount ? `${pendingCount} evaluation(s) remain pending and require follow-up.` : ''}`;

  sections.push({
    header: language === 'ar' ? 'ملخص تنفيذي (نصي)' : 'Executive summary (narrative)',
    type: 'text',
    data: { Summary: narrative },
  });

  if (insights.length) {
    sections.push({
      header: language === 'ar' ? 'أهم الرؤى' : 'Key insights',
      type: 'text',
      data: { Insights: insights.map((x) => `• ${x}`).join('\n') },
    });
  }
  if (myDeptSnapshot) {
    sections.push({
      header: language === 'ar' ? 'لمحة عن قسمي' : 'My department snapshot',
      type: 'kpi',
      data:
        language === 'ar'
          ? {
              'القسم': myDeptSnapshot.name || myDeptSnapshot.deptId,
              'إجمالي التقييمات': myDeptSnapshot.total,
              'نسبة الإكمال': `${myDeptSnapshot.completionRate}%`,
              'متوسط الأداء': myDeptSnapshot.avgPerf,
            }
          : {
              'Department': myDeptSnapshot.name || myDeptSnapshot.deptId,
              'Total evaluations': myDeptSnapshot.total,
              'Completion rate': `${myDeptSnapshot.completionRate}%`,
              'Avg performance': myDeptSnapshot.avgPerf,
            },
    });
  }

  sections.push({
    header: language === 'ar' ? 'الاتجاه الشهري (متوسط الدرجات)' : 'Monthly trend (average scores)',
    type: 'table',
    data: trend.map((r) => ({
      Month: r.month,
      Performance: r.performance,
      Teamwork: r.teamwork,
      Workload: r.workload,
    })),
  });

  // Department × month heatmap (exported as long-format table for readability)
  if (heatmapMonths.length && deptMonthHeatmap.length) {
    const monthsToExport = heatmapMonths.slice(-6); // keep PDF readable
    const longRows: AnyRecord[] = [];
    deptMonthHeatmap.forEach((r: AnyRecord) => {
      monthsToExport.forEach((m: string) => {
        const v = r.values?.[m];
        longRows.push({
          Department: language === 'ar' ? r.nameAr || r.nameEn : r.nameEn || r.nameAr,
          Month: m,
          'Avg performance': v ?? '—',
        });
      });
    });

    sections.push({
      header: language === 'ar' ? 'الأداء حسب القسم/الشهر (خريطة حرارية)' : 'Department performance by month (heatmap)',
      type: 'table',
      data: longRows.slice(0, 600),
    });
  }

  // Manager dashboard export (team completion)
  if (isManager && myTeamCompletion) {
    sections.push({
      header: language === 'ar' ? 'لوحة المدير: أفضل المُقيّمين' : 'Manager dashboard: top evaluators',
      type: 'table',
      data: (myTeamCompletion.teamTop || []).slice(0, 50).map((r: AnyRecord) => ({
        Evaluator: r.name,
        Department: r.department,
        'Completion rate': `${r.completionRate}%`,
        Completed: r.completed,
        Pending: r.pending,
      })),
    });

    sections.push({
      header: language === 'ar' ? 'لوحة المدير: يحتاج متابعة' : 'Manager dashboard: needs follow-up',
      type: 'table',
      data: (myTeamCompletion.teamNeeds || []).slice(0, 200).map((f: AnyRecord) => ({
        Evaluator: f.name,
        Department: f.department,
        Pending: f.pendingCount,
        Examples: (f.items || []).slice(0, 3).map((it: AnyRecord) => `${it.evaluatee} — ${it.dept} (${it.period})`).join(' | '),
      })),
    });
  }

  sections.push({
    header: language === 'ar' ? 'أفضل 10 أقسام (متوسط الأداء)' : 'Top departments (avg performance)',
    type: 'table',
    data: deptBench.map((d) => ({
      Department: language === 'ar' ? d.nameAr : d.nameEn,
      'Same dept avg': d.avgSameDept,
      'Cross dept avg': d.avgCrossDept,
    })),
  });

  if (deptRankings.length) {
    sections.push({
      header: language === 'ar' ? 'ترتيب الأقسام' : 'Department ranking',
      type: 'table',
      data: deptRankings.slice(0, 50).map((d: AnyRecord, idx: number) => ({
        '#': idx + 1,
        Department: language === 'ar' ? d.nameAr : d.nameEn,
        'Avg performance': d.avgPerformance,
        'Completion rate': `${d.completionRate}%`,
        Evaluations: d.evaluations,
      })),
    });
  }

  if (evaluatorLeaderboard.length) {
    sections.push({
      header: language === 'ar' ? 'لوحة المتصدرين (نسبة الإكمال)' : 'Completion leaderboard',
      type: 'table',
      data: evaluatorLeaderboard.slice(0, 100).map((r: AnyRecord) => ({
        Evaluator: r.name,
        Department: r.department,
        'Completion rate': `${r.completionRate}%`,
        Completed: r.completed,
        Pending: r.pending,
        Total: r.total,
      })),
    });
  }

  // Manager dashboard export (if available)
  if (isManager && myTeamCompletion) {
    const teamTop = (myTeamCompletion.teamTop || []).slice(0, 50);
    const teamNeeds = (myTeamCompletion.teamNeeds || []).slice(0, 50);

    if (teamTop.length) {
      sections.push({
        header: language === 'ar' ? 'لوحة المدير: أفضل المُقيّمين (إكمال)' : 'Manager dashboard: top evaluators (completion)',
        type: 'table',
        data: teamTop.map((r: AnyRecord) => ({
          Evaluator: r.name,
          'Completion rate': `${r.completionRate}%`,
          Completed: r.completed,
          Pending: r.pending,
          Total: r.total,
        })),
      });
    }

    if (teamNeeds.length) {
      sections.push({
        header: language === 'ar' ? 'لوحة المدير: يحتاج متابعة (معلّق)' : 'Manager dashboard: needs follow-up (pending)',
        type: 'table',
        data: teamNeeds.map((f: AnyRecord) => ({
          Evaluator: f.name,
          Pending: f.pendingCount,
          Examples: (f.items || []).slice(0, 3).map((it: AnyRecord) => `${it.evaluatee} (${it.period})`).join(' | '),
        })),
      });
    }
  }

  if (followUps.length) {
    sections.push({
      header: language === 'ar' ? 'المتابعات المطلوبة (لم يتم الإرسال)' : 'Follow-ups (not submitted)',
      type: 'table',
      data: followUps.slice(0, 200).map((f: AnyRecord) => ({
        Evaluator: f.name,
        Department: f.department,
        Pending: f.pendingCount,
        Examples: (f.items || []).slice(0, 3).map((it: AnyRecord) => `${it.evaluatee} — ${it.dept} (${it.period})`).join(' | '),
      })),
    });
  }

  if (lowScoreAlerts.length) {
    sections.push({
      header: language === 'ar' ? 'تنبيهات الأداء (منخفض)' : 'Low performance alerts',
      type: 'table',
      data: lowScoreAlerts.slice(0, 200).map((x: AnyRecord) => ({
        Employee: x.name,
        Department: x.department,
        'Avg performance': x.avgPerformance,
        Responses: x.responses,
      })),
    });
  }

  sections.push({
    header: language === 'ar' ? 'سجل التقييمات' : 'Evaluation history',
    type: 'table',
    data: history.slice(0, 500).map((e: AnyRecord) => {
      const evalName = profiles[e.evaluatee_id]
        ? (language === 'ar' ? profiles[e.evaluatee_id].name_ar : profiles[e.evaluatee_id].name_en)
        : '—';
      const evaluatorName =
        e.evaluator_id && profiles[e.evaluator_id]
          ? (language === 'ar' ? profiles[e.evaluator_id].name_ar : profiles[e.evaluator_id].name_en)
          : language === 'ar'
          ? 'النظام'
          : 'System';

      const deptId = profiles[e.evaluatee_id]?.department_id;
      const deptName = deptId
        ? (language === 'ar' ? departments[deptId]?.name_ar : departments[deptId]?.name_en)
        : '—';

      return {
        Date: new Date(e.created_at).toLocaleDateString(),
        Period: e.period,
        Department: deptName,
        Evaluatee: evalName,
        Evaluator: evaluatorName,
        Type: prettyType((e.evaluation_type || 'same_dept'), language),
        Status: e.status,
        Performance: e.performance_score,
        Teamwork: e.teamwork_score,
        Workload: e.workload_score ?? '',
      };
    }),
  });

  if (comments.length) {
    sections.push({
      header: language === 'ar' ? 'تعليقات (مجهولة الهوية)' : 'Anonymized comments',
      type: 'table',
      data: comments.slice(0, 500).map((c: AnyRecord) => ({
        Date: c.date,
        Department: c.department,
        Type: prettyType(c.type, language),
        Comment: c.comment,
      })),
    });
  }

  return sections;
};

export const exportReportPDF = async (payload: ReportPayload) => {
  const sections = buildSections(payload);
  await exportToPDF({ title: payload.title, subtitle: payload.subtitle, date: payload.date, sections }, payload.language);
};

export const exportReportExcel = async (payload: ReportPayload) => {
  const sections = buildSections(payload);
  await exportToExcel({ title: payload.title, subtitle: payload.subtitle, date: payload.date, sections }, payload.language);
};
