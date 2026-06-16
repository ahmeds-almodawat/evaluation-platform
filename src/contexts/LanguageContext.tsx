import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';
type Direction = 'ltr' | 'rtl';

interface LanguageContextType {
  language: Language;
  direction: Direction;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.employee': 'Employee',
    'nav.department': 'Department',
    'nav.company': 'Company',
    'nav.reports': 'Reports',
    'nav.evaluations': 'Evaluations',
    'nav.users': 'Users',
    'nav.settings': 'Settings',
    'nav.logout': 'Logout',
    
    // Dashboard Headers
    'dashboard.employee': 'Employee Dashboard',
    'dashboard.department': 'Department Dashboard',
    'dashboard.company': 'Company Dashboard',
    
    // KPI Labels
    'kpi.sameDept': 'Same-Dept Score',
    'kpi.crossDept': 'Cross-Dept Score',
    'kpi.participation': 'Participation',
    'kpi.alerts': 'Alerts',
    'kpi.volatility': 'Volatility',
    'kpi.avgScore': 'Average Score',
    
    // Categories
    'category.performance': 'Performance',
    'category.teamwork': 'Teamwork',
    'category.workload': 'Workload',
    
    // Charts
    'chart.trend': 'Score Trend (12 Months)',
    'chart.categoryBreakdown': 'Category Breakdown',
    'chart.heatmap': 'Category Heatmap',
    'chart.benchmark': 'Department Benchmark',
    'chart.companyTrend': 'Company Performance Trend',
    
    // Actions
    'action.export': 'Export',
    'action.pdf': 'Export PDF',
    'action.excel': 'Export Excel',
    'action.search': 'Search',
    'action.filter': 'Filter',
    'action.evaluate': 'Evaluate',
    
    // Time
    'time.month': 'Month',
    'time.year': 'Year',
    'time.lastUpdated': 'Last Updated',
    
    // Status
    'status.high': 'High',
    'status.medium': 'Medium',
    'status.low': 'Low',
    'status.completed': 'Completed',
    'status.pending': 'Pending',
    'status.improving': 'Improving',
    'status.declining': 'Declining',
    'status.stable': 'Stable',
    
    // Reports
    'report.employee': 'Employee Report',
    'report.department': 'Department Report',
    'report.company': 'Company Report',
    'report.history': 'Evaluation History',
    'report.comments': 'Anonymized Comments',

    // Reports (Analytics)
    'reports.title': 'Reports & Analytics',
    'reports.subtitle': 'Insights, trends, and exports across evaluations',
    'reports.filters': 'Filters',
    'reports.filter.period': 'Period',
    'reports.filter.allPeriods': 'All periods',
    'reports.filter.department': 'Department',
    'reports.filter.allDepartments': 'All departments',
    'reports.filter.type': 'Type',
    'reports.filter.allTypes': 'All types',
    'reports.filter.status': 'Status',
    'reports.filter.allStatuses': 'All statuses',
    'reports.filter.search': 'Search',
    'reports.filter.searchPlaceholder': 'Search by employee, evaluator, dept, period, or comments…',
    'reports.tab.overview': 'Overview',
    'reports.tab.details': 'Details',
    'reports.tab.history': 'History',
    'reports.tab.comments': 'Comments',
    'reports.view.evaluations': 'Evaluations',
    'reports.view.comments': 'Comments',
    'reports.kpi.totalEvaluations': 'Total evaluations',
    'reports.kpi.completionRate': 'Completion rate',
    'reports.kpi.uniqueEvaluatees': 'Employees evaluated',
    'reports.kpi.uniqueEvaluators': 'Active evaluators',
    'reports.chart.trend': 'Score trend',
    'reports.chart.scoreBreakdown': 'Average by category',
    'reports.chart.departmentBenchmark': 'Department benchmark',
    'reports.chart.departmentBenchmarkSubtitle': 'Top departments by average performance score',
    'reports.historyTitle': 'Evaluation history',
    'reports.commentsTitle': 'Anonymized comments',
    'reports.noResults': 'No matching evaluations found.',
    'reports.noComments': 'No comments found for the selected filters.',
    'reports.by': 'By',
    'reports.system': 'System',
    'reports.commentLabel': 'Comment',
    'reports.type.sameDept': 'Same department',
    'reports.type.crossManagers': 'Cross dept (Managers)',
    'reports.type.crossIndividuals': 'Cross dept (Individuals)',
    'reports.type.crossOther': 'Cross department',

    // Reports (Executive add-ons)
    'reports.departmentRanking': 'Department ranking',
    'reports.completionLeaderboard': 'Completion leaderboard',
    'reports.followUps': 'Follow-ups needed',
    'reports.lowScoreAlerts': 'Low score alerts',
    'reports.noFollowUps': 'No pending evaluations found.',
    'reports.noAlerts': 'No alerts for the selected filters.',
    'reports.department': 'Department',
    'reports.employee': 'Employee',
    'reports.evaluator': 'Evaluator',
    'reports.pending': 'Pending',
    'reports.responses': 'Responses',
    'reports.avgPerformance': 'Avg performance',
    'reports.myDeptSnapshot': 'My department snapshot',

    // Common
    'loading': 'Loading…',

    
    // Labels
    'label.score': 'Score',
    'label.employee': 'Employee',
    'label.department': 'Department',
    'label.date': 'Date',
    'label.evaluator': 'Evaluator',
    'label.type': 'Type',
    
    // Months
    'month.jan': 'Jan',
    'month.feb': 'Feb',
    'month.mar': 'Mar',
    'month.apr': 'Apr',
    'month.may': 'May',
    'month.jun': 'Jun',
    'month.jul': 'Jul',
    'month.aug': 'Aug',
    'month.sep': 'Sep',
    'month.oct': 'Oct',
    'month.nov': 'Nov',
    'month.dec': 'Dec',
  },
  ar: {
    // Navigation
    'nav.dashboard': 'لوحة التحكم',
    'nav.employee': 'الموظف',
    'nav.department': 'القسم',
    'nav.company': 'الشركة',
    'nav.reports': 'التقارير',
    'nav.evaluations': 'التقييمات',
    'nav.users': 'المستخدمون',
    'nav.settings': 'الإعدادات',
    'nav.logout': 'تسجيل الخروج',
    
    // Dashboard Headers
    'dashboard.employee': 'لوحة تحكم الموظف',
    'dashboard.department': 'لوحة تحكم القسم',
    'dashboard.company': 'لوحة تحكم الشركة',
    
    // KPI Labels
    'kpi.sameDept': 'تقييم نفس القسم',
    'kpi.crossDept': 'تقييم الأقسام الأخرى',
    'kpi.participation': 'نسبة المشاركة',
    'kpi.alerts': 'التنبيهات',
    'kpi.volatility': 'التقلب',
    'kpi.avgScore': 'متوسط الدرجات',
    
    // Categories
    'category.performance': 'الأداء',
    'category.teamwork': 'العمل الجماعي',
    'category.workload': 'حجم العمل',
    
    // Charts
    'chart.trend': 'اتجاه الدرجات (12 شهر)',
    'chart.categoryBreakdown': 'تفصيل الفئات',
    'chart.heatmap': 'خريطة حرارية للفئات',
    'chart.benchmark': 'مقارنة الأقسام',
    'chart.companyTrend': 'اتجاه أداء الشركة',
    
    // Actions
    'action.export': 'تصدير',
    'action.pdf': 'تصدير PDF',
    'action.excel': 'تصدير Excel',
    'action.search': 'بحث',
    'action.filter': 'تصفية',
    'action.evaluate': 'تقييم',
    
    // Time
    'time.month': 'شهر',
    'time.year': 'سنة',
    'time.lastUpdated': 'آخر تحديث',
    
    // Status
    'status.high': 'مرتفع',
    'status.medium': 'متوسط',
    'status.low': 'منخفض',
    'status.completed': 'مكتمل',
    'status.pending': 'قيد الانتظار',
    'status.improving': 'تحسن',
    'status.declining': 'تراجع',
    'status.stable': 'مستقر',
    
    // Reports
    'report.employee': 'تقرير الموظف',
    'report.department': 'تقرير القسم',
    'report.company': 'تقرير الشركة',
    'report.history': 'سجل التقييمات',
    'report.comments': 'تعليقات مجهولة المصدر',

    // Reports (Analytics)
    'reports.title': 'التقارير والتحليلات',
    'reports.subtitle': 'رؤى واتجاهات وتصدير لنتائج التقييمات',
    'reports.filters': 'التصفية',
    'reports.filter.period': 'الفترة',
    'reports.filter.allPeriods': 'كل الفترات',
    'reports.filter.department': 'القسم',
    'reports.filter.allDepartments': 'كل الأقسام',
    'reports.filter.type': 'النوع',
    'reports.filter.allTypes': 'كل الأنواع',
    'reports.filter.status': 'الحالة',
    'reports.filter.allStatuses': 'كل الحالات',
    'reports.filter.search': 'بحث',
    'reports.filter.searchPlaceholder': 'ابحث بالاسم أو المقيم أو القسم أو الفترة أو التعليق…',
    'reports.tab.overview': 'نظرة عامة',
    'reports.tab.details': 'التفاصيل',
    'reports.tab.history': 'السجل',
    'reports.tab.comments': 'التعليقات',
    'reports.view.evaluations': 'التقييمات',
    'reports.view.comments': 'التعليقات',
    'reports.kpi.totalEvaluations': 'إجمالي التقييمات',
    'reports.kpi.completionRate': 'نسبة الإكمال',
    'reports.kpi.uniqueEvaluatees': 'عدد الموظفين المُقيّمين',
    'reports.kpi.uniqueEvaluators': 'عدد المقيمين النشطين',
    'reports.chart.trend': 'اتجاه الدرجات',
    'reports.chart.scoreBreakdown': 'متوسط حسب الفئة',
    'reports.chart.departmentBenchmark': 'مقارنة الأقسام',
    'reports.chart.departmentBenchmarkSubtitle': 'أفضل الأقسام حسب متوسط درجة الأداء',
    'reports.historyTitle': 'سجل التقييمات',
    'reports.commentsTitle': 'تعليقات مجهولة المصدر',
    'reports.noResults': 'لا توجد نتائج مطابقة للتصفية.',
    'reports.noComments': 'لا توجد تعليقات ضمن التصفية الحالية.',
    'reports.by': 'بواسطة',
    'reports.system': 'النظام',
    'reports.commentLabel': 'تعليق',
    'reports.type.sameDept': 'نفس القسم',
    'reports.type.crossManagers': 'أقسام أخرى (المدراء)',
    'reports.type.crossIndividuals': 'أقسام أخرى (الأفراد)',
    'reports.type.crossOther': 'أقسام أخرى',

    // Reports (Executive add-ons)
    'reports.departmentRanking': 'ترتيب الأقسام',
    'reports.completionLeaderboard': 'لوحة المتصدرين (الإكمال)',
    'reports.followUps': 'متابعات مطلوبة',
    'reports.lowScoreAlerts': 'تنبيهات الأداء المنخفض',
    'reports.noFollowUps': 'لا توجد تقييمات معلّقة ضمن التصفية الحالية.',
    'reports.noAlerts': 'لا توجد تنبيهات ضمن التصفية الحالية.',
    'reports.department': 'القسم',
    'reports.employee': 'الموظف',
    'reports.evaluator': 'المقيّم',
    'reports.pending': 'معلّق',
    'reports.responses': 'عدد الردود',
    'reports.avgPerformance': 'متوسط الأداء',
    'reports.myDeptSnapshot': 'لمحة عن قسمي',

    // Common
    'loading': 'جارٍ التحميل…',
    
    // Labels
    'label.score': 'الدرجة',
    'label.employee': 'الموظف',
    'label.department': 'القسم',
    'label.date': 'التاريخ',
    'label.evaluator': 'المقيّم',
    'label.type': 'النوع',
    
    // Months
    'month.jan': 'يناير',
    'month.feb': 'فبراير',
    'month.mar': 'مارس',
    'month.apr': 'أبريل',
    'month.may': 'مايو',
    'month.jun': 'يونيو',
    'month.jul': 'يوليو',
    'month.aug': 'أغسطس',
    'month.sep': 'سبتمبر',
    'month.oct': 'أكتوبر',
    'month.nov': 'نوفمبر',
    'month.dec': 'ديسمبر',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const direction: Direction = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language;
  }, [language, direction]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, direction, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
