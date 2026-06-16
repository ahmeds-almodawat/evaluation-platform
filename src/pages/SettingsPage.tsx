import React, { useState } from 'react';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { useTheme } from 'next-themes';
import { KeyRound, ShieldCheck, Sun, Moon, Monitor, Wand2, Trash2, DatabaseZap, Copy, ClipboardList, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
const SettingsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { role } = useSupabaseAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const minLen = 8;


const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast({
      title: language === 'ar' ? 'تم النسخ' : 'Copied',
      description: language === 'ar' ? 'تم نسخ النص إلى الحافظة.' : 'Text copied to clipboard.',
    });
  } catch {
    toast({
      title: language === 'ar' ? 'فشل النسخ' : 'Copy failed',
      description:
        language === 'ar'
          ? 'تعذّر النسخ تلقائيًا. حدّد النص يدويًا ثم انسخه.'
          : 'Could not copy automatically. Please select the text and copy it manually.',
      variant: 'destructive',
    });
  }
};

const SqlBlock: React.FC<{
  title: string;
  description?: string;
  sql: string;
}> = ({ title, description, sql }) => {
  return (
    <div className="rounded-lg border border-border p-4 bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description ? <p className="text-xs text-muted-foreground mt-1">{description}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 whitespace-nowrap"
          onClick={() => copyToClipboard(sql)}
        >
          <Copy className="h-4 w-4" />
          {language === 'ar' ? 'نسخ' : 'Copy'}
        </Button>
      </div>
      <pre className="text-xs overflow-x-auto rounded bg-background p-3 border border-border mt-3">{sql}</pre>
    </div>
  );
};

  const onUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < minLen) {
      toast({
        title: language === 'ar' ? 'كلمة المرور قصيرة' : 'Password is too short',
        description:
          language === 'ar'
            ? `يجب أن تكون كلمة المرور ${minLen} أحرف على الأقل.`
            : `Password must be at least ${minLen} characters.`,
        variant: 'destructive',
      });
      return;
    }
    if (newPassword !== confirm) {
      toast({
        title: language === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match',
        description: language === 'ar' ? 'تأكد من كتابة نفس كلمة المرور مرتين.' : 'Please type the same password twice.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast({
          title: language === 'ar' ? 'انتهت الجلسة' : 'Session expired',
          description: language === 'ar' ? 'سجّل الدخول مرة أخرى ثم حاول.' : 'Please sign in again and retry.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword('');
      setConfirm('');

      toast({
        title: language === 'ar' ? 'تم تحديث كلمة المرور' : 'Password updated',
        description: language === 'ar' ? 'تم حفظ التغيير بنجاح.' : 'Your change was saved successfully.',
      });
    } catch (err: any) {
      console.error('Password update error', err);
      toast({
        title: language === 'ar' ? 'تعذر تحديث كلمة المرور' : 'Could not update password',
        description:
          language === 'ar'
            ? (err?.message || 'حاول مرة أخرى لاحقًا.')
            : (err?.message || 'Please try again later.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header title={t('nav.settings')} subtitle={language === 'ar' ? 'إدارة الحساب والأمان' : 'Manage your account & security'} />

      <main className="container mx-auto px-4 pb-8">
        <div className="max-w-2xl space-y-6">
          {(role === 'admin' || role === 'super_user' || role === 'audit') ? (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DatabaseZap className="h-4 w-4" />
                  {language === 'ar' ? 'التشغيل والنسخ الاحتياطي' : 'Operations & Backups'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{language === 'ar' ? 'صحة النظام' : 'System Health'}</p>
                      <p className="text-xs text-muted-foreground">
                        {language === 'ar'
                          ? 'تأكد أن الاتصال والبيانات سليمة قبل الإرسال أو التصدير.'
                          : 'Confirm connectivity and key counts before sending or exporting.'}
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => navigate('/settings/system-health')} className="gap-2">
                      {language === 'ar' ? 'فتح' : 'Open'}
                    </Button>
                  </div>

                  {(role === 'admin' || role === 'super_user') ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{language === 'ar' ? 'صحة البيانات' : 'Data Health'}</p>
                        <p className="text-xs text-muted-foreground">
                          {language === 'ar'
                            ? 'كشف سريع لمشاكل (بدون قسم/تكرار staff_id/تكرار بريد) التي تكسر التقارير والاستيراد.'
                            : 'Quick scan for issues (missing dept, duplicate staff_id/email) that break reports/imports.'}
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={() => navigate('/settings/data-health')} className="gap-2">
                        {language === 'ar' ? 'فتح' : 'Open'}
                      </Button>
                    </div>
                  ) : null}

                  {role === 'admin' ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{language === 'ar' ? 'اختبارات سريعة' : 'Smoke Tests'}</p>
                        <p className="text-xs text-muted-foreground">
                          {language === 'ar'
                            ? 'قائمة فحص بعد أي تعديلات لتجنب رجوع مشاكل الأدوار/الملفات.'
                            : 'Post-patch checklist to prevent RBAC/profile regressions.'}
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={() => navigate('/settings/smoke-tests')} className="gap-2">
                        {language === 'ar' ? 'فتح' : 'Open'}
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{language === 'ar' ? 'مركز التصدير والنسخ الاحتياطي' : 'Export & Backup Center'}</p>
                      <p className="text-xs text-muted-foreground">
                        {language === 'ar'
                          ? 'تصدير Excel للتقارير وJSON للاستعادة والنسخ الاحتياطي.'
                          : 'Excel reporting exports and JSON restore/backup files.'}
                      </p>
                    </div>
                    <Button type="button" onClick={() => navigate('/settings/export-center')} className="gap-2">
                      {language === 'ar' ? 'فتح' : 'Open'}
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-destructive" />
                        {language === 'ar' ? 'سجل الوصول الحساس' : 'Sensitive Access Log'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {language === 'ar'
                          ? 'أي كشف لهوية المقيم يتم تسجيله هنا لمراجعة التدقيق.'
                          : 'Any rater identity reveal is logged here for audit review.'}
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => navigate('/settings/sensitive-access')} className="gap-2">
                      {language === 'ar' ? 'فتح' : 'Open'}
                    </Button>
                  </div>

                  {role === 'admin' ? (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{language === 'ar' ? 'مركز الاستيراد والاستعادة' : 'Import & Restore Center'}</p>
                        <p className="text-xs text-muted-foreground">
                          {language === 'ar'
                            ? 'استعادة بيانات التطبيق العامة من ملف JSON مع معاينة وتحذيرات (بدون كلمات مرور).'
                            : 'Restore public application data from JSON with preview and warnings (no passwords).'}
                        </p>
                      </div>
                      <Button type="button" variant="outline" onClick={() => navigate('/settings/restore-center')} className="gap-2">
                        {language === 'ar' ? 'فتح' : 'Open'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
          {(role === 'admin' || role === 'super_user') ? (
            <Card className="animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="h-4 w-4" />
                  {language === 'ar' ? 'قوالب التقييم' : 'Evaluation Templates'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {language === 'ar' ? 'إدارة القوالب قبل الإرسال' : 'Manage templates before assigning'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar'
                        ? 'أنشئ قالباً، عدّل الأسئلة/الخيارات، ثم انشره ليظهر في صفحة إرسال التقييمات.'
                        : 'Create a template, edit questions/choices, then publish it to appear in evaluation assignment.'}
                    </p>
                  </div>
                  <Button type="button" onClick={() => navigate('/settings/templates')} className="gap-2">
                    {language === 'ar' ? 'فتح' : 'Open'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
{/* Appearance */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wand2 className="h-4 w-4" />
                {language === 'ar' ? 'المظهر' : 'Appearance'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{language === 'ar' ? 'الوضع' : 'Mode'}</p>
                  <p className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'اختر مظهر التطبيق: فاتح أو داكن أو تلقائي.' : 'Choose Light, Dark, or follow your device.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={theme === 'light' ? 'default' : 'outline'}
                    onClick={() => setTheme('light')}
                    className="gap-2"
                  >
                    <Sun className="h-4 w-4" />
                    {language === 'ar' ? 'فاتح' : 'Light'}
                  </Button>
                  <Button
                    type="button"
                    variant={theme === 'dark' ? 'default' : 'outline'}
                    onClick={() => setTheme('dark')}
                    className="gap-2"
                  >
                    <Moon className="h-4 w-4" />
                    {language === 'ar' ? 'داكن' : 'Dark'}
                  </Button>
                  <Button
                    type="button"
                    variant={theme === 'system' || !theme ? 'default' : 'outline'}
                    onClick={() => setTheme('system')}
                    className="gap-2"
                  >
                    <Monitor className="h-4 w-4" />
                    {language === 'ar' ? 'تلقائي' : 'System'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
<Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" />
                {language === 'ar' ? 'تغيير كلمة المرور' : 'Change password'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onUpdatePassword} className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground">{language === 'ar' ? 'كلمة المرور الجديدة' : 'New password'}</label>
                  <div className="mt-1 relative">
                    <KeyRound className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={language === 'ar' ? `على الأقل ${minLen} أحرف` : `At least ${minLen} characters`}
                      className="pl-9"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground">{language === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm password'}</label>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={language === 'ar' ? 'اكتبها مرة أخرى' : 'Type it again'}
                    autoComplete="new-password"
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button type="submit" disabled={saving}>
                    {saving ? (language === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (language === 'ar' ? 'حفظ' : 'Save')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Admin maintenance helpers (instructions only; safe + free) */}
          {(role === 'admin' || role === 'super_user') && (
            <Card className="mt-6 animate-fade-in">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DatabaseZap className="h-4 w-4" />
                  {language === 'ar' ? 'أدوات الصيانة (للمسؤول)' : 'Maintenance tools (Admin)'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar'
                      ? 'هذه أدوات مساعدة (تعليمات + SQL للنسخ) وليست أزرار تنفيذ داخل النظام. انسخ SQL وشغّله يدويًا داخل Supabase SQL Editor. هذا أكثر أمانًا ويمنع تشغيل أوامر حساسة بالخطأ.'
                      : 'These are helper utilities (instructions + copyable SQL), not “run” buttons inside the app. Copy the SQL and run it manually in the Supabase SQL Editor. This is safer and prevents accidental destructive actions.'}
                  </p>
                  <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-foreground">
                    {language === 'ar'
                      ? 'تحذير: بعض الأوامر قد تحذف بيانات بشكل نهائي. تأكد أنك على مشروع Supabase الصحيح قبل التنفيذ.'
                      : 'Warning: some commands permanently delete data. Double-check you are on the correct Supabase project before running anything.'}
                  </div>
                </div>

                <SqlBlock
                  title={language === 'ar' ? 'فحص سريع قبل/بعد التنظيف' : 'Quick checks (before/after cleanup)'}
                  description={
                    language === 'ar'
                      ? 'للتحقق من عدد السجلات واكتشاف البيانات اليتيمة.'
                      : 'Count records and detect orphan data.'
                  }
                  sql={`-- Counts
select count(*) as profiles_count from profiles;
select count(*) as evaluations_count from evaluations;

-- Orphans preview
select count(*) as orphan_evaluatees
from evaluations e
where not exists (select 1 from profiles p where p.id = e.evaluatee_id);

select count(*) as orphan_evaluators
from evaluations e
where e.evaluator_id is not null
  and not exists (select 1 from profiles p where p.id = e.evaluator_id);`}
                />

                <SqlBlock
                  title={language === 'ar' ? 'ترقية مستخدم إلى مدير (Admin)' : 'Promote a user to Admin'}
                  description={
                    language === 'ar'
                      ? 'عدّل البريد الإلكتروني قبل التنفيذ. (يفضل التنفيذ داخل بيئة التطوير فقط)'
                      : 'Edit the email before running. (Prefer running in dev only)'
                  }
                  sql={`-- Promote by email (EDIT EMAIL FIRST)
do $$
declare
  v_user uuid;
begin
  select id into v_user from profiles where lower(email) = 'you@example.com';
  if v_user is null then
    raise exception 'User not found in profiles';
  end if;

  -- Ensure single role
  delete from user_roles where user_id = v_user;

  insert into user_roles(user_id, role)
  values (v_user, 'admin');
end $$;`}
                />

                <SqlBlock
                  title={language === 'ar' ? '1) حذف كل بيانات التقييم' : '1) Delete all evaluations'}
                  description={language === 'ar' ? 'يحذف البيانات فقط (يبقي الجداول).' : 'Deletes data only (keeps schema).'}
                  sql={`-- Delete all evaluations (keeps schema)
delete from evaluations;`}
                />

                <SqlBlock
                  title={language === 'ar' ? '2) حذف كل الملفات الشخصية ما عدا (اختياري)' : '2) Delete profiles except one (optional)'}
                  description={
                    language === 'ar'
                      ? 'عدّل البريد الإلكتروني قبل التنفيذ.'
                      : 'Edit the email before running.'
                  }
                  sql={`-- Keep one person only (profiles) - EDIT EMAIL FIRST
delete from profiles
where lower(email) <> 'you@example.com';`}
                />

                <SqlBlock
                  title={language === 'ar' ? '3) تنظيف تقييمات يتيمة' : '3) Remove orphan evaluations'}
                  description={
                    language === 'ar'
                      ? 'يحذف التقييمات المرتبطة بمستخدم غير موجود.'
                      : 'Deletes evaluations that reference missing users.'
                  }
                  sql={`-- Orphan cleanup
delete from evaluations e
where not exists (select 1 from profiles p where p.id = e.evaluatee_id)
   or (e.evaluator_id is not null and not exists (select 1 from profiles p2 where p2.id = e.evaluator_id));`}
                />

                <SqlBlock
                  title={language === 'ar' ? '4) حذف مستخدمي Auth (من لوحة Supabase)' : '4) Delete Auth users (via Supabase dashboard)'}
                  description={
                    language === 'ar'
                      ? 'الحذف المباشر يتطلب Service Role. الطريقة الآمنة: احذف من لوحة Supabase.'
                      : 'Direct deletion requires Service Role. Safer: delete from Supabase dashboard.'
                  }
                  sql={`-- Safer free way: open Supabase Dashboard → Authentication → Users
-- and delete users you no longer need.
-- (Deleting auth.users cascades to profiles by FK.)`}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
