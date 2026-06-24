import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Plus, Send, Eye, Lock } from 'lucide-react';

type Dept = { id: string; name_en: string; name_ar: string };

type Role = 'admin' | 'super_user' | 'audit' | 'user';

// NOTE:
// Your `profiles` table (as you shared) does NOT have a `role` column.
// Roles live in `user_roles`. So we fetch profiles, then attach role via user_roles.
type ProfileLite = {
  id: string;
  name_en: string;
  name_ar: string;
  department_id: string | null;
  is_active?: boolean | null;
  role: Role;
};

type AnonEval = {
  id: string;
  title: string;
  question_en: string;
  question_ar: string;
  reveal_identity: boolean;
  created_at: string;
};

type AnonResp = {
  id: string;
  answer_text: string;
  responder_id: string | null;
  created_at: string;
};

const normalizeRole = (r: any): Role => {
  const v = String(r || 'user').toLowerCase();
  if (v === 'admin' || v === 'super_user' || v === 'audit' || v === 'user') return v as Role;
  return 'user';
};

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const AnonymousEvaluationsAdminPage: React.FC = () => {
  const { language } = useLanguage();
  const { role, hasPermission } = useSupabaseAuth();
  const { toast } = useToast();

  const canManageAnonymous = hasPermission('evaluations.anonymous.manage') || role === 'admin';

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [departments, setDepartments] = useState<Dept[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);

  // Create form
  const [title, setTitle] = useState('');
  const [questionEn, setQuestionEn] = useState('');
  const [questionAr, setQuestionAr] = useState('');
  const [revealIdentity, setRevealIdentity] = useState(false);

  // Recipients
  const [recipientMode, setRecipientMode] = useState<'all' | 'filtered' | 'manual'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // List + details
  const [evaluations, setEvaluations] = useState<AnonEval[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const selectedEval = useMemo(
    () => evaluations.find((e) => e.id === selectedEvalId) || null,
    [evaluations, selectedEvalId]
  );
  const [responses, setResponses] = useState<AnonResp[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, ProfileLite>>(new Map());

  useEffect(() => {
    if (!canManageAnonymous) return;
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageAnonymous]);

  const bootstrap = async () => {
    setLoading(true);
    try {
      // 1) fetch departments + profiles (NO role column)
      const [{ data: deptData, error: deptErr }, { data: profData, error: profErr }] = await Promise.all([
        supabase.from('departments').select('id,name_en,name_ar').order('name_en'),
        supabase
          .from('profiles')
          .select('id,name_en,name_ar,department_id,is_active')
          .order('name_en'),
      ]);

      if (deptErr) throw deptErr;
      if (profErr) throw profErr;

      setDepartments((deptData || []) as any);

      const rawProfiles = ((profData || []) as any[])
        .filter((p) => p && p.id)
        // hide disabled users by default (keep null as active)
        .filter((p) => p.is_active !== false);

      // 2) fetch roles from user_roles and attach
      const ids = rawProfiles.map((p) => p.id as string);
      const roleMap = new Map<string, Role>();

      // Avoid `in()` limit issues by chunking
      for (const part of chunk(ids, 500)) {
        const { data: rolesData, error: rolesErr } = await supabase
          .from('user_roles')
          .select('user_id,role')
          .in('user_id', part);

        // If user_roles isn't accessible due to RLS, fall back to "user"
        if (!rolesErr && rolesData) {
          for (const r of rolesData as any[]) roleMap.set(r.user_id, normalizeRole(r.role));
        }
      }

      const profs: ProfileLite[] = rawProfiles.map((p: any) => ({
        id: p.id,
        name_en: p.name_en || '',
        name_ar: p.name_ar || '',
        department_id: p.department_id ?? null,
        is_active: p.is_active ?? null,
        role: roleMap.get(p.id) || 'user',
      }));

      setProfiles(profs);
      setProfileMap(new Map(profs.map((p) => [p.id, p])));

      await loadEvaluations();
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

  const loadEvaluations = async () => {
    const { data, error } = await supabase
      .from('anonymous_evaluations')
      .select('id,title,question_en,question_ar,reveal_identity,created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    setEvaluations((data || []) as any);
    if (!selectedEvalId && (data || []).length) setSelectedEvalId((data || [])[0].id);
  };

  useEffect(() => {
    if (!selectedEvalId) {
      setResponses([]);
      return;
    }
    void loadResponses(selectedEvalId);
  }, [selectedEvalId]);

  const loadResponses = async (evaluationId: string) => {
    try {
      const { data, error } = await supabase
        .from('anonymous_evaluation_responses')
        .select('id,answer_text,responder_id,created_at')
        .eq('evaluation_id', evaluationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setResponses((data || []) as any);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل تحميل الإجابات' : 'Failed to load responses'),
        variant: 'destructive',
      });
    }
  };

  const filterByDeptRole = (list: ProfileLite[]) =>
    list.filter((p) => {
      if (deptFilter !== 'all' && p.department_id !== deptFilter) return false;
      if (roleFilter !== 'all' && p.role !== (roleFilter as Role)) return false;
      return true;
    });

  const filteredProfiles = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = filterByDeptRole(profiles);
    if (!s) return base;
    return base.filter(
      (p) =>
        (p.name_en || '').toLowerCase().includes(s) ||
        (p.name_ar || '').includes(search)
    );
  }, [profiles, deptFilter, roleFilter, search]);

  const togglePick = (id: string) => setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));

  const createAndSend = async () => {
    if (!title.trim() || !questionEn.trim() || !questionAr.trim()) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description:
          language === 'ar' ? 'أكمل العنوان والسؤال بالعربي والإنجليزي' : 'Please fill title and both Arabic/English question',
        variant: 'destructive',
      });
      return;
    }

    // IMPORTANT (your request for 500 users):
    // - "All" sends to all ACTIVE profiles (is_active != false).
    // - "Filtered" uses Department + Role filters.
    const recipients =
      recipientMode === 'all'
        ? profiles.map((p) => p.id)
        : recipientMode === 'filtered'
          ? profiles
              .filter(
                (p) =>
                  (deptFilter === 'all' || p.department_id === deptFilter) &&
                  (roleFilter === 'all' || p.role === (roleFilter as Role))
              )
              .map((p) => p.id)
          : Object.keys(selectedIds).filter((id) => selectedIds[id]);

    if (!recipients.length) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اختر مستلمين على الأقل' : 'Pick at least one recipient',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const { data: evalRow, error: evalErr } = await supabase
        .from('anonymous_evaluations')
        .insert({
          title: title.trim(),
          question_en: questionEn.trim(),
          question_ar: questionAr.trim(),
          reveal_identity: revealIdentity,
        })
        .select('id,title,question_en,question_ar,reveal_identity,created_at')
        .maybeSingle();

      if (evalErr) throw evalErr;
      if (!evalRow) throw new Error('Failed to create anonymous evaluation');

      // Optional secret (depends on your policies)
      await supabase.from('anonymous_evaluation_secrets').insert({ evaluation_id: evalRow.id });

      // Insert recipients in chunks (safe for 500 users)
      for (const part of chunk(recipients, 500)) {
        const payload = part.map((user_id) => ({ evaluation_id: evalRow.id, user_id }));
        const { error: recErr } = await supabase.from('anonymous_evaluation_recipients').insert(payload);
        if (recErr) throw recErr;
      }

      toast({
        title: language === 'ar' ? 'تم' : 'Done',
        description: language === 'ar' ? 'تم إرسال التقييم المجهول' : 'Anonymous evaluation sent',
      });

      // Reset form
      setTitle('');
      setQuestionEn('');
      setQuestionAr('');
      setRevealIdentity(false);
      setRecipientMode('all');
      setDeptFilter('all');
      setRoleFilter('all');
      setSearch('');
      setSelectedIds({});

      await loadEvaluations();
      setSelectedEvalId(evalRow.id);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل الإرسال' : 'Send failed'),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  if (!canManageAnonymous) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={language === 'ar' ? 'التقييم المجهول' : 'Anonymous Evaluation'} />
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {language === 'ar' ? 'هذه الصفحة متاحة للمدير فقط.' : 'This page is available to Admin only.'}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={language === 'ar' ? 'التقييم المجهول' : 'Anonymous Evaluation'} />
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={language === 'ar' ? 'التقييم المجهول' : 'Anonymous Evaluation'}
        subtitle={
          language === 'ar'
            ? 'يرسل بواسطة المدير فقط. يمكن جعل الإجابات مجهولة بالكامل أو مع إظهار هوية المجيب.'
            : 'Admin-only. You can make responses fully anonymous or allow identity visibility.'
        }
      />

      <div className="p-6 space-y-6">
        {/* Create */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {language === 'ar' ? 'إنشاء وإرسال' : 'Create & Send'}
            </CardTitle>
            <CardDescription>
              {language === 'ar'
                ? 'السؤال: إجابة نصية بدون حد أقصى (حسب طلبك).'
                : 'Question: text answer with no max limit (as requested).'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'العنوان' : 'Title'}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: استبيان مجهول' : 'e.g., Anonymous feedback'}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {language === 'ar' ? 'إظهار هوية المجيب للمدير' : 'Reveal respondent identity to admin'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {language === 'ar'
                      ? 'إذا أوقفتها تصبح الإجابات مجهولة بالكامل (لا يتم حفظ معرف المجيب).'
                      : 'If OFF, responses are fully anonymous (no user id stored).'}
                  </div>
                </div>
                <Switch checked={revealIdentity} onCheckedChange={setRevealIdentity} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'السؤال (English)' : 'Question (English)'}</Label>
                <Textarea value={questionEn} onChange={(e) => setQuestionEn(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'السؤال (عربي)' : 'Question (Arabic)'}</Label>
                <Textarea value={questionAr} onChange={(e) => setQuestionAr(e.target.value)} rows={3} />
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium">{language === 'ar' ? 'المستلمون' : 'Recipients'}</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{language === 'ar' ? 'الوضع' : 'Mode'}</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name="recipientMode"
                        checked={recipientMode === 'all'}
                        onChange={() => setRecipientMode('all')}
                      />
                      {language === 'ar' ? 'الكل' : 'All'}
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name="recipientMode"
                        checked={recipientMode === 'filtered'}
                        onChange={() => setRecipientMode('filtered')}
                      />
                      {language === 'ar' ? 'حسب الفلاتر' : 'Filtered'}
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name="recipientMode"
                        checked={recipientMode === 'manual'}
                        onChange={() => setRecipientMode('manual')}
                      />
                      {language === 'ar' ? 'تحديد يدوي' : 'Manual'}
                    </label>
                  </div>
                </div>
                {recipientMode === 'manual' ? (
                  <Badge variant="secondary" className="text-xs">
                    {Object.keys(selectedIds).filter((k) => selectedIds[k]).length} {language === 'ar' ? 'محدد' : 'selected'}
                  </Badge>
                ) : recipientMode === 'filtered' ? (
                  <Badge variant="secondary" className="text-xs">
                    {language === 'ar' ? 'سيتم الإرسال حسب الفلاتر' : 'Will send by filters'}
                  </Badge>
                ) : null}
              </div>

              <Button onClick={() => void createAndSend()} disabled={creating} className="gap-2">
                <Send className="w-4 h-4" />
                {language === 'ar' ? 'إرسال' : 'Send'}
              </Button>
            </div>

            {recipientMode !== 'all' ? (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">{language === 'ar' ? 'فلتر القسم' : 'Department filter'}</Label>
                    <select
                      className="w-full border rounded-md bg-background px-3 py-2 text-sm"
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                    >
                      <option value="all">{language === 'ar' ? 'الكل' : 'All'}</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {language === 'ar' ? d.name_ar : d.name_en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">{language === 'ar' ? 'فلتر الدور' : 'Role filter'}</Label>
                    <select
                      className="w-full border rounded-md bg-background px-3 py-2 text-sm"
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                    >
                      <option value="all">{language === 'ar' ? 'الكل' : 'All'}</option>
                      <option value="admin">Admin</option>
                      <option value="super_user">Super User</option>
                      <option value="audit">Audit</option>
                      <option value="user">User</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-xs">{language === 'ar' ? 'بحث' : 'Search'}</Label>
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={language === 'ar' ? 'اسم عربي أو إنجليزي' : 'Arabic or English name'}
                    />
                  </div>
                </div>

                {recipientMode === 'manual' ? (
                  <div className="max-h-64 overflow-auto rounded-md border">
                    {filteredProfiles.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/30">
                        <input type="checkbox" checked={!!selectedIds[p.id]} onChange={() => togglePick(p.id)} />
                        <span className="text-sm">{language === 'ar' ? p.name_ar : p.name_en}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {language === 'ar'
                      ? `سيتم الإرسال إلى ${
                          profiles.filter(
                            (p) =>
                              (deptFilter === 'all' || p.department_id === deptFilter) &&
                              (roleFilter === 'all' || p.role === (roleFilter as Role))
                          ).length
                        } موظف/ة حسب الفلاتر.`
                      : `Will send to ${
                          profiles.filter(
                            (p) =>
                              (deptFilter === 'all' || p.department_id === deptFilter) &&
                              (roleFilter === 'all' || p.role === (roleFilter as Role))
                          ).length
                        } employees by filters.`}
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">{language === 'ar' ? 'القائمة' : 'List'}</CardTitle>
              <CardDescription>{language === 'ar' ? 'اختر استبياناً لرؤية الإجابات' : 'Select an evaluation to view responses'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {evaluations.length === 0 ? (
                <div className="text-sm text-muted-foreground">{language === 'ar' ? 'لا يوجد' : 'None yet'}</div>
              ) : (
                evaluations.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedEvalId(e.id)}
                    className={`w-full text-left rounded-lg border p-3 transition ${
                      selectedEvalId === e.id ? 'border-primary bg-muted/20' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{e.title}</div>
                        <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                      </div>
                      <Badge variant={e.reveal_identity ? 'secondary' : 'outline'} className="text-xs">
                        {e.reveal_identity ? (language === 'ar' ? 'هوية ظاهرة' : 'Identified') : language === 'ar' ? 'مجهول' : 'Anonymous'}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4" />
                {language === 'ar' ? 'الإجابات' : 'Responses'}
              </CardTitle>
              <CardDescription>
                {selectedEval
                  ? language === 'ar'
                    ? `عدد الإجابات: ${responses.length}`
                    : `Responses: ${responses.length}`
                  : language === 'ar'
                    ? 'اختر استبياناً'
                    : 'Pick an evaluation'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedEval ? (
                <div className="text-sm text-muted-foreground">{language === 'ar' ? 'اختر من القائمة' : 'Select from the list'}</div>
              ) : (
                <>
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="text-sm font-medium">{selectedEval.title}</div>
                    <div className="text-sm text-muted-foreground">{language === 'ar' ? selectedEval.question_ar : selectedEval.question_en}</div>
                  </div>

                  {responses.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{language === 'ar' ? 'لا توجد إجابات بعد' : 'No responses yet'}</div>
                  ) : (
                    <div className="space-y-3">
                      {responses.map((r) => {
                        const responder = r.responder_id ? profileMap.get(r.responder_id) : null;
                        return (
                          <div key={r.id} className="rounded-lg border p-4 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                              <Badge variant="outline" className="text-xs">
                                {selectedEval.reveal_identity
                                  ? responder
                                    ? language === 'ar'
                                      ? responder.name_ar
                                      : responder.name_en
                                    : language === 'ar'
                                      ? 'غير معروف'
                                      : 'Unknown'
                                  : language === 'ar'
                                    ? 'مجهول'
                                    : 'Anonymous'}
                              </Badge>
                            </div>
                            <div className="text-sm whitespace-pre-wrap">{r.answer_text}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AnonymousEvaluationsAdminPage;
