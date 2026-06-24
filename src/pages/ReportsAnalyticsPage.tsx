import React, { useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import KPICard from "@/components/ui/KPICard";
import TrendLineChart from "@/components/charts/TrendLineChart";
import DepartmentMonthHeatmap, { DeptMonthHeatmapRow } from "@/components/charts/DepartmentMonthHeatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, TrendingUp, Building2 } from "lucide-react";
import CrossDeptMatrixHeatmap, { CrossMatrixCell } from "@/components/charts/CrossDeptMatrixHeatmap";
import { exportToCsv } from "@/utils/exportCsv";

type TrendRow = {
  month_key: string;
  same_avg: number | null;
  cross_avg: number | null;
  same_n: number;
  cross_n: number;
};

type DeptMonthRow = {
  department_id: string;
  month_key: string;
  avg_score: number | null;
  n: number;
};

type DeptRow = { id: string; name_en: string; name_ar: string };

function toYM(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthOptions(count = 24) {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(toYM(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function ymToRange(ym: string) {
  const [y, m] = ym.split("-").map((x) => Number(x));
  const start = new Date(y, (m || 1) - 1, 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

const ReportsAnalyticsPage: React.FC = () => {
  const { t, language } = useLanguage();
  const { user, hasPermission } = useSupabaseAuth();
  const { toast } = useToast();
  const [months, setMonths] = useState<number>(12);
  const [timeMode, setTimeMode] = useState<"month" | "period">("period");
  const [selectedMonth, setSelectedMonth] = useState<string>(toYM(new Date()));
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [group, setGroup] = useState<"same" | "cross">("same");

  const [loading, setLoading] = useState(true);
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [deptMonthRows, setDeptMonthRows] = useState<DeptMonthRow[]>([]);
  const [departments, setDepartments] = useState<Record<string, DeptRow>>({});

  // Cross-dept matrix (dept → dept for a selected month)
  const [matrixMonth, setMatrixMonth] = useState<string>(""); // YYYY-MM
  const [matrixMinN, setMatrixMinN] = useState<number>(3);
  const [matrixCells, setMatrixCells] = useState<CrossMatrixCell[]>([]);

  // Saved views (server)
  const [savedFilters, setSavedFilters] = useState<Array<{ id: string; name: string; filters: any }>>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string>("");

  // Outliers & anomalies
  const [outliersLoading, setOutliersLoading] = useState(false);
  const [outliers, setOutliers] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, any>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const activeMonths =
          timeMode === "month" ? [selectedMonth].filter(Boolean) : selectedMonths.filter(Boolean);

        const effectiveMonthsForRpc = (() => {
          if (activeMonths.length === 0) return months;
          // inclusive diff between min and max month selection
          const sorted = [...activeMonths].sort();
          const { start: minStart } = ymToRange(sorted[sorted.length - 1]); // careful: sort asc -> last is oldest? Actually YYYY-MM sorts lexicographically.
          // Using string sort: '2026-02' > '2025-12' true, so ascending gives oldest first.
          const oldest = sorted[0];
          const newest = sorted[sorted.length - 1];
          const { start: a } = ymToRange(oldest);
          const { start: b } = ymToRange(newest);
          const diff = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
          return Math.max(diff + 1, 1);
        })();

        // departments for labels
        const { data: depts, error: deptErr } = await supabase
          .from("departments")
          .select("id,name_en,name_ar");
        if (deptErr) throw deptErr;

        const deptMap: Record<string, DeptRow> = {};
        (depts || []).forEach((d: any) => (deptMap[d.id] = d));
        setDepartments(deptMap);

        // trend
        const { data: tr, error: trErr } = await supabase.rpc("rpc_reports_overall_trends", {
          p_months: effectiveMonthsForRpc,
        });
        if (trErr) throw trErr;
        const rawTrend = ((tr as any) || []) as TrendRow[];
        setTrendRows(activeMonths.length ? rawTrend.filter((r) => activeMonths.includes(r.month_key)) : rawTrend);

        // heatmap (dept-month)
        const { data: hm, error: hmErr } = await supabase.rpc("rpc_reports_dept_month_avg", {
          p_months: Math.min(effectiveMonthsForRpc, 12),
          p_group: group,
        });
        if (hmErr) throw hmErr;
        const rawHM = ((hm as any) || []) as DeptMonthRow[];
        setDeptMonthRows(activeMonths.length ? rawHM.filter((r) => activeMonths.includes(r.month_key)) : rawHM);
      } catch (e) {
        console.error("ReportsAnalytics load error:", e);
        setTrendRows([]);
        setDeptMonthRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [months, group, timeMode, selectedMonth, selectedMonths]);

  // Load saved views
  useEffect(() => {
    const loadSaved = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('saved_filters')
          .select('id,name,filters')
          .eq('scope', 'reports.analytics')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setSavedFilters((data as any) || []);
      } catch (e) {
        // Best-effort: do not block page
        console.warn('Saved filters load failed', e);
        setSavedFilters([]);
      }
    };
    void loadSaved();
  }, [user?.id]);

  const applySavedView = (id: string) => {
    setSelectedSavedId(id);
    const f = savedFilters.find((x) => x.id === id);
    if (!f) return;
    const v = f.filters || {};
    if (typeof v.months === 'number') setMonths(v.months);
    if (v.timeMode === 'month' || v.timeMode === 'period') setTimeMode(v.timeMode);
    if (typeof v.selectedMonth === 'string') setSelectedMonth(v.selectedMonth);
    if (Array.isArray(v.selectedMonths)) setSelectedMonths(v.selectedMonths.filter(Boolean));
    if (v.group === 'same' || v.group === 'cross') setGroup(v.group);
    if (typeof v.matrixMonth === 'string') setMatrixMonth(v.matrixMonth);
    if (typeof v.matrixMinN === 'number') setMatrixMinN(v.matrixMinN);
  };

  const saveCurrentView = async () => {
    if (!user) return;
    const name = window.prompt(language === 'ar' ? 'اسم العرض المحفوظ' : 'Saved view name');
    if (!name || !name.trim()) return;
    try {
      const { error } = await supabase
        .from('saved_filters')
        .insert({
          scope: 'reports.analytics',
          name: name.trim(),
          owner_user_id: user.id,
          is_shared: false,
          filters: { months, timeMode, selectedMonth, selectedMonths, group, matrixMonth, matrixMinN },
        } as any);
      if (error) throw error;
      toast({ title: language === 'ar' ? 'تم الحفظ' : 'Saved', description: language === 'ar' ? 'تم حفظ العرض.' : 'View saved.' });
      const { data } = await supabase
        .from('saved_filters')
        .select('id,name,filters')
        .eq('scope', 'reports.analytics')
        .order('created_at', { ascending: false });
      setSavedFilters((data as any) || []);
    } catch (e: any) {
      toast({
        title: language === 'ar' ? 'خطأ' : 'Error',
        description: e?.message || (language === 'ar' ? 'فشل الحفظ' : 'Save failed'),
        variant: 'destructive',
      });
    }
  };

  const deleteSavedView = async () => {
    if (!selectedSavedId) return;
    if (!confirm(language === 'ar' ? 'حذف العرض المحفوظ؟' : 'Delete saved view?')) return;
    try {
      const { error } = await supabase.from('saved_filters').delete().eq('id', selectedSavedId);
      if (error) throw error;
      setSelectedSavedId('');
      setSavedFilters(savedFilters.filter((s) => s.id !== selectedSavedId));
      toast({ title: language === 'ar' ? 'تم الحذف' : 'Deleted' });
    } catch (e: any) {
      toast({ title: language === 'ar' ? 'خطأ' : 'Error', description: e?.message || 'Delete failed', variant: 'destructive' });
    }
  };

  const trendData = useMemo(() => {
    return trendRows.map((r) => ({
      month: r.month_key,
      sameDept: r.same_avg ?? null,
      crossDept: r.cross_avg ?? null,
    }));
  }, [trendRows]);

  const heatmapMonths = useMemo(() => {
    // show last up to 12 months returned
    const keys = Array.from(new Set(deptMonthRows.map((x) => x.month_key))).sort();
    return keys;
  }, [deptMonthRows]);

  // Auto-select latest month for matrix
  useEffect(() => {
    if (!matrixMonth && heatmapMonths.length) {
      setMatrixMonth(heatmapMonths[heatmapMonths.length - 1]);
    }
  }, [heatmapMonths, matrixMonth]);

  // Load cross-dept matrix for the selected month
  useEffect(() => {
    const loadMatrix = async () => {
      if (!matrixMonth) return;
      try {
        const { data, error } = await supabase.rpc("rpc_reports_cross_dept_matrix", {
          p_month_key: matrixMonth,
          p_min_n: matrixMinN,
        });
        if (error) throw error;
        setMatrixCells((data as any) || []);
      } catch (e) {
        console.error("Matrix load error:", e);
        setMatrixCells([]);
      }
    };
    loadMatrix();
  }, [matrixMonth, matrixMinN]);

  // Load outliers/anomalies for the selected month (best-effort; page still works without SQL installed)
  useEffect(() => {
    const loadOutliers = async () => {
      if (!matrixMonth) return;
      setOutliersLoading(true);
      try {
        const { data: out, error: outErr } = await supabase.rpc('rpc_reports_outliers', {
          p_month_key: matrixMonth,
          p_min_n: Math.max(1, matrixMinN),
          p_limit: 50,
        } as any);

        const { data: an, error: anErr } = await supabase.rpc('rpc_reports_rater_anomalies', {
          p_month_key: matrixMonth,
          p_min_n: Math.max(3, matrixMinN),
          p_limit: 50,
        } as any);

        // If functions don't exist, keep silent
        if (outErr && String(outErr.message || '').includes('function')) throw outErr;
        if (anErr && String(anErr.message || '').includes('function')) throw anErr;

        setOutliers((out as any) || []);
        setAnomalies((an as any) || []);

        const ids = new Set<string>();
        ((out as any) || []).forEach((r: any) => ids.add(String(r.evaluatee_id || r.user_id || '')));
        ((an as any) || []).forEach((r: any) => ids.add(String(r.evaluator_id || r.user_id || '')));
        const idList = Array.from(ids).filter(Boolean);

        if (idList.length) {
          const { data: profs, error: pErr } = await supabase
            .from('profiles')
            .select('id,name_en,name_ar,department_id,staff_id')
            .in('id', idList);
          if (!pErr) {
            const map: Record<string, any> = {};
            (profs || []).forEach((p: any) => (map[p.id] = p));
            setProfilesById(map);
          }
        }
      } catch (e) {
        // Best-effort: do nothing
        setOutliers([]);
        setAnomalies([]);
        setProfilesById({});
      } finally {
        setOutliersLoading(false);
      }
    };

    void loadOutliers();
  }, [matrixMonth, matrixMinN]);

  const heatmapRows = useMemo<DeptMonthHeatmapRow[]>(() => {
    const byDept: Record<string, DeptMonthHeatmapRow> = {};

    for (const row of deptMonthRows) {
      const deptId = row.department_id;
      const d = departments[deptId];
      if (!byDept[deptId]) {
        byDept[deptId] = {
          deptId,
          nameEn: d?.name_en || deptId,
          nameAr: d?.name_ar || deptId,
          values: {},
        };
      }
      byDept[deptId].values[row.month_key] = row.avg_score ?? null;
    }

    return Object.values(byDept).sort((a, b) => (a.nameEn || "").localeCompare(b.nameEn || ""));
  }, [deptMonthRows, departments]);

  const totalCount = useMemo(() => trendRows.reduce((acc, r) => acc + (r.same_n || 0) + (r.cross_n || 0), 0), [trendRows]);

  const canExport = hasPermission('reports.export');

  const exportCsvBundle = () => {
    try {
      const trend = trendRows.map((r) => ({
        month_key: r.month_key,
        same_avg: r.same_avg,
        cross_avg: r.cross_avg,
        same_n: r.same_n,
        cross_n: r.cross_n,
      }));
      exportToCsv(`trend_${months}m.csv`, trend);

      const hm = deptMonthRows.map((r) => {
        const d = departments[r.department_id];
        return {
          month_key: r.month_key,
          group,
          department: language === 'ar' ? (d?.name_ar || r.department_id) : (d?.name_en || r.department_id),
          avg_score: r.avg_score,
          n: r.n,
        };
      });
      exportToCsv(`dept_heatmap_${months}m_${group}.csv`, hm);

      const matrix = matrixCells.map((c: any) => {
        const from = departments[c.from_department_id];
        const to = departments[c.to_department_id];
        return {
          month_key: matrixMonth,
          from_department: language === 'ar' ? (from?.name_ar || c.from_department_id) : (from?.name_en || c.from_department_id),
          to_department: language === 'ar' ? (to?.name_ar || c.to_department_id) : (to?.name_en || c.to_department_id),
          avg_score: c.avg_score,
          n: c.n,
        };
      });
      exportToCsv(`cross_dept_matrix_${matrixMonth}.csv`, matrix);

      if (outliers?.length) {
        const o = outliers.map((r: any) => {
          const p = profilesById[r.evaluatee_id || r.user_id];
          const d = departments[p?.department_id];
          return {
            month_key: r.month_key || matrixMonth,
            staff_id: p?.staff_id || '',
            name: language === 'ar' ? (p?.name_ar || p?.name_en || '') : (p?.name_en || p?.name_ar || ''),
            department: language === 'ar' ? (d?.name_ar || '') : (d?.name_en || ''),
            avg_score: r.avg_score,
            prev_avg: r.prev_avg,
            delta: r.delta,
            n: r.n,
          };
        });
        exportToCsv(`outliers_${matrixMonth}.csv`, o);
      }

      if (anomalies?.length) {
        const a = anomalies.map((r: any) => {
          const p = profilesById[r.evaluator_id || r.user_id];
          const d = departments[p?.department_id];
          return {
            month_key: r.month_key || matrixMonth,
            staff_id: p?.staff_id || '',
            name: language === 'ar' ? (p?.name_ar || p?.name_en || '') : (p?.name_en || p?.name_ar || ''),
            department: language === 'ar' ? (d?.name_ar || '') : (d?.name_en || ''),
            avg_score: r.avg_score,
            n: r.n,
            note: r.note || '',
          };
        });
        exportToCsv(`rater_anomalies_${matrixMonth}.csv`, a);
      }

      toast({ title: language === 'ar' ? 'تم التصدير' : 'Exported', description: language === 'ar' ? 'تم إنشاء ملفات CSV.' : 'CSV files generated.' });
    } catch (e: any) {
      toast({ title: language === 'ar' ? 'خطأ' : 'Error', description: e?.message || 'Export failed', variant: 'destructive' });
    }
  };

  const printPdf = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header title={t("reports.title") || (language === "ar" ? "التقارير والتحليلات" : "Reports & Analytics")} />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {language === "ar" ? "إعدادات التحليل" : "Analytics settings"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="w-full md:w-48">
                <div className="text-sm text-muted-foreground mb-1">{language === "ar" ? "النمط" : "Mode"}</div>
                <Select value={timeMode} onValueChange={(v: any) => setTimeMode(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">{language === "ar" ? "شهر" : "Month"}</SelectItem>
                    <SelectItem value="period">{language === "ar" ? "فترة" : "Period"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full md:w-64">
                <div className="text-sm text-muted-foreground mb-1">{language === "ar" ? "الفترة الزمنية" : "Time range"}</div>
                {timeMode === "month" ? (
                  <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthOptions(24).map((ym) => (
                        <SelectItem key={ym} value={ym}>{ym}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          <span className="truncate">
                            {selectedMonths.length
                              ? `${selectedMonths.length} ${language === "ar" ? "شهر" : "months"}`
                              : (language === "ar" ? "اختر الأشهر" : "Select months")}
                          </span>
                          <span className="text-muted-foreground text-xs">{language === "ar" ? "متعدد" : "Multi"}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-2" align="start">
                        <div className="max-h-64 overflow-auto space-y-2">
                          {monthOptions(24).map((ym) => {
                            const checked = selectedMonths.includes(ym);
                            return (
                              <label key={ym} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(val) => {
                                    const isOn = Boolean(val);
                                    setSelectedMonths((prev) =>
                                      isOn ? Array.from(new Set([...prev, ym])) : prev.filter((x) => x !== ym)
                                    );
                                  }}
                                />
                                <span>{ym}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="pt-2 flex justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedMonths([])}>
                            {language === "ar" ? "مسح" : "Clear"}
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <div className="text-xs text-muted-foreground">
                      {language === "ar" ? "إذا لم تختَر أشهرًا، سيتم استخدام آخر عدد أشهر." : "If no months selected, we use the last N months."}
                    </div>

                    <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">6</SelectItem>
                        <SelectItem value="12">12</SelectItem>
                        <SelectItem value="18">18</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="w-full md:w-48">
              <div className="text-sm text-muted-foreground mb-1">{language === "ar" ? "نوع التقييم" : "Type"}</div>
              <Select value={group} onValueChange={(v: any) => setGroup(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">{language === "ar" ? "داخل القسم" : "Same dept"}</SelectItem>
                  <SelectItem value="cross">{language === "ar" ? "عبر الأقسام" : "Cross dept"}</SelectItem>
                </SelectContent>
              </Select>
              </div>

              <div className="w-full md:w-64">
                <div className="text-sm text-muted-foreground mb-1">{language === 'ar' ? 'عروض محفوظة' : 'Saved views'}</div>
                <Select value={selectedSavedId} onValueChange={(v) => applySavedView(v)}>
                  <SelectTrigger><SelectValue placeholder={language === 'ar' ? 'اختيار' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {savedFilters.length ? savedFilters.map((sf) => (
                      <SelectItem key={sf.id} value={sf.id}>{sf.name}</SelectItem>
                    )) : (
                      <SelectItem value="__none" disabled>{language === 'ar' ? 'لا يوجد' : 'None'}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 no-print">
              <Button type="button" variant="outline" onClick={saveCurrentView}>
                {language === 'ar' ? 'حفظ العرض' : 'Save view'}
              </Button>
              <Button type="button" variant="outline" onClick={deleteSavedView} disabled={!selectedSavedId}>
                {language === 'ar' ? 'حذف' : 'Delete'}
              </Button>
              {canExport ? (
                <>
                  <Button type="button" onClick={exportCsvBundle}>
                    {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
                  </Button>
                  <Button type="button" variant="outline" onClick={printPdf}>
                    {language === 'ar' ? 'PDF/طباعة' : 'Print/PDF'}
                  </Button>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground">{t("loading") || "Loading..."}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPICard title={language === "ar" ? "إجمالي التقييمات (ضمن الفترة)" : "Total evals (range)"} value={totalCount} icon={ClipboardList} />
              <KPICard title={language === "ar" ? "متوسط داخل القسم (آخر شهر)" : "Same avg (latest)"} value={trendRows.length ? (trendRows[trendRows.length - 1]?.same_avg ?? "—") : "—"} icon={TrendingUp} />
              <KPICard title={language === "ar" ? "متوسط عبر الأقسام (آخر شهر)" : "Cross avg (latest)"} value={trendRows.length ? (trendRows[trendRows.length - 1]?.cross_avg ?? "—") : "—"} icon={TrendingUp} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TrendLineChart data={trendData} title={language === "ar" ? "الاتجاه الشهري (داخل/عبر)" : "Monthly trend (same/cross)"} />
              <Card className="h-fit">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {language === "ar" ? "خريطة حرارية للأقسام" : "Department heatmap"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {language === "ar"
                    ? "الخريطة تعرض متوسط التقييم لكل قسم حسب الشهر (من بيانات مكتملة فقط)."
                    : "Heatmap shows average score per department by month (completed only)."}
                </CardContent>
              </Card>
            </div>

            <DepartmentMonthHeatmap
              months={heatmapMonths}
              rows={heatmapRows}
              title={language === "ar" ? "الأداء حسب القسم عبر الأشهر" : "Department performance by month"}
            />

            {/* Cross-Dept Matrix */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {language === "ar" ? "مصفوفة الأقسام (عبر الأقسام)" : "Cross-Dept Matrix"}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-56">
                  <div className="text-sm text-muted-foreground mb-1">
                    {language === "ar" ? "الشهر" : "Month"}
                  </div>
                  <Select value={matrixMonth} onValueChange={(v) => setMatrixMonth(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={language === "ar" ? "اختر الشهر" : "Select month"} />
                    </SelectTrigger>
                    <SelectContent>
                      {heatmapMonths.slice(-12).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full md:w-56">
                  <div className="text-sm text-muted-foreground mb-1">
                    {language === "ar" ? "الحد الأدنى (عدد التقييمات)" : "Min count (n)"}
                  </div>
                  <Select value={String(matrixMinN)} onValueChange={(v) => setMatrixMinN(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <CrossDeptMatrixHeatmap
              title={language === "ar" ? "من قسم المُقيِّم إلى قسم المُقيَّم" : "From evaluator dept → evaluatee dept"}
              language={language as any}
              departmentsById={departments as any}
              cells={matrixCells}
              minN={matrixMinN}
            />

            {/* Outliers & Anomalies */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {language === 'ar' ? 'الاستثناءات والشذوذ' : 'Outliers & anomalies'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {outliersLoading ? (
                  <div className="text-sm text-muted-foreground">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</div>
                ) : null}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{language === 'ar' ? 'انخفاضات مفاجئة (آخر شهر مختار)' : 'Sudden drops (selected month)'}
                    </div>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="text-left px-3 py-2">{language === 'ar' ? 'الموظف' : 'Employee'}</th>
                            <th className="text-left px-3 py-2">{language === 'ar' ? 'القسم' : 'Dept'}</th>
                            <th className="text-right px-3 py-2">{language === 'ar' ? 'Δ' : 'Δ'}</th>
                            <th className="text-right px-3 py-2">{language === 'ar' ? 'n' : 'n'}</th>
                            <th className="px-3 py-2 no-print"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(outliers || []).slice(0, 25).map((r: any, idx: number) => {
                            const id = String(r.evaluatee_id || r.user_id || '');
                            const p = profilesById[id];
                            const d = departments[p?.department_id];
                            const displayName = language === 'ar' ? (p?.name_ar || p?.name_en || '') : (p?.name_en || p?.name_ar || '');
                            const deptName = language === 'ar' ? (d?.name_ar || '') : (d?.name_en || '');
                            const staff = p?.staff_id ? `(${p.staff_id})` : '';
                            return (
                              <tr key={`${id}-${idx}`} className="border-t">
                                <td className="px-3 py-2">{displayName} {staff}</td>
                                <td className="px-3 py-2">{deptName}</td>
                                <td className="px-3 py-2 text-right font-medium">{typeof r.delta === 'number' ? r.delta.toFixed(2) : (r.delta ?? '—')}</td>
                                <td className="px-3 py-2 text-right">{r.n ?? '—'}</td>
                                <td className="px-3 py-2 text-right no-print">
                                  {id ? (
                                    <Button size="sm" variant="outline" onClick={() => window.open(`/profile/${id}`, '_blank', 'noopener')}>
                                      {language === 'ar' ? 'عرض' : 'View'}
                                    </Button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                          {(outliers || []).length === 0 ? (
                            <tr className="border-t"><td className="px-3 py-3 text-muted-foreground" colSpan={5}>—</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'ar'
                        ? 'إذا لم تظهر بيانات: تأكد تشغيل SQL (rpc_reports_outliers) أو وجود تقييمات مكتملة.'
                        : 'If empty: ensure SQL (rpc_reports_outliers) is installed and you have completed evaluations.'}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium">{language === 'ar' ? 'مقيمون غير طبيعيين' : 'Abnormal raters'}</div>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="text-left px-3 py-2">{language === 'ar' ? 'المقيم' : 'Rater'}</th>
                            <th className="text-left px-3 py-2">{language === 'ar' ? 'القسم' : 'Dept'}</th>
                            <th className="text-right px-3 py-2">{language === 'ar' ? 'المتوسط' : 'Avg'}</th>
                            <th className="text-right px-3 py-2">{language === 'ar' ? 'n' : 'n'}</th>
                            <th className="px-3 py-2 no-print"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {(anomalies || []).slice(0, 25).map((r: any, idx: number) => {
                            const id = String(r.evaluator_id || r.user_id || '');
                            const p = profilesById[id];
                            const d = departments[p?.department_id];
                            const displayName = language === 'ar' ? (p?.name_ar || p?.name_en || '') : (p?.name_en || p?.name_ar || '');
                            const deptName = language === 'ar' ? (d?.name_ar || '') : (d?.name_en || '');
                            const staff = p?.staff_id ? `(${p.staff_id})` : '';
                            return (
                              <tr key={`${id}-${idx}`} className="border-t">
                                <td className="px-3 py-2">{displayName} {staff}</td>
                                <td className="px-3 py-2">{deptName}</td>
                                <td className="px-3 py-2 text-right font-medium">{typeof r.avg_score === 'number' ? r.avg_score.toFixed(2) : (r.avg_score ?? '—')}</td>
                                <td className="px-3 py-2 text-right">{r.n ?? '—'}</td>
                                <td className="px-3 py-2 text-right no-print">
                                  {id ? (
                                    <Button size="sm" variant="outline" onClick={() => window.open(`/profile/${id}`, '_blank', 'noopener')}>
                                      {language === 'ar' ? 'عرض' : 'View'}
                                    </Button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                          {(anomalies || []).length === 0 ? (
                            <tr className="border-t"><td className="px-3 py-3 text-muted-foreground" colSpan={5}>—</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {language === 'ar'
                        ? 'يتطلب SQL (rpc_reports_rater_anomalies) وتقييمات مكتملة.'
                        : 'Requires SQL (rpc_reports_rater_anomalies) and completed evaluations.'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsAnalyticsPage;
