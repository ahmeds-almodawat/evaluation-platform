import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard,
  User,
  Building2,
  Building,
  FileText,
  ClipboardCheck,
  ArrowRight,
  ArrowLeft,
  Globe,
  BarChart3,
  Shield,
  Users,
} from 'lucide-react';

interface Stats {
  activeEmployees: number;
  completedEvaluations: number;
  departments: number;
  participationRate: number;
}

const Index: React.FC = () => {
  const { language, setLanguage, direction } = useLanguage();
  const { user, profile, role } = useSupabaseAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    activeEmployees: 0,
    completedEvaluations: 0,
    departments: 0,
    participationRate: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch active employees count
      const { count: employeesCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Fetch completed evaluations count
      const { count: evaluationsCount } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      // Fetch departments count
      const { count: departmentsCount } = await supabase
        .from('departments')
        .select('*', { count: 'exact', head: true });

      // Calculate participation rate
      const { count: totalEvaluations } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true });

      const participationRate = totalEvaluations && totalEvaluations > 0 
        ? Math.round(((evaluationsCount || 0) / totalEvaluations) * 100)
        : 0;

      setStats({
        activeEmployees: employeesCount || 0,
        completedEvaluations: evaluationsCount || 0,
        departments: departmentsCount || 0,
        participationRate,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const ArrowIcon = direction === 'rtl' ? ArrowLeft : ArrowRight;

  const features = [
    {
      icon: User,
      titleEn: 'Employee Dashboard',
      titleAr: 'لوحة تحكم الموظف',
      descEn: 'View personal scores, trends, and evaluation history',
      descAr: 'عرض الدرجات الشخصية والاتجاهات وسجل التقييمات',
    },
    {
      icon: Building2,
      titleEn: 'Department Analytics',
      titleAr: 'تحليلات القسم',
      descEn: 'Team heatmaps and aggregated performance metrics',
      descAr: 'خرائط حرارية للفريق ومقاييس الأداء المجمعة',
    },
    {
      icon: Building,
      titleEn: 'Company Overview',
      titleAr: 'نظرة عامة على الشركة',
      descEn: 'Department benchmarking and company-wide trends',
      descAr: 'مقارنة الأقسام واتجاهات على مستوى الشركة',
    },
    {
      icon: FileText,
      titleEn: 'Detailed Reports',
      titleAr: 'تقارير مفصلة',
      descEn: 'Export to PDF & Excel with full bilingual support',
      descAr: 'تصدير إلى PDF و Excel مع دعم ثنائي اللغة',
    },
  ];

  const getRoleDisplayName = (role: string) => {
    const roleNames: Record<string, { en: string; ar: string }> = {
      admin: { en: 'Admin', ar: 'مدير' },
      audit: { en: 'Auditor', ar: 'مراجع' },
      super_user: { en: 'Super User', ar: 'مستخدم متميز' },
      user: { en: 'User', ar: 'مستخدم' },
    };
    return language === 'ar' 
      ? roleNames[role]?.ar || role 
      : roleNames[role]?.en || role;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-success/5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-success/10 rounded-full blur-3xl" />

        {/* Header */}
        <header className="relative z-10 flex items-center justify-between p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <LayoutDashboard className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Almodawat Employee Portal</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="gap-2"
            >
              <Globe className="w-4 h-4" />
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
            <Button onClick={() => navigate('/dashboard/employee')}>
              {language === 'ar' ? 'دخول' : 'Enter'}
              <ArrowIcon className="w-4 h-4 ms-2" />
            </Button>
          </div>
        </header>

        {/* Hero Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in-up">
            <Shield className="w-4 h-4" />
            {language === 'ar' ? 'منصة تقييم داخلية للموظفين' : 'Internal Employee Evaluation Platform'}
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            {language === 'ar' ? (
              <>
                نظام تقييم الموظفين
                <br />
                <span className="gradient-text">الذكي والشامل</span>
              </>
            ) : (
              <>
                Smart Employee
                <br />
                <span className="gradient-text">Evaluation System</span>
              </>
            )}
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            {language === 'ar'
              ? 'إدارة التقييمات الشهرية، تتبع الأداء، وتحليل البيانات مع دعم كامل للغة العربية والإنجليزية'
              : 'Manage monthly evaluations, track performance, and analyze data with full Arabic and English support'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <Button size="lg" onClick={() => navigate('/dashboard/employee')} className="gap-2 px-8">
              <BarChart3 className="w-5 h-5" />
              {language === 'ar' ? 'عرض لوحة التحكم' : 'View Dashboard'}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/evaluations')} className="gap-2 px-8">
              <ClipboardCheck className="w-5 h-5" />
              {language === 'ar' ? 'بدء التقييم' : 'Start Evaluation'}
            </Button>
          </div>

          {/* Role Indicator */}
          {user && (
            <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm animate-fade-in-up" style={{ animationDelay: '400ms' }}>
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {language === 'ar' ? 'تم تسجيل الدخول كـ:' : 'Logged in as:'}
              </span>
              <span className="font-medium text-foreground">
                {profile?.name_en || user.email} ({getRoleDisplayName(role)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Features Section */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-card rounded-xl p-6 shadow-md border border-border/50 hover:shadow-lg hover:border-primary/30 transition-all duration-300 animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {language === 'ar' ? feature.titleAr : feature.titleEn}
              </h3>
              <p className="text-sm text-muted-foreground">
                {language === 'ar' ? feature.descAr : feature.descEn}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Stats */}
      <section className="bg-card border-y border-border py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div className="animate-fade-in-up">
              <p className="text-4xl font-bold text-primary">{stats.activeEmployees}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'ar' ? 'موظف نشط' : 'Active Employees'}
              </p>
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
              <p className="text-4xl font-bold text-success">{stats.completedEvaluations.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'ar' ? 'تقييم مكتمل' : 'Completed Evaluations'}
              </p>
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
              <p className="text-4xl font-bold text-warning">{stats.departments}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'ar' ? 'أقسام' : 'Departments'}
              </p>
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
              <p className="text-4xl font-bold text-foreground">{stats.participationRate}%</p>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'ar' ? 'معدل المشاركة' : 'Participation Rate'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} Almodawat. {language === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved.'}</p>
      </footer>
    </div>
  );
};

export default Index;
