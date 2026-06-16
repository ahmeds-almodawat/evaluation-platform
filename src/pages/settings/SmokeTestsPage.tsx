import React from 'react';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ClipboardCopy, AlertTriangle } from 'lucide-react';

const SmokeTestsPage: React.FC = () => {
  const { language } = useLanguage();
  const { toast } = useToast();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: language === 'ar' ? 'تم النسخ' : 'Copied' });
    } catch {
      toast({ title: language === 'ar' ? 'خطأ' : 'Error', description: language === 'ar' ? 'فشل النسخ' : 'Copy failed', variant: 'destructive' });
    }
  };

  const title = language === 'ar' ? 'اختبار سريع' : 'Smoke Tests';
  const subtitle = language === 'ar'
    ? 'قائمة فحص سريعة بعد أي تعديلات (تمنع رجوع مشاكل الأدوار/الملفات)'
    : 'Quick checklist after any patch (prevents RBAC/profile regressions)';

  const sqlChecks = `-- Data health quick checks\nselect count(*) as missing_department from public.profiles where department_id is null;\n\n-- Custom roles coverage\nselect count(*) as assigned_custom_roles from public.user_custom_roles;\n\n-- Pending evaluations (sanity)\nselect count(*) as pending_evals from public.evaluations where status='pending';\n`;

  return (
    <div className="min-h-screen bg-background">
      <Header title={title} subtitle={subtitle} />
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {language === 'ar' ? 'خطوات الفحص' : 'Checklist'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal pl-5 space-y-2 text-sm">
              <li>{language === 'ar' ? 'تأكد أن أعلى يمين (البروفايل) يفتح صفحة الموظف بدون "Employee not found".' : 'Top-right profile opens employee profile (no “Employee not found”).'}</li>
              <li>{language === 'ar' ? 'افتح صفحة Users: إنشاء مستخدم + تعديل مستخدم + تعيين دور مخصص (custom role) والتأكد أنه يُحفظ.' : 'Users page: create/edit user, assign custom role, ensure it saves.'}</li>
              <li>{language === 'ar' ? 'Sidebar: العناصر تظهر حسب الصلاحيات (جرب Role Simulator).': 'Sidebar shows items by permissions (test Role Simulator).'} </li>
              <li>{language === 'ar' ? 'Reports → Analytics: لا يظهر UUIDs، ويوجد زر View يفتح الملف في تبويب جديد.' : 'Reports → Analytics: no UUIDs; “View” opens profile in a new tab.'}</li>
              <li>{language === 'ar' ? 'Departments: صفحة القسم تعرض الموظفين مع scroll + بحث + نقل/إزالة.' : 'Departments: department details show employees with scroll + search + transfer/remove.'}</li>
            </ol>

            <div className="rounded-lg border p-3 text-sm bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {language === 'ar' ? 'SQL فحص سريع' : 'SQL quick checks'}
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => copy(sqlChecks)}>
                  <ClipboardCopy className="h-4 w-4" />
                  {language === 'ar' ? 'نسخ' : 'Copy'}
                </Button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-xs font-mono">{sqlChecks}</pre>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SmokeTestsPage;
