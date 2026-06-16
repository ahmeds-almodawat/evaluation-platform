import React, { useEffect, useMemo, useState } from 'react';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { CalendarClock, BellRing, Lock, Unlock } from 'lucide-react';

type CycleRow = {
  id: string;
  period: string; // YYYY-MM
  status: 'draft' | 'open' | 'closed';
  send_at: string | null;
  due_at: string | null;
  created_at: string;
};

type CycleStats = {
  period: string;
  total_assigned: number;
  total_completed: number;
  total_pending: number;
};

const EvaluationCyclesPage: React.FC = () => {
  const { language } = useLanguage();
  const { hasPermission, role } = useSupabaseAuth();
  const canManageCycles = hasPermission('cycles.manage') || role === 'admin' || role === 'super_user';
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [cycles, setCycles] = useState<CycleRow[]>([]);
  const [statsByPeriod, setStatsByPeriod] = useState<Record<string, CycleStats>>({});

  // Create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CycleRow | null>(null);
  const [period, setPeriod] = useState('');
  const [sendAt, setSendAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);

  const title = language === 'ar' ? 'دورات التقييم' : 'Evaluation Cycles';
  const subtitle = language === 'ar'
    ? 'إنشاء دورة شهرية + متابعة الإكمال + إرسال تذكير لغير المستجيبين'
    : 'Create monthly cycles, track completion, and remind non-responders';

  if (!canManageCycles) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={title} />
        <div className="p-6">
          <div className="flex items-center gap-2 text-muted-foreground bg-secondary/50 px-4 py-3 rounded-lg">
            <Lock className="w-4 h-4" />
            <span className="text-sm">{language === 'ar' ? 'لا تملك صلاحية إدارة دورات التقييم' : 'You do not have permission to manage evaluation cycles'}</span>
          </div>
        </div>
      </div>
    );
  }


  const loadCycles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('evaluation_cycles')
        .select('id,period,status,send_at,due_at,created_at')
        .order('period', { ascending: false })
        .limit(24);
      if (error) throw error;
      const rows = (data as any[]) || [];
      setCycles(rows as any);

      // Load stats best-effort
      const periods = rows.map(r => r.period).filter(Boolean).slice(0, 12);
      if (periods.length) {
        const results = await Promise.all(
          periods.map(async (p) => {
            const { data: s, error: se } = await supabase.rpc('rpc_cycle_stats', { p_period: p });
            if (se) return null;
            const row = (Array.isArray(s) ? s[0] : s) as any;
            if (!row) return null;
            return {
              period: p,
              total_assigned: Number(row.total_assigned || 0),
              total_completed: Number(row.total_completed || 0),
              total_pending: Number(row.total_pending || 0),
            } as CycleStats;
          })
        );
        const map: Record<string, CycleStats> = {};
        results.filter(Boolean).forEach((r: any) => (map[r.period] = r));
        setStatsByPeriod(map);
      }
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل تحميل الدورات' : 'Failed to load cycles'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCycles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    setPeriod(`${yyyy}-${mm}`);
    setSendAt('');
    setDueAt('');
    setDialogOpen(true);
  };

  const openEdit = (row: CycleRow) => {
    setEditing(row);
    setPeriod(row.period);
    setSendAt(row.send_at ? row.send_at.slice(0, 10) : '');
    setDueAt(row.due_at ? row.due_at.slice(0, 10) : '');
    setDialogOpen(true);
  };

  const saveCycle = async () => {
    const p = (period || '').trim();
    if (!/^\d{4}-\d{2}$/.test(p)) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: language === 'ar' ? 'اكتب الفترة بصيغة YYYY-MM' : 'Period must be YYYY-MM',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        p_period: p,
        p_send_at: sendAt ? new Date(sendAt).toISOString() : null,
        p_due_at: dueAt ? new Date(dueAt).toISOString() : null,
      };
      const { error } = await supabase.rpc('rpc_cycle_upsert', payload);
      if (error) throw error;
      toast({
        title: language === 'ar' ? 'تم الحفظ' : 'Saved',
        description: language === 'ar' ? 'تم حفظ الدورة' : 'Cycle saved',
      });
      setDialogOpen(false);
      await loadCycles();
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

  const setStatus = async (row: CycleRow, status: 'open' | 'closed') => {
    try {
      const { error } = await supabase.rpc('rpc_cycle_set_status', { p_period: row.period, p_status: status });
      if (error) throw error;
      toast({
        title: language === 'ar' ? 'تم التحديث' : 'Updated',
        description: language === 'ar' ? 'تم تحديث حالة الدورة' : 'Cycle status updated',
      });
      await loadCycles();
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل التحديث' : 'Update failed'),
        variant: 'destructive',
      });
    }
  };

  const sendReminders = async (row: CycleRow) => {
    try {
      const { data, error } = await supabase.rpc('rpc_cycle_send_reminders', { p_period: row.period });
      if (error) throw error;
      toast({
        title: language === 'ar' ? 'تم الإرسال' : 'Sent',
        description:
          language === 'ar'
            ? `تم إرسال التذكير (${Number((data as any)?.sent_to || 0)} مستخدم)`
            : `Reminders sent (${Number((data as any)?.sent_to || 0)} users)`,
      });
    } catch (e: any) {
      console.error(e);
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل إرسال التذكير' : 'Reminder failed'),
        variant: 'destructive',
      });
    }
  };

  const statusBadge = (s: CycleRow['status']) => {
    const v = s || 'draft';
    const label = language === 'ar'
      ? v === 'open' ? 'مفتوحة' : v === 'closed' ? 'مغلقة' : 'مسودة'
      : v === 'open' ? 'Open' : v === 'closed' ? 'Closed' : 'Draft';
    return <Badge variant={v === 'closed' ? 'secondary' : v === 'open' ? 'default' : 'outline'}>{label}</Badge>;
  };

  const rows = useMemo(() => cycles, [cycles]);

  return (
    <div className="min-h-screen bg-background">
      <Header title={title} subtitle={subtitle} />

      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {language === 'ar'
              ? 'ملاحظة: إرسال التقييمات يتم من صفحة إدارة التقييمات. هذه الصفحة لإدارة الدورة والتذكير.'
              : 'Note: creating assignments still happens in Manage Evaluations. This page adds cycle tracking + reminders.'}
          </div>
          <Button onClick={openCreate} className="gap-2">
            <CalendarClock className="h-4 w-4" />
            {language === 'ar' ? 'دورة جديدة' : 'New cycle'}
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{language === 'ar' ? 'الدورات' : 'Cycles'}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">{language === 'ar' ? 'لا توجد دورات بعد' : 'No cycles yet'}</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'الفترة' : 'Period'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الإرسال' : 'Send'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الاستحقاق' : 'Due'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الإكمال' : 'Completion'}</TableHead>
                      <TableHead className="text-right">{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const s = statsByPeriod[r.period];
                      const pct = s && s.total_assigned > 0 ? Math.round((s.total_completed / s.total_assigned) * 100) : null;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.period}</TableCell>
                          <TableCell>{statusBadge(r.status)}</TableCell>
                          <TableCell>{r.send_at ? new Date(r.send_at).toLocaleDateString() : '—'}</TableCell>
                          <TableCell>{r.due_at ? new Date(r.due_at).toLocaleDateString() : '—'}</TableCell>
                          <TableCell>
                            {s ? (
                              <div className="text-sm">
                                <div className="font-medium">{pct !== null ? `${pct}%` : '—'}</div>
                                <div className="text-xs text-muted-foreground">
                                  {language === 'ar'
                                    ? `${s.total_completed}/${s.total_assigned} مكتمل • ${s.total_pending} متبقي`
                                    : `${s.total_completed}/${s.total_assigned} completed • ${s.total_pending} pending`}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                                {language === 'ar' ? 'تعديل' : 'Edit'}
                              </Button>

                              {r.status !== 'closed' ? (
                                <Button variant="outline" size="sm" className="gap-2" onClick={() => sendReminders(r)}>
                                  <BellRing className="h-4 w-4" />
                                  {language === 'ar' ? 'تذكير' : 'Remind'}
                                </Button>
                              ) : null}

                              {r.status === 'closed' ? (
                                <Button variant="outline" size="sm" className="gap-2" onClick={() => setStatus(r, 'open')}>
                                  <Unlock className="h-4 w-4" />
                                  {language === 'ar' ? 'إعادة فتح' : 'Re-open'}
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" className="gap-2" onClick={() => setStatus(r, 'closed')}>
                                  <Lock className="h-4 w-4" />
                                  {language === 'ar' ? 'إغلاق' : 'Close'}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <Separator className="my-4" />
            <div className="text-xs text-muted-foreground">
              {language === 'ar'
                ? 'التذكير يرسل رسالة داخل النظام لكل مُقيِّم لديه تقييمات معلقة للفترة.'
                : 'Remind sends an in-app message to each evaluator with pending evaluations for that period.'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? (editing ? 'تعديل الدورة' : 'إنشاء دورة') : (editing ? 'Edit cycle' : 'Create cycle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الفترة (YYYY-MM)' : 'Period (YYYY-MM)'}</Label>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-01" />
            </div>

            <div className="space-y-2">
              <Label>{language === 'ar' ? 'تاريخ الإرسال (اختياري)' : 'Send date (optional)'}</Label>
              <Input type="date" value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{language === 'ar' ? 'تاريخ الاستحقاق (اختياري)' : 'Due date (optional)'}</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={saveCycle} disabled={saving}>
              {saving ? (language === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EvaluationCyclesPage;
