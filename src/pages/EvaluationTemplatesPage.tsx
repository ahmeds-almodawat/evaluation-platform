import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Save, Trash2, ArrowUp, ArrowDown, CheckCircle2, Lock, Copy, Pencil } from 'lucide-react';

type TemplateStatus = 'draft' | 'published' | 'archived';

type TemplateLabel = { en: string; ar: string };

type Template = {
  id: string;
  name: string;
  status: TemplateStatus;
  scale_max: 3 | 4 | 5;
  labels: Record<string, TemplateLabel>;
  updated_at: string;
};

type TemplateQuestion = {
  id: string;
  template_id: string;
  sort_order: number;
  text_en: string;
  text_ar: string;
  required: boolean;
  question_type: 'scale' | 'text';
  max_chars: number | null;
};

const defaultLabels4: Record<string, TemplateLabel> = {
  '1': { en: 'Bad', ar: 'سيء' },
  '2': { en: 'Neutral', ar: 'محايد' },
  '3': { en: 'Good', ar: 'جيد' },
  '4': { en: 'Excellent', ar: 'ممتاز' },
};


const defaultLabels5: Record<string, TemplateLabel> = {
  '1': { en: 'Bad', ar: 'سيء' },
  '2': { en: 'Poor', ar: 'ضعيف' },
  '3': { en: 'Neutral', ar: 'محايد' },
  '4': { en: 'Good', ar: 'جيد' },
  '5': { en: 'Excellent', ar: 'ممتاز' },
};

const defaultLabels3: Record<string, TemplateLabel> = {
  '1': { en: 'Bad', ar: 'سيء' },
  '2': { en: 'Neutral', ar: 'محايد' },
  '3': { en: 'Good', ar: 'جيد' },
};

const EvaluationTemplatesPage: React.FC = () => {
  const { language } = useLanguage();
  const { role } = useSupabaseAuth();
  const { toast } = useToast();

  const canManage = role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<TemplateQuestion[]>([]);

  // Working copy for editor
  const selected = useMemo(() => templates.find(t => t.id === selectedId) || null, [templates, selectedId]);
  const [nameDraft, setNameDraft] = useState('');
  const [scaleDraft, setScaleDraft] = useState<3 | 4 | 5>(4);
  const [labelsDraft, setLabelsDraft] = useState<Record<string, TemplateLabel>>(defaultLabels4);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [forceEdit, setForceEdit] = useState(false);

  const isDefaultTemplate = (t: Template | null) => (t?.name || '').trim() === 'Default Evaluation';
  const isLocked = Boolean(selected && selected.status === 'published' && !forceEdit);
  const canEditFields = Boolean(selected && canManage && (!isLocked));

  useEffect(() => {
    if (!canManage) return;
    void loadTemplates();
  }, [canManage]);

  useEffect(() => {
    setForceEdit(false);
    if (!selected) {
      setNameDraft('');
      setScaleDraft(4);
      setLabelsDraft(defaultLabels4);
      setQuestions([]);
      return;
    }
    setNameDraft(selected.name);
    setScaleDraft(selected.scale_max);
    setLabelsDraft(selected.labels && Object.keys(selected.labels).length
      ? selected.labels
      : (selected.scale_max === 3 ? defaultLabels3 : (selected.scale_max === 5 ? defaultLabels5 : defaultLabels4)));
    void loadQuestions(selected.id);
  }, [selectedId]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('evaluation_templates')
        .select('id,name,status,scale_max,labels,updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setTemplates((data || []) as any);
      if (!selectedId && (data || []).length) setSelectedId((data || [])[0].id);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'فشل تحميل القوالب' : 'Failed to load templates',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('evaluation_template_questions')
        .select('id,template_id,sort_order,text_en,text_ar,required,question_type,max_chars')
        .eq('template_id', templateId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setQuestions((data || []) as any);
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'فشل تحميل الأسئلة' : 'Failed to load questions',
        variant: 'destructive',
      });
    }
  };

  const createTemplate = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('evaluation_templates')
        .insert({
          name: language === 'ar' ? 'قالب جديد' : 'New template',
          status: 'draft',
          scale_max: 4,
          labels: defaultLabels4,
        })
        .select('id,name,status,scale_max,labels,updated_at')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setTemplates(prev => [data as any, ...prev]);
        setSelectedId(data.id);
        toast({
          title: language === 'ar' ? 'تم' : 'Done',
          description: language === 'ar' ? 'تم إنشاء قالب جديد (مسودة)' : 'Draft template created',
        });
      }
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل إنشاء القالب' : 'Failed to create template'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // Create new draft template
      const { data: newTpl, error: tplErr } = await supabase
        .from('evaluation_templates')
        .insert({
          name: `${selected.name} (v2)`,
          status: 'draft',
          scale_max: selected.scale_max,
          labels: selected.labels,
        })
        .select('id,name,status,scale_max,labels,updated_at')
        .maybeSingle();
      if (tplErr) throw tplErr;
      if (!newTpl) throw new Error('Failed to create template');

      // Copy questions
      if (questions.length) {
        const payload = questions
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(q => ({
            template_id: newTpl.id,
            sort_order: q.sort_order,
            text_en: q.text_en,
            text_ar: q.text_ar,
            required: q.required,
            question_type: (q as any).question_type || 'scale',
            max_chars: (q as any).question_type === 'text' ? ((q as any).max_chars || 200) : null,
          }));
        const { error: qErr } = await supabase
          .from('evaluation_template_questions')
          .insert(payload);
        if (qErr) throw qErr;
      }

      setTemplates(prev => [newTpl as any, ...prev]);
      setSelectedId(newTpl.id);
      toast({
        title: language === 'ar' ? 'تم' : 'Done',
        description: language === 'ar' ? 'تم نسخ القالب كمسودة جديدة' : 'Template duplicated into a new draft',
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل نسخ القالب' : 'Failed to duplicate template'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const setScaleAndEnsureLabels = (next: 3 | 4 | 5) => {
    setScaleDraft(next);
    setLabelsDraft(prev => {
      const base = next === 3 ? defaultLabels3 : (next === 5 ? defaultLabels5 : defaultLabels4);
      const merged: Record<string, TemplateLabel> = { ...base, ...prev };
      // Remove extra labels beyond the selected scale
      for (let i = 5; i > next; i--) {
        delete merged[String(i)];
      }
      return merged;
    });
  };

  const addQuestion = () => {
    if (!selected) return;
    if (!canEditFields) {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar' ? 'القالب مقفّل. انسخه أو فعّل التعديل.' : 'Template is locked. Duplicate or enable edit mode.',
        variant: 'destructive',
      });
      return;
    }
    const nextOrder = questions.length ? Math.max(...questions.map(q => q.sort_order)) + 1 : 1;
    setQuestions(prev => [
      ...prev,
      {
        id: `tmp_${Math.random().toString(36).slice(2, 10)}`,
        template_id: selected.id,
        sort_order: nextOrder,
        text_en: '',
        text_ar: '',
        required: true,
        question_type: 'scale',
        max_chars: null,
      } as any,
    ]);
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const next = questions.slice();
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    const a = next[idx];
    const b = next[swapIdx];
    // swap sort_order
    const tmp = a.sort_order;
    a.sort_order = b.sort_order;
    b.sort_order = tmp;
    // swap in array
    next[idx] = b;
    next[swapIdx] = a;
    // normalize ordering
    next.sort((x, y) => x.sort_order - y.sort_order);
    setQuestions(next);
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const saveTemplate = async () => {
    if (!selected) return;
    if (!canManage) {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar' ? 'هذه العملية للمدير فقط' : 'Admin only',
        variant: 'destructive',
      });
      return;
    }
    if (isLocked) {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar'
          ? 'هذا القالب منشور ومقفّل. انسخه للتعديل، أو اضغط «تعديل» (للمدير) لفتح التعديل المباشر.'
          : 'This template is published and locked. Duplicate to edit, or (Admin) click “Edit” to override.',
        variant: 'destructive',
      });
      return;
    }
    if (!nameDraft.trim()) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اكتب اسم القالب' : 'Please enter a template name',
        variant: 'destructive',
      });
      return;
    }
    const cleanedQuestions = questions
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((q, i) => ({ ...q, sort_order: i + 1 }));
    if (!cleanedQuestions.length) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'أضف سؤال واحد على الأقل' : 'Add at least one question',
        variant: 'destructive',
      });
      return;
    }
    if (cleanedQuestions.some(q => !q.text_en.trim() || !q.text_ar.trim())) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'كل سؤال لازم يكون مكتوب بالعربي والإنجليزي' : 'Each question must have both Arabic and English text',
        variant: 'destructive',
      });
      return;
    }

    const templateId = selected?.id;

    if (!templateId) {

      toast({

        title: language === 'ar' ? 'خطأ' : 'Error',

        description: language === 'ar' ? 'معرّف القالب غير موجود' : 'Missing template id',

        variant: 'destructive',

      });

      return;

    }

    setSaving(true);
    try {
      // 1) Update template header
      const { error: tErr } = await supabase
        .from('evaluation_templates')
        .update({
          name: nameDraft.trim(),
          scale_max: scaleDraft,
          labels: labelsDraft,
        })
        .eq('id', templateId);
      if (tErr) throw tErr;

      // 2) Sync questions (insert/update/delete)
      const existingIds = new Set(cleanedQuestions.filter(q => !String(q.id).startsWith('tmp_')).map(q => q.id));
      const { data: remoteRows, error: remoteErr } = await supabase
        .from('evaluation_template_questions')
        .select('id')
        .eq('template_id', templateId);

      if (remoteErr) throw remoteErr;

      const remoteIds = new Set((remoteRows || []).map((r: any) => r.id));

      const toDelete = Array.from(remoteIds).filter(id => !existingIds.has(id));
      if (toDelete.length) {
        const { error: delErr } = await supabase
          .from('evaluation_template_questions')
          .delete()
          .in('id', toDelete);
        if (delErr) throw delErr;
      }

      const toInsert = cleanedQuestions.filter(q => String(q.id).startsWith('tmp_')).map(q => ({
        template_id: templateId,
        sort_order: q.sort_order,
        text_en: q.text_en.trim(),
        text_ar: q.text_ar.trim(),
        required: q.required,
            question_type: (q as any).question_type || 'scale',
            max_chars: (q as any).question_type === 'text' ? ((q as any).max_chars || 200) : null,
      }));
      if (toInsert.length) {
        const { error: insErr } = await supabase
          .from('evaluation_template_questions')
          .insert(toInsert);
        if (insErr) throw insErr;
      }

      const toUpdate = cleanedQuestions.filter(q => !String(q.id).startsWith('tmp_')).map(q => ({
        id: q.id,
        template_id: templateId,
        sort_order: q.sort_order,
        text_en: q.text_en.trim(),
        text_ar: q.text_ar.trim(),
        required: q.required,
            question_type: (q as any).question_type || 'scale',
            max_chars: (q as any).question_type === 'text' ? ((q as any).max_chars || 200) : null,
      }));
      // Upsert for updates
      if (toUpdate.length) {
        const { error: upErr } = await supabase
          .from('evaluation_template_questions')
          .upsert(toUpdate, { onConflict: 'id' });
        if (upErr) throw upErr;
      }

      // Update local list
      setTemplates(prev => prev.map(t => t.id === templateId ? ({
        ...t,
        name: nameDraft.trim(),
        scale_max: scaleDraft,
        labels: labelsDraft,
      } as any) : t));

      await loadQuestions(templateId);
      toast({
        title: language === 'ar' ? 'تم الحفظ' : 'Saved',
        description: language === 'ar' ? 'تم حفظ القالب' : 'Template saved',
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل الحفظ' : 'Save failed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const publishTemplate = async () => {
    if (!selected) return;
    if (!canEditFields) return;
    setSaving(true);
    try {
      await saveTemplate(); // ensures latest saved
      const { error } = await supabase
        .from('evaluation_templates')
        .update({ status: 'published', updated_at: new Date().toISOString() })
        .eq('id', selected.id);
      if (error) throw error;
      setTemplates(prev => prev.map(t => t.id === selected.id ? ({ ...t, status: 'published' } as any) : t));
      toast({
        title: language === 'ar' ? 'تم النشر' : 'Published',
        description: language === 'ar' ? 'تم نشر القالب وأصبح مقفلاً' : 'Template published and locked',
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل النشر' : 'Publish failed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };


  const deleteTemplate = async () => {
    if (!selected) return;
    if (!canManage) return;
    if (isDefaultTemplate(selected)) {
      toast({
        title: language === 'ar' ? 'غير مسموح' : 'Not allowed',
        description: language === 'ar' ? 'لا يمكن حذف القالب الافتراضي' : 'Default template cannot be deleted',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // If referenced by evaluations, archive instead of delete (safer)
      const { data: used, error: usedErr } = await supabase
        .from('evaluations')
        .select('id')
        .eq('template_id', selected.id)
        .limit(1);
      if (usedErr) throw usedErr;

      if ((used || []).length) {
        const { error } = await supabase
          .from('evaluation_templates')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', selected.id);
        if (error) throw error;

        setTemplates(prev => prev.map(t => t.id === selected.id ? ({ ...t, status: 'archived' } as any) : t));

        toast({
          title: language === 'ar' ? 'تمت الأرشفة' : 'Archived',
          description: language === 'ar' ? 'القالب مستخدم سابقاً، تم أرشفته بدل الحذف' : 'Template is referenced, archived instead of deleting',
        });
      } else {
        const { error } = await supabase
          .from('evaluation_templates')
          .delete()
          .eq('id', selected.id);
        if (error) throw error;

        setTemplates(prev => {
          const remaining = prev.filter(t => t.id !== selected.id);
          const nextId = remaining.length ? remaining[0].id : null;
          setSelectedId(nextId);
          return remaining;
        });

        toast({
          title: language === 'ar' ? 'تم الحذف' : 'Deleted',
          description: language === 'ar' ? 'تم حذف القالب' : 'Template deleted',
        });
      }
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل الحذف' : 'Delete failed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s: TemplateStatus) => {
    if (s === 'published') return <Badge className="bg-success text-white">{language === 'ar' ? 'منشور' : 'Published'}</Badge>;
    if (s === 'draft') return <Badge variant="secondary">{language === 'ar' ? 'مسودة' : 'Draft'}</Badge>;
    return <Badge variant="outline">{language === 'ar' ? 'مؤرشف' : 'Archived'}</Badge>;
  };

  if (!canManage) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={language === 'ar' ? 'قوالب التقييم' : 'Evaluation Templates'} />
        <div className="p-6">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {language === 'ar'
                ? 'هذه الصفحة متاحة فقط للمدير.'
                : 'This page is available to Admin only.'}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        title={language === 'ar' ? 'قوالب التقييم' : 'Evaluation Templates'}
        subtitle={language === 'ar' ? 'إنشاء وتحرير ونشر قوالب التقييم قبل الإرسال' : 'Create, edit, and publish templates before assigning evaluations'}
      />

      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {language === 'ar'
              ? 'ملاحظة: القوالب المنشورة مقفلة. للتعديل أنشئ نسخة (Duplicate) ثم عدّلها وانشرها.'
              : 'Note: Published templates are locked. Duplicate to create a new draft version.'}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void loadTemplates()} disabled={loading || saving}>
              {language === 'ar' ? 'تحديث' : 'Refresh'}
            </Button>
            <Button onClick={() => void createTemplate()} className="gap-2" disabled={saving}>
              <Plus className="w-4 h-4" />
              {language === 'ar' ? 'قالب جديد' : 'New template'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">{language === 'ar' ? 'القوالب' : 'Templates'}</CardTitle>
              <CardDescription>{language === 'ar' ? 'اختر قالباً للتعديل' : 'Select a template to edit'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <div className="text-sm text-muted-foreground">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>
              ) : templates.length === 0 ? (
                <div className="text-sm text-muted-foreground">{language === 'ar' ? 'لا توجد قوالب بعد' : 'No templates yet'}</div>
              ) : (
                templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left rounded-lg border p-3 transition ${selectedId === t.id ? 'border-primary bg-muted/20' : 'border-border hover:border-primary/50'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-foreground">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{language === 'ar' ? 'الخيارات:' : 'Choices:'} {t.scale_max}</div>
                      </div>
                      {statusBadge(t.status)}
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Editor */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{language === 'ar' ? 'محرر القالب' : 'Template Editor'}</CardTitle>
              <CardDescription>
                {selected
                  ? (isLocked
                    ? (language === 'ar'
                      ? 'هذا القالب منشور ومقفّل. (للمدير) اضغط «تعديل» أو انسخه لإنشاء نسخة.'
                      : 'This template is published and locked. (Admin) Click “Edit” to override, or duplicate to create a new draft.')
                    : (selected.status === 'published'
                      ? (language === 'ar'
                        ? 'وضع التعديل للمدير مفعّل (تعديل مباشر على قالب منشور).'
                        : 'Admin edit mode enabled (editing a published template).')
                      : (language === 'ar' ? 'عدّل القالب ثم احفظ أو انشر.' : 'Edit then save or publish.')))
                  : (language === 'ar' ? 'اختر قالباً' : 'Select a template')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!selected ? (
                <div className="text-sm text-muted-foreground">{language === 'ar' ? 'اختر قالباً من القائمة' : 'Pick a template from the list'}</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {statusBadge(selected.status)}
                      {isLocked ? <Lock className="w-4 h-4 text-muted-foreground" /> : (selected.status === 'published' ? <Pencil className="w-4 h-4 text-muted-foreground" /> : null)}
                    </div>
                    <div className="flex items-center gap-2">
                      {selected.status === 'published' ? (
                        isLocked ? (
                          <Button variant="outline" onClick={() => setForceEdit(true)} disabled={saving} className="gap-2">
                            <Pencil className="w-4 h-4" />
                            {language === 'ar' ? 'تعديل' : 'Edit'}
                          </Button>
                        ) : (
                          <Button variant="outline" onClick={() => setForceEdit(false)} disabled={saving} className="gap-2">
                            <Lock className="w-4 h-4" />
                            {language === 'ar' ? 'إيقاف التعديل' : 'Stop editing'}
                          </Button>
                        )
                      ) : null}

                      <Button variant="outline" onClick={() => void duplicateTemplate()} disabled={saving} className="gap-2">
                        <Copy className="w-4 h-4" />
                        {language === 'ar' ? 'نسخ (v2)' : 'Duplicate (v2)'}
                      </Button>
                      <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                        {language === 'ar' ? 'معاينة' : 'Preview'}
                      </Button>

                      {!isDefaultTemplate(selected) ? (
                        <Button variant="destructive" onClick={() => void deleteTemplate()} disabled={saving} className="gap-2">
                          <Trash2 className="w-4 h-4" />
                          {language === 'ar' ? 'حذف/أرشفة' : 'Delete/Archive'}
                        </Button>
                      ) : null}

                      <Button onClick={() => void saveTemplate()} disabled={saving || !canEditFields} className="gap-2">
                        <Save className="w-4 h-4" />
                        {language === 'ar' ? 'حفظ' : 'Save'}
                      </Button>
                      <Button onClick={() => void publishTemplate()} disabled={saving || !canEditFields} className="gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {language === 'ar' ? 'نشر' : 'Publish'}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'اسم القالب' : 'Template name'}</Label>
                      <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} disabled={!canEditFields} />
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'عدد الخيارات' : 'Number of choices'}</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant={scaleDraft === 3 ? 'default' : 'outline'} onClick={() => setScaleAndEnsureLabels(3)} disabled={!canEditFields}>3</Button>
                        <Button type="button" variant={scaleDraft === 4 ? 'default' : 'outline'} onClick={() => setScaleAndEnsureLabels(4)} disabled={!canEditFields}>4</Button>
                        <Button type="button" variant={scaleDraft === 5 ? 'default' : 'outline'} onClick={() => setScaleAndEnsureLabels(5)} disabled={!canEditFields}>5</Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>{language === 'ar' ? 'مسميات الخيارات' : 'Choice labels'}</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from({ length: scaleDraft }).map((_, idx) => {
                        const key = String(idx + 1);
                        const v = labelsDraft[key] || { en: '', ar: '' };
                        return (
                          <div key={key} className="rounded-lg border border-border p-3">
                            <div className="text-sm font-medium mb-2">{language === 'ar' ? `الخيار ${key}` : `Option ${key}`}</div>
                            <div className="grid grid-cols-1 gap-2">
                              <Input
                                value={v.en}
                                disabled={!canEditFields}
                                onChange={(e) => setLabelsDraft(prev => ({ ...prev, [key]: { ...(prev[key] || { en: '', ar: '' }), en: e.target.value } }))}
                                placeholder={language === 'ar' ? 'English label' : 'English label'}
                              />
                              <Input
                                value={v.ar}
                                disabled={!canEditFields}
                                onChange={(e) => setLabelsDraft(prev => ({ ...prev, [key]: { ...(prev[key] || { en: '', ar: '' }), ar: e.target.value } }))}
                                placeholder={language === 'ar' ? 'التسمية بالعربية' : 'Arabic label'}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <Label className="text-base">{language === 'ar' ? 'الأسئلة' : 'Questions'}</Label>
                    <Button variant="outline" onClick={addQuestion} className="gap-2" disabled={!canEditFields}>
                      <Plus className="w-4 h-4" />
                      {language === 'ar' ? 'أضف سؤال' : 'Add question'}
                    </Button>
                  </div>

                  {questions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{language === 'ar' ? 'لا توجد أسئلة بعد' : 'No questions yet'}</div>
                  ) : (
                    <div className="space-y-3">
                      {questions
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((q, idx) => (
                          <div key={q.id} className="rounded-lg border border-border p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium">{language === 'ar' ? `سؤال ${idx + 1}` : `Question ${idx + 1}`}</div>
                              <div className="flex items-center gap-1">
                                <Button type="button" variant="ghost" size="icon" onClick={() => moveQuestion(idx, -1)} disabled={!canEditFields}>
                                  <ArrowUp className="w-4 h-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => moveQuestion(idx, 1)} disabled={!canEditFields}>
                                  <ArrowDown className="w-4 h-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeQuestion(q.id)} disabled={!canEditFields}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs">English</Label>
                                <Textarea value={q.text_en} disabled={!canEditFields} onChange={(e) => setQuestions(prev => prev.map(x => x.id === q.id ? ({ ...x, text_en: e.target.value } as any) : x))} />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs">العربية</Label>
                                <Textarea value={q.text_ar} disabled={!canEditFields} onChange={(e) => setQuestions(prev => prev.map(x => x.id === q.id ? ({ ...x, text_ar: e.target.value } as any) : x))} />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={q.required}
                                disabled={!canEditFields}
                                onChange={(e) => setQuestions(prev => prev.map(x => x.id === q.id ? ({ ...x, required: e.target.checked } as any) : x))}
                              />
                              <span className="text-sm">{language === 'ar' ? 'إجباري' : 'Required'}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs">{language === 'ar' ? 'نوع الإجابة' : 'Answer type'}</Label>
                                <select
                                  className="w-full border rounded-md bg-background px-3 py-2 text-sm"
                                  value={(q as any).question_type || 'scale'}
                                  disabled={!canEditFields}
                                  onChange={(e) => setQuestions(prev => prev.map(x => x.id === q.id ? ({ ...x, question_type: e.target.value as any, max_chars: e.target.value === 'text' ? 200 : null } as any) : x))}
                                >
                                  <option value="scale">{language === 'ar' ? 'اختيارات (1..N)' : 'Choices (1..N)'}</option>
                                  <option value="text">{language === 'ar' ? 'نص (حد أقصى 200 حرف)' : 'Text (max 200 chars)'}</option>
                                </select>
                              </div>

                              {(q as any).question_type === 'text' ? (
                                <div className="space-y-2">
                                  <Label className="text-xs">{language === 'ar' ? 'الحد الأقصى (حرف)' : 'Max chars'}</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={200}
                                    value={(q as any).max_chars || 200}
                                    disabled
                                  />
                                </div>
                              ) : (
                                <div />
                              )}
                            </div>

                          </div>
                        ))}
                    </div>
                  )}

                  <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{language === 'ar' ? 'معاينة القالب' : 'Template preview'}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="text-sm font-medium">{nameDraft || selected.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {language === 'ar' ? 'عدد الخيارات:' : 'Choices:'} {scaleDraft}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {Array.from({ length: scaleDraft }).map((_, i) => {
                            const k = String(i + 1);
                            const l = labelsDraft[k];
                            return (
                              <div key={k} className="rounded border border-border p-2 text-xs">
                                <div className="font-medium">{k}</div>
                                <div>{language === 'ar' ? l?.ar : l?.en}</div>
                              </div>
                            );
                          })}
                        </div>
                        <Separator />
                        <div className="space-y-3">
                          {questions
                            .slice()
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((q, idx) => (
                              <div key={q.id} className="rounded-lg border border-border p-3">
                                <div className="text-sm font-medium">
                                  {language === 'ar' ? `سؤال ${idx + 1}` : `Question ${idx + 1}`}
                                  {q.required ? <span className="text-danger ms-1">*</span> : null}
                                </div>
                                <div className="text-sm mt-1">{language === 'ar' ? q.text_ar : q.text_en}</div>
                                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                                  {Array.from({ length: scaleDraft }).map((_, sIdx) => {
                                    const k = String(sIdx + 1);
                                    const l = labelsDraft[k];
                                    return (
                                      <div key={k} className="rounded border border-border p-2 text-xs text-muted-foreground">
                                        <div className="font-medium">{k}</div>
                                        <div>{language === 'ar' ? l?.ar : l?.en}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EvaluationTemplatesPage;
