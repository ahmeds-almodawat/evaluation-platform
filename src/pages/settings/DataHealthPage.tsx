import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, Users, Building2, KeyRound } from 'lucide-react';

type Metric = {
  key: string;
  labelEn: string;
  labelAr: string;
  value: number;
  status: 'ok' | 'warn' | 'bad';
  hintEn?: string;
  hintAr?: string;
  actionPath?: string;
};

const DataHealthPage: React.FC = () => {
  const { language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [dupStaff, setDupStaff] = useState<Array<{ staff_id: string; n: number }>>([]);
  const [dupEmail, setDupEmail] = useState<Array<{ email: string; n: number }>>([]);

  const load = async () => {
    setLoading(true);
    try {
      // Profiles count
      const { count: totalProfiles, error: tpErr } = await supabase
        .from('profiles')
        .select('id', { head: true, count: 'exact' });
      if (tpErr) throw tpErr;

      const { count: missingDept, error: mdErr } = await supabase
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .is('department_id', null);
      if (mdErr) throw mdErr;

      const { count: missingStaffId, error: msErr } = await supabase
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .or('staff_id.is.null,staff_id.eq.');
      if (msErr) throw msErr;

      const { count: inactiveProfiles, error: ipErr } = await supabase
        .from('profiles')
        .select('id', { head: true, count: 'exact' })
        .eq('is_active', false);
      if (ipErr) throw ipErr;

      const { count: deptsCount, error: dcErr } = await supabase
        .from('departments')
        .select('id', { head: true, count: 'exact' });
      if (dcErr) throw dcErr;

      // Custom roles coverage
      const { count: customRoleAssigned, error: crErr } = await supabase
        .from('user_custom_roles')
        .select('user_id', { head: true, count: 'exact' });
      // user_custom_roles might not exist in some DBs (older installs)
      if (crErr && !String(crErr.message || '').includes('relation') && !String(crErr.message || '').includes('does not exist')) {
        throw crErr;
      }

      // Duplicates (best-effort: fetch aggregated lists)
      const { data: dupStaffRows } = await supabase
        .rpc('rpc_data_health_duplicate_staff_ids');
      const { data: dupEmailRows } = await supabase
        .rpc('rpc_data_health_duplicate_emails');

      setDupStaff((dupStaffRows as any) || []);
      setDupEmail((dupEmailRows as any) || []);

      const m: Metric[] = [
        {
          key: 'total_profiles',
          labelEn: 'Total profiles',
          labelAr: 'إجمالي الملفات',
          value: Number(totalProfiles || 0),
          status: 'ok',
          hintEn: 'Total users in profiles table.',
          hintAr: 'إجمالي المستخدمين في جدول profiles.',
          actionPath: '/employees',
        },
        {
          key: 'departments',
          labelEn: 'Departments',
          labelAr: 'الأقسام',
          value: Number(deptsCount || 0),
          status: 'ok',
          actionPath: '/departments',
        },
        {
          key: 'missing_department',
          labelEn: 'Missing department',
          labelAr: 'بدون قسم',
          value: Number(missingDept || 0),
          status: (missingDept || 0) === 0 ? 'ok' : 'warn',
          hintEn: 'Profiles with no department_id. These will break dept reports and cross-dept matrix.',
          hintAr: 'مستخدمون بدون department_id. هذا يؤثر على تقارير الأقسام والمصفوفة.',
          actionPath: '/departments',
        },
        {
          key: 'missing_staff_id',
          labelEn: 'Missing staff ID',
          labelAr: 'بدون رقم موظف',
          value: Number(missingStaffId || 0),
          status: (missingStaffId || 0) === 0 ? 'ok' : 'warn',
          hintEn: 'Not required technically, but strongly recommended for HR workflows and exports.',
          hintAr: 'ليس إلزامياً تقنياً لكن مهم للـ HR والتصدير.',
          actionPath: '/users',
        },
        {
          key: 'inactive',
          labelEn: 'Inactive profiles',
          labelAr: 'حسابات غير مفعلة',
          value: Number(inactiveProfiles || 0),
          status: 'ok',
          actionPath: '/users',
        },
        {
          key: 'custom_roles_assigned',
          labelEn: 'Custom roles assigned',
          labelAr: 'الأدوار المخصصة المعينة',
          value: Number(customRoleAssigned || 0),
          status: 'ok',
          hintEn: 'How many users have user_custom_roles row (custom RBAC).',
          hintAr: 'كم مستخدم لديه سجل في user_custom_roles.',
          actionPath: '/settings/roles-permissions',
        },
      ];

      // Duplicate status
      if (dupStaffRows && Array.isArray(dupStaffRows) && dupStaffRows.length) {
        m.push({
          key: 'dup_staff',
          labelEn: 'Duplicate staff IDs',
          labelAr: 'تكرار رقم الموظف',
          value: dupStaffRows.length,
          status: 'bad',
          hintEn: 'These cause imports/updates to behave unpredictably.',
          hintAr: 'هذا يسبب مشاكل في الاستيراد والتحديث.',
          actionPath: '/users',
        });
      } else {
        m.push({
          key: 'dup_staff',
          labelEn: 'Duplicate staff IDs',
          labelAr: 'تكرار رقم الموظف',
          value: 0,
          status: 'ok',
        });
      }

      if (dupEmailRows && Array.isArray(dupEmailRows) && dupEmailRows.length) {
        m.push({
          key: 'dup_email',
          labelEn: 'Duplicate emails',
          labelAr: 'تكرار البريد',
          value: dupEmailRows.length,
          status: 'bad',
          hintEn: 'Supabase auth enforces unique email. If you see duplicates here, something is inconsistent.',
          hintAr: 'نظام الدخول يتطلب بريد فريد. التكرار يعني عدم اتساق.',
          actionPath: '/users',
        });
      } else {
        m.push({
          key: 'dup_email',
          labelEn: 'Duplicate emails',
          labelAr: 'تكرار البريد',
          value: 0,
          status: 'ok',
        });
      }

      setMetrics(m);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل تحميل صحة البيانات' : 'Failed to load data health'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusBadge = (s: Metric['status']) => {
    if (s === 'ok') return <Badge className="gap-1"><ShieldCheck className="h-3 w-3" />{language === 'ar' ? 'سليم' : 'OK'}</Badge>;
    if (s === 'warn') return <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" />{language === 'ar' ? 'تنبيه' : 'Warn'}</Badge>;
    return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{language === 'ar' ? 'خطر' : 'Bad'}</Badge>;
  };

  const title = language === 'ar' ? 'صحة البيانات' : 'Data Health';
  const subtitle = language === 'ar'
    ? 'فحص سريع للأقسام/الموظفين/الأدوار قبل الإرسال والـ pilot'
    : 'Quick checks for departments, users, and RBAC before sending or pilot';

  const hasDup = (dupStaff.length + dupEmail.length) > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header title={title} subtitle={subtitle} />
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {language === 'ar'
              ? 'هذه الصفحة لا تعدّل شيئاً. فقط تعرض المشاكل الشائعة التي تكسر التقارير/الاستيراد.'
              : 'Read-only. Highlights common issues that break reports or imports.'}
          </div>
          <Button onClick={load} variant="outline">
            {language === 'ar' ? 'تحديث' : 'Refresh'}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />{language === 'ar' ? 'الموظفون' : 'Users'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <div className="text-sm text-muted-foreground">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div> : (
                metrics.filter(m => ['total_profiles','missing_department','missing_staff_id','inactive'].includes(m.key)).map((m) => (
                  <div key={m.key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{language === 'ar' ? m.labelAr : m.labelEn}</div>
                      {m.hintEn ? <div className="text-xs text-muted-foreground">{language === 'ar' ? m.hintAr : m.hintEn}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(m.status)}
                      <div className="text-sm font-semibold">{m.value}</div>
                    </div>
                  </div>
                ))
              )}
              <Button className="w-full" variant="outline" onClick={() => navigate('/users')}>
                {language === 'ar' ? 'فتح إدارة المستخدمين' : 'Open User Management'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" />{language === 'ar' ? 'الأقسام' : 'Departments'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <div className="text-sm text-muted-foreground">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div> : (
                metrics.filter(m => ['departments','missing_department'].includes(m.key)).map((m) => (
                  <div key={m.key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{language === 'ar' ? m.labelAr : m.labelEn}</div>
                      {m.hintEn ? <div className="text-xs text-muted-foreground">{language === 'ar' ? m.hintAr : m.hintEn}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(m.status)}
                      <div className="text-sm font-semibold">{m.value}</div>
                    </div>
                  </div>
                ))
              )}
              <Button className="w-full" variant="outline" onClick={() => navigate('/departments')}>
                {language === 'ar' ? 'فتح الأقسام' : 'Open Departments'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" />{language === 'ar' ? 'الأدوار والصلاحيات' : 'RBAC'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? <div className="text-sm text-muted-foreground">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div> : (
                metrics.filter(m => ['custom_roles_assigned','dup_staff','dup_email'].includes(m.key)).map((m) => (
                  <div key={m.key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{language === 'ar' ? m.labelAr : m.labelEn}</div>
                      {m.hintEn ? <div className="text-xs text-muted-foreground">{language === 'ar' ? m.hintAr : m.hintEn}</div> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(m.status)}
                      <div className="text-sm font-semibold">{m.value}</div>
                    </div>
                  </div>
                ))
              )}
              <Button className="w-full" variant="outline" onClick={() => navigate('/settings/roles-permissions')}>
                {language === 'ar' ? 'فتح الأدوار والصلاحيات' : 'Open Roles & Permissions'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {hasDup ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{language === 'ar' ? 'تكرار البيانات' : 'Duplicates'}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="text-sm font-medium mb-2">{language === 'ar' ? 'تكرار رقم الموظف' : 'Duplicate staff_id'}</div>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'رقم الموظف' : 'Staff ID'}</TableHead>
                        <TableHead className="text-right">{language === 'ar' ? 'العدد' : 'Count'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dupStaff || []).slice(0, 25).map((r) => (
                        <TableRow key={r.staff_id}>
                          <TableCell>{r.staff_id}</TableCell>
                          <TableCell className="text-right font-medium">{r.n}</TableCell>
                        </TableRow>
                      ))}
                      {dupStaff.length === 0 ? (
                        <TableRow><TableCell colSpan={2} className="text-muted-foreground text-center">—</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">{language === 'ar' ? 'تكرار البريد' : 'Duplicate email'}</div>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'البريد' : 'Email'}</TableHead>
                        <TableHead className="text-right">{language === 'ar' ? 'العدد' : 'Count'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(dupEmail || []).slice(0, 25).map((r) => (
                        <TableRow key={r.email}>
                          <TableCell className="font-mono text-xs">{r.email}</TableCell>
                          <TableCell className="text-right font-medium">{r.n}</TableCell>
                        </TableRow>
                      ))}
                      {dupEmail.length === 0 ? (
                        <TableRow><TableCell colSpan={2} className="text-muted-foreground text-center">—</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
};

export default DataHealthPage;
