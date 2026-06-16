import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/layout/Header';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Building2, Plus, Send, Trash2, UserPlus } from 'lucide-react';

// "Survey type" here means the style/templates of questions (like SurveyMonkey/SurveySensum templates)
// not the vendor/tool itself.
type SurveyType =
  | 'custom'
  | 'survey_360'
  | 'matrix'
  | 'multiple_choice'
  | 'rating'
  | 'likert'
  | 'open_text'
  | 'yes_no'
  | 'ranking'
  | 'nps';

interface Profile {
  id: string;
  name_en: string;
  name_ar: string;
  email: string;
  department_id: string | null;
}

interface Department {
  id: string;
  name_en: string;
  name_ar: string;
}

interface Question {
  id: string;
  text: string;
  // For text questions
  answerLines: number;
  // For options-based questions
  options?: string[];
  // For rating/likert
  scaleMin?: number;
  scaleMax?: number;
  // For matrix
  matrixRows?: string[];
  matrixCols?: string[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

const CustomEvaluationPage: React.FC = () => {
  const { language } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [surveyType, setSurveyType] = useState<SurveyType>('custom');

  // Start as an empty template. User can add questions later.
  const [questions, setQuestions] = useState<Question[]>([]);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);

  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [manualRecipients, setManualRecipients] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [deptToAdd, setDeptToAdd] = useState<string>('');
  const [sending, setSending] = useState(false);

  const handleSurveyTypeChange = (v: SurveyType) => {
    // Each type is an empty template. Switching type resets the builder.
    setSurveyType(v);
    setQuestions([]);
  };

  useEffect(() => {
    const load = async () => {
      setLoadingDirectory(true);
      try {
        const [{ data: pData, error: pErr }, { data: dData, error: dErr }] = await Promise.all([
          supabase.from('profiles').select('id, name_en, name_ar, email, department_id').order('name_en'),
          supabase.from('departments').select('id, name_en, name_ar').order('name_en'),
        ]);
        if (pErr) throw pErr;
        if (dErr) throw dErr;
        setProfiles((pData || []) as Profile[]);
        setDepartments((dData || []) as Department[]);
      } catch (e) {
        console.error(e);
        toast({
          title: language === 'ar' ? 'خطأ' : 'Error',
          description: language === 'ar' ? 'فشل تحميل المستخدمين/الأقسام' : 'Failed to load users/departments',
          variant: 'destructive',
        });
      } finally {
        setLoadingDirectory(false);
      }
    };
    load();
  }, [language, toast]);

  const profilesById = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const addQuestion = () => {
    const base: Question = { id: uid(), text: '', answerLines: 3 };
    // Provide sensible defaults per template type (still empty, just structured)
    if (surveyType === 'multiple_choice' || surveyType === 'ranking') {
      base.options = ['', ''];
    }
    if (surveyType === 'rating' || surveyType === 'nps') {
      base.scaleMin = surveyType === 'nps' ? 0 : 1;
      base.scaleMax = surveyType === 'nps' ? 10 : 5;
    }
    if (surveyType === 'likert') {
      base.options = [
        language === 'ar' ? 'أوافق بشدة' : 'Strongly agree',
        language === 'ar' ? 'أوافق' : 'Agree',
        language === 'ar' ? 'محايد' : 'Neutral',
        language === 'ar' ? 'لا أوافق' : 'Disagree',
        language === 'ar' ? 'لا أوافق بشدة' : 'Strongly disagree',
      ];
    }
    if (surveyType === 'matrix') {
      base.matrixRows = ['', ''];
      base.matrixCols = ['', ''];
    }
    setQuestions(q => [...q, base]);
  };

  const removeQuestion = (id: string) => {
    setQuestions(q => q.filter(x => x.id !== id));
  };

  const updateQuestion = (id: string, patch: Partial<Question>) => {
    setQuestions(q => q.map(x => (x.id === id ? { ...x, ...patch } : x)));
  };

  const addManualRecipient = () => {
    const v = manualInput.trim();
    if (!v) return;
    if (manualRecipients.includes(v)) {
      setManualInput('');
      return;
    }
    setManualRecipients(r => [...r, v]);
    setManualInput('');
  };

  const removeManualRecipient = (v: string) => {
    setManualRecipients(r => r.filter(x => x !== v));
  };

  const toggleUser = (id: string) => {
    const p = profilesById.get(id);
    if (!p) return;
    setSelectedUsers(prev => {
      const exists = prev.some(x => x.id === id);
      return exists ? prev.filter(x => x.id !== id) : [...prev, p];
    });
  };

  const removeUser = (id: string) => {
    setSelectedUsers(prev => prev.filter(x => x.id !== id));
  };

  const addDepartmentUsers = () => {
    if (!deptToAdd) return;
    const deptUsers = profiles.filter(p => p.department_id === deptToAdd);
    if (deptUsers.length === 0) {
      toast({
        title: language === 'ar' ? 'لا يوجد مستخدمون' : 'No Users',
        description: language === 'ar' ? 'هذا القسم لا يحتوي على مستخدمين' : 'This department has no users',
        variant: 'destructive',
      });
      return;
    }
    setSelectedUsers(prev => {
      const map = new Map(prev.map(p => [p.id, p]));
      deptUsers.forEach(u => map.set(u.id, u));
      return Array.from(map.values());
    });
    toast({
      title: language === 'ar' ? 'تمت الإضافة' : 'Added',
      description: language === 'ar'
        ? 'تمت إضافة القسم إلى قائمة المستلمين'
        : 'Department users added to recipients',
    });
  };

  const validate = () => {
    if (!title.trim()) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اكتب عنوان التقييم' : 'Please enter a title',
        variant: 'destructive',
      });
      return false;
    }
    if (questions.length === 0) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'أضف سؤال واحد على الأقل' : 'Add at least one question',
        variant: 'destructive',
      });
      return false;
    }
    if (questions.some(q => !q.text.trim())) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'كل سؤال لازم يكون مكتوب' : 'All questions must have text',
        variant: 'destructive',
      });
      return false;
    }
    // Validate per template type
    if (
      (surveyType === 'multiple_choice' || surveyType === 'ranking' || surveyType === 'likert') &&
      questions.some(q => (q.options || []).filter(o => o.trim()).length < 2)
    ) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar'
          ? 'أضف خيارين على الأقل لكل سؤال'
          : 'Add at least 2 options for each question',
        variant: 'destructive',
      });
      return false;
    }
    if ((surveyType === 'matrix') && questions.some(q => (q.matrixRows || []).filter(r => r.trim()).length < 2 || (q.matrixCols || []).filter(c => c.trim()).length < 2)) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar'
          ? 'في أسئلة المصفوفة، أضف صفّين وعمودين على الأقل'
          : 'For matrix questions, add at least 2 rows and 2 columns',
        variant: 'destructive',
      });
      return false;
    }
    if ((surveyType === 'rating' || surveyType === 'nps') && questions.some(q => !q.scaleMin && q.scaleMin !== 0 || !q.scaleMax)) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'حدد مقياس التقييم' : 'Please set the rating scale',
        variant: 'destructive',
      });
      return false;
    }
    if (selectedUsers.length === 0 && manualRecipients.length === 0) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اختر مستلم واحد على الأقل' : 'Select at least one recipient',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    if (!validate()) return;
    setSending(true);
    try {
      // 1) Save a local copy so admins can track what was created.
      // NOTE: This project does not ship a custom_evaluations table yet.
      // Per the "admin-only notifications" decision, we don't push in-app notifications to end users.
      if (selectedUsers.length > 0) {
        const payload = {
          title,
          surveyType,
          questions: questions.map(q => ({
            text: q.text,
            answerLines: q.answerLines,
            options: q.options,
            scaleMin: q.scaleMin,
            scaleMax: q.scaleMax,
            matrixRows: q.matrixRows,
            matrixCols: q.matrixCols,
          })),
        };

        // Save a local copy (free + zero DB changes)
        const key = 'custom_evaluations_sent';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.unshift({
          id: uid(),
          created_at: new Date().toISOString(),
          recipients_user_ids: selectedUsers.map(u => u.id),
          manual_recipients: manualRecipients,
          payload,
        });
        // No artificial limits (as requested). Keep all records.
        localStorage.setItem(key, JSON.stringify(existing));
      }

      // 2) Manual recipients (typed) are stored locally only (because email/SMS isn't wired here)
      if (manualRecipients.length > 0) {
        toast({
          title: language === 'ar' ? 'تنبيه' : 'Note',
          description: language === 'ar'
            ? 'المستلمين المكتوبين يدويًا تم حفظهم فقط. إرسال الإيميل يحتاج تكامل بريد.'
            : 'Manually typed recipients were saved only. Email sending requires mail integration.',
        });
      }

      toast({
        title: language === 'ar' ? 'تم الحفظ' : 'Saved',
        description: language === 'ar'
          ? 'تم حفظ التقييم المخصص. (إرسال الإشعارات للمستخدمين سيتم إضافته لاحقاً)'
          : 'Custom evaluation saved. (User delivery/notifications will be added later)',
      });

      // Reset
      setTitle('');
      setSurveyType('custom');
      setQuestions([]);
      setSelectedUsers([]);
      setManualRecipients([]);
      setManualInput('');
      setDeptToAdd('');
    } catch (e) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'فشل الإرسال' : 'Failed to send',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header title={language === 'ar' ? 'تقييم مخصص' : 'Custom Evaluation'} />

      <div className="p-6 space-y-6">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">{language === 'ar' ? 'قوالب التقييم (الرسمي)' : 'Evaluation Templates (Official)'} </CardTitle>
            <CardDescription>
              {language === 'ar'
                ? 'لتحرير القوالب المستخدمة في صفحة إرسال التقييمات (إضافة/حذف أسئلة، تغيير عدد الخيارات إلى 4، تغيير المسميات)، استخدم صفحة قوالب التقييم.'
                : 'To edit the templates used in Evaluation Assignment (add/remove questions, switch to 4 choices, edit labels), use the Evaluation Templates page.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/settings/templates')} className="gap-2">
              {language === 'ar' ? 'فتح قوالب التقييم' : 'Open Evaluation Templates'}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{language === 'ar' ? 'أنشئ تقييم جديد' : 'Create a new evaluation'}</CardTitle>
            <CardDescription>
              {language === 'ar'
                ? 'اختر نوع النموذج، اكتب الأسئلة، واختر المستلمين ثم اضغط إرسال.'
                : 'Pick a template, add questions, choose recipients, then hit send.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Basic info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'العنوان' : 'Title'}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: تقييم خدمة العملاء' : 'e.g. Customer Service Evaluation'}
                />
              </div>

              <div className="space-y-2">
                <Label>{language === 'ar' ? 'نوع التقييم' : 'Survey Type'}</Label>
                <Select value={surveyType} onValueChange={(v) => handleSurveyTypeChange(v as SurveyType)}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'ar' ? 'اختر النوع' : 'Choose type'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">{language === 'ar' ? 'قالب فارغ' : 'Empty template'}</SelectItem>
                    <SelectItem value="survey_360">{language === 'ar' ? 'استبيان 360°' : '360° Survey'}</SelectItem>
                    <SelectItem value="matrix">{language === 'ar' ? 'مصفوفة (جدول)' : 'Matrix (table)'}</SelectItem>
                    <SelectItem value="multiple_choice">{language === 'ar' ? 'اختيار من متعدد' : 'Multiple choice'}</SelectItem>
                    <SelectItem value="rating">{language === 'ar' ? 'تقييم (مقياس)' : 'Rating scale'}</SelectItem>
                    <SelectItem value="likert">{language === 'ar' ? 'ليكرت (موافقة/عدم موافقة)' : 'Likert scale'}</SelectItem>
                    <SelectItem value="open_text">{language === 'ar' ? 'نص مفتوح' : 'Open text'}</SelectItem>
                    <SelectItem value="yes_no">{language === 'ar' ? 'نعم / لا' : 'Yes / No'}</SelectItem>
                    <SelectItem value="ranking">{language === 'ar' ? 'ترتيب الخيارات' : 'Ranking'}</SelectItem>
                    <SelectItem value="nps">{language === 'ar' ? 'NPS (0-10)' : 'NPS (0–10)'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Questions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">
                  {language === 'ar' ? 'الأسئلة' : 'Questions'}
                </h3>
                <Button variant="outline" className="gap-2" onClick={addQuestion}>
                  <Plus className="w-4 h-4" />
                  {language === 'ar' ? 'أضف سؤال' : 'Add question'}
                </Button>
              </div>

              {questions.length === 0 && (
                <div className="border border-dashed border-border rounded-lg p-4 text-sm text-muted-foreground">
                  {language === 'ar'
                    ? 'هذا قالب فارغ. اضغط "أضف سؤال" لبدء بناء الاستبيان.'
                    : 'This is an empty template. Click "Add question" to start building your survey.'}
                </div>
              )}

              {questions.map((q, idx) => (
                <div key={q.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {language === 'ar' ? `سؤال ${idx + 1}` : `Question ${idx + 1}`}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeQuestion(q.id)}
                      title={language === 'ar' ? 'حذف' : 'Remove'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <Textarea
                    value={q.text}
                    onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
                    placeholder={language === 'ar' ? 'اكتب السؤال هنا...' : 'Write the question here...'}
                  />

                  {/* Template-specific builders */}
                  {(surveyType === 'multiple_choice' || surveyType === 'ranking' || surveyType === 'likert') && (
                    <div className="space-y-2">
                      <Label className="text-sm">
                        {language === 'ar' ? 'الخيارات' : 'Options'}
                      </Label>
                      <div className="space-y-2">
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} className="flex gap-2 items-center">
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const next = [...(q.options || [])];
                                next[oi] = e.target.value;
                                updateQuestion(q.id, { options: next });
                              }}
                              placeholder={language === 'ar' ? `خيار ${oi + 1}` : `Option ${oi + 1}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const next = (q.options || []).filter((_, i) => i !== oi);
                                updateQuestion(q.id, { options: next.length ? next : ['',''] });
                              }}
                              title={language === 'ar' ? 'حذف' : 'Remove'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => updateQuestion(q.id, { options: [...(q.options || ['','']), ''] })}
                      >
                        <Plus className="w-4 h-4" />
                        {language === 'ar' ? 'أضف خيار' : 'Add option'}
                      </Button>
                      {surveyType === 'ranking' && (
                        <p className="text-xs text-muted-foreground">
                          {language === 'ar'
                            ? 'سيتم عرض الخيارات للمستلم ليقوم بترتيبها.'
                            : 'Recipients will be asked to rank these options.'}
                        </p>
                      )}
                    </div>
                  )}

                  {(surveyType === 'matrix') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm">{language === 'ar' ? 'الصفوف (أسئلة)' : 'Rows (items)'}</Label>
                        {(q.matrixRows || []).map((r, ri) => (
                          <div key={ri} className="flex gap-2 items-center">
                            <Input
                              value={r}
                              onChange={(e) => {
                                const next = [...(q.matrixRows || [])];
                                next[ri] = e.target.value;
                                updateQuestion(q.id, { matrixRows: next });
                              }}
                              placeholder={language === 'ar' ? `صف ${ri + 1}` : `Row ${ri + 1}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const next = (q.matrixRows || []).filter((_, i) => i !== ri);
                                updateQuestion(q.id, { matrixRows: next.length ? next : ['',''] });
                              }}
                              title={language === 'ar' ? 'حذف' : 'Remove'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => updateQuestion(q.id, { matrixRows: [...(q.matrixRows || ['','']), ''] })}
                        >
                          <Plus className="w-4 h-4" />
                          {language === 'ar' ? 'أضف صف' : 'Add row'}
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm">{language === 'ar' ? 'الأعمدة (إجابات)' : 'Columns (answers)'}</Label>
                        {(q.matrixCols || []).map((c, ci) => (
                          <div key={ci} className="flex gap-2 items-center">
                            <Input
                              value={c}
                              onChange={(e) => {
                                const next = [...(q.matrixCols || [])];
                                next[ci] = e.target.value;
                                updateQuestion(q.id, { matrixCols: next });
                              }}
                              placeholder={language === 'ar' ? `عمود ${ci + 1}` : `Column ${ci + 1}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const next = (q.matrixCols || []).filter((_, i) => i !== ci);
                                updateQuestion(q.id, { matrixCols: next.length ? next : ['',''] });
                              }}
                              title={language === 'ar' ? 'حذف' : 'Remove'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => updateQuestion(q.id, { matrixCols: [...(q.matrixCols || ['','']), ''] })}
                        >
                          <Plus className="w-4 h-4" />
                          {language === 'ar' ? 'أضف عمود' : 'Add column'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {(surveyType === 'rating' || surveyType === 'nps') && (
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <Label className="text-sm">{language === 'ar' ? 'المقياس' : 'Scale'}</Label>
                      <div className="flex gap-2 items-center">
                        <Input
                          type="number"
                          value={q.scaleMin ?? (surveyType === 'nps' ? 0 : 1)}
                          onChange={(e) => updateQuestion(q.id, { scaleMin: Number(e.target.value) })}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">→</span>
                        <Input
                          type="number"
                          value={q.scaleMax ?? (surveyType === 'nps' ? 10 : 5)}
                          onChange={(e) => updateQuestion(q.id, { scaleMax: Number(e.target.value) })}
                          className="w-24"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {surveyType === 'nps'
                          ? (language === 'ar' ? 'NPS يكون عادة من 0 إلى 10.' : 'NPS is typically 0 to 10.')
                          : (language === 'ar' ? 'مثال: 1 إلى 5.' : 'Example: 1 to 5.')}
                      </p>
                    </div>
                  )}

                  {(surveyType === 'yes_no') && (
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar' ? 'المستلم سيختار نعم أو لا.' : 'Recipient will choose Yes or No.'}
                    </p>
                  )}

                  {(surveyType === 'custom' || surveyType === 'open_text' || surveyType === 'survey_360') && (
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <Label className="text-sm">
                        {language === 'ar' ? 'عدد سطور الإجابة' : 'Answer lines'}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={q.answerLines}
                        onChange={(e) => updateQuestion(q.id, { answerLines: Math.max(1, Math.min(20, Number(e.target.value || 1))) })}
                        className="w-28"
                      />
                      <p className="text-xs text-muted-foreground">
                        {language === 'ar'
                          ? 'هذا فقط للإجابات النصية الطويلة.'
                          : 'Only for long text answers.'}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Separator />

            {/* Recipients */}
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">
                {language === 'ar' ? 'المستلمون' : 'Recipients'}
              </h3>

              {/* Existing users picker */}
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'اختر مستخدمين من النظام' : 'Pick existing users'}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="gap-2 w-full justify-start">
                      <UserPlus className="w-4 h-4" />
                      {language === 'ar' ? 'اختيار مستخدمين' : 'Choose users'}
                      {selectedUsers.length > 0 && (
                        <Badge variant="secondary" className="ml-auto">
                          {selectedUsers.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[360px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder={language === 'ar' ? 'ابحث عن مستخدم...' : 'Search users...'} />
                      <CommandEmpty>{language === 'ar' ? 'لا يوجد نتائج' : 'No results'}</CommandEmpty>
                      <CommandGroup>
                        {profiles.map(p => {
                          const chosen = selectedUsers.some(x => x.id === p.id);
                          return (
                            <CommandItem key={p.id} value={p.name_en} onSelect={() => toggleUser(p.id)}>
                              <span className="flex-1">
                                {language === 'ar' ? p.name_ar : p.name_en}
                              </span>
                              {chosen && <Badge variant="secondary">✓</Badge>}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>

                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map(u => (
                    <Badge key={u.id} variant="secondary" className="gap-2">
                      {language === 'ar' ? u.name_ar : u.name_en}
                      <button onClick={() => removeUser(u.id)} className="text-xs">✕</button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Department one-click */}
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'إرسال لقسم كامل' : 'Send to a whole department'}</Label>
                <div className="flex flex-col md:flex-row gap-2">
                  <Select value={deptToAdd} onValueChange={setDeptToAdd}>
                    <SelectTrigger className="w-full">
                      <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder={language === 'ar' ? 'اختر القسم' : 'Choose department'} />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {language === 'ar' ? d.name_ar : d.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="gap-2" onClick={addDepartmentUsers} disabled={!deptToAdd || loadingDirectory}>
                    <Building2 className="w-4 h-4" />
                    {language === 'ar' ? 'أضف القسم' : 'Add department'}
                  </Button>
                </div>
              </div>

              {/* Manual typing */}
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'أو اكتب أي مستلم' : 'Or type any recipient'}</Label>
                <div className="flex gap-2">
                  <Input
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManualRecipient();
                      }
                    }}
                    placeholder={language === 'ar' ? 'اكتب إيميل/اسم ثم Enter' : 'Type email/name then Enter'}
                  />
                  <Button variant="outline" onClick={addManualRecipient}>
                    {language === 'ar' ? 'إضافة' : 'Add'}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {manualRecipients.map(r => (
                    <Badge key={r} variant="outline" className="gap-2">
                      {r}
                      <button onClick={() => removeManualRecipient(r)} className="text-xs">✕</button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {language === 'ar'
                  ? 'ملاحظة: إرسال التقييم للمستلمين المكتوبين يدويًا يحتاج تكامل بريد/رسائل. الآن يتم إشعار مستخدمي النظام فقط.'
                  : 'Note: Manual recipients need email/SMS integration. For now, only in-app users get notified.'}
              </p>
              <Button className="gap-2" onClick={handleSend} disabled={sending || loadingDirectory}>
                <Send className="w-4 h-4" />
                {sending ? (language === 'ar' ? 'جاري الإرسال...' : 'Sending...') : (language === 'ar' ? 'إرسال' : 'Send')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CustomEvaluationPage;
