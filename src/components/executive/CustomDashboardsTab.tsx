import React, { useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { downloadXlsx } from "@/utils/exportXlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  addWidget,
  createCustomDashboard,
  deleteCustomDashboard,
  deleteWidget,
  listDashboardShares,
  addDashboardShare,
  deleteDashboardShare,
  listCustomDashboards,
  listDashboardWidgets,
  reorderWidgets,
  updateWidget,
  type CustomDashboard,
  type CustomDashboardWidget,
  type DashboardWidgetType,
} from "@/utils/customDashboards";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Download, Settings2, Share2 } from "lucide-react";

const WIDGET_OPTIONS: { key: DashboardWidgetType; en: string; ar: string }[] = [
  { key: "kpi_overall_score", en: "KPI: Overall Score", ar: "مؤشر: الدرجة العامة" },
  { key: "kpi_participation", en: "KPI: Participation", ar: "مؤشر: نسبة المشاركة" },
  { key: "chart_trend_score", en: "Chart: Score Trend", ar: "رسم: اتجاه الدرجات" },
  { key: "table_departments_ranking", en: "Table: Dept Ranking", ar: "جدول: ترتيب الأقسام" },
  { key: "table_people_risk", en: "Table: People Risk", ar: "جدول: مخاطر الأفراد" },
  { key: "table_action_tickets", en: "Table: Action Tickets", ar: "جدول: تذاكر المتابعة" },
  { key: "notes", en: "Notes Block", ar: "ملاحظات" },
];

type DashboardTemplate = {
  key: string;
  title_en: string;
  title_ar: string;
  widgets: DashboardWidgetType[];
};

const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: "ceo_overview",
    title_en: "CEO Overview",
    title_ar: "نظرة تنفيذية (الرئيس التنفيذي)",
    widgets: ["kpi_overall_score", "kpi_participation", "chart_trend_score", "table_departments_ranking", "table_people_risk", "table_action_tickets", "notes"],
  },
  {
    key: "hr_risk",
    title_en: "HR Risk & People",
    title_ar: "المخاطر والأفراد (الموارد البشرية)",
    widgets: ["kpi_overall_score", "chart_trend_score", "table_people_risk", "table_action_tickets", "notes"],
  },
  {
    key: "ops",
    title_en: "Ops & Participation",
    title_ar: "التشغيل والمشاركة",
    widgets: ["kpi_participation", "chart_trend_score", "table_departments_ranking", "table_action_tickets", "notes"],
  },
];

function isCrossType(t: string | null) {
  const v = (t || "").toLowerCase();
  return v === "cross" || v === "cross_individuals" || v === "cross_managers" || v === "cross_department" || v === "cross_station";
}

function isSameType(t: string | null) {
  return (t || "").toLowerCase() === "same";
}

function SortableWidgetCard({
  widget,
  title,
  onDelete,
  onSettings,
}: {
  widget: CustomDashboardWidget;
  title: string;
  onDelete: () => void;
  onSettings: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="border/50">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border px-2 py-1 text-muted-foreground hover:text-foreground"
              {...attributes}
              {...listeners}
              aria-label="Drag"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={onSettings}>
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs">{widget.widget_type}</span>
          <div className="flex items-center gap-2">
            {widget.config?.scope ? <Badge variant="secondary">{widget.config.scope}</Badge> : null}
            {widget.config?.months ? <Badge variant="secondary">{widget.config.months}m</Badge> : null}
            {widget.config?.department_id ? <Badge variant="secondary">dept</Badge> : null}
            <Badge variant="secondary">w:{widget.position.w ?? 12}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function normalizeScope(scope: string | undefined) {
  if (!scope) return "all";
  if (scope === "same" || scope === "cross" || scope === "all") return scope;
  return "all";
}

function isCross(type: string | null | undefined) {
  return type === "cross_individuals" || type === "cross_managers" || type === "cross" || type === "cross_department" || type === "cross_station";
}

function applyEvalScope(evals: any[], scope: string) {
  const s = normalizeScope(scope);
  if (s === "all") return evals;
  if (s === "same") return evals.filter((e) => ["same", "self_station", "manager_to_team", "team_to_manager"].includes((e.evaluation_type || "").toLowerCase()));
  return evals.filter((e) => isCross(e.evaluation_type));
}

function withinMonths(createdAt: string, months: number) {
  if (!months || months <= 0) return true;
  const d = new Date(createdAt);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  return d >= cutoff;
}

export default function CustomDashboardsTab() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { hasPermission } = useSupabaseAuth();
  const { toast } = useToast();

  const canCreate = hasPermission?.("dashboards.custom.create") ?? true; // fallback
  const canExport = hasPermission?.("reports.export") ?? true;

  const [dashboards, setDashboards] = useState<CustomDashboard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = useMemo(() => dashboards.find((d) => d.id === activeId) || null, [dashboards, activeId]);

  const [widgets, setWidgets] = useState<CustomDashboardWidget[]>([]);
  const widgetIds = useMemo(() => widgets.map((w) => w.id), [widgets]);

  // supporting data for filters / shares
  const [departments, setDepartments] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  // Widget settings
  const [widgetToEdit, setWidgetToEdit] = useState<CustomDashboardWidget | null>(null);

  // Share management
  const [shareOpen, setShareOpen] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
  const [shareRole, setShareRole] = useState<string>("audit");
  const [shareUserId, setShareUserId] = useState<string>("");
  const [shareCanEdit, setShareCanEdit] = useState<boolean>(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [newEn, setNewEn] = useState("");
  const [newAr, setNewAr] = useState("");
  const [templateKey, setTemplateKey] = useState<string>(DASHBOARD_TEMPLATES[0]?.key ?? "ceo_overview");

  const [addWidgetType, setAddWidgetType] = useState<DashboardWidgetType>("kpi_overall_score");

  async function refresh() {
    const list = await listCustomDashboards();
    setDashboards(list);
    if (!activeId && list[0]) setActiveId(list[0].id);
    if (activeId && !list.some((d) => d.id === activeId)) setActiveId(list[0]?.id ?? null);
  }

  useEffect(() => {
    refresh().catch(() => {
      toast({ title: isAr ? "تعذر تحميل" : "Failed to load", variant: "destructive" });
    });
    // load departments and users for filters/shares
    (async () => {
      try {
        const [{ data: depts }, { data: profs }] = await Promise.all([
          supabase.from("departments").select("id,name_en,name_ar").order("name_en") as any,
          supabase.from("profiles").select("id,name_en,name_ar,email").order("name_en") as any,
        ]);
        setDepartments((depts || []) as any[]);
        setProfiles((profs || []) as any[]);
      } catch {
        // non-fatal
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeId) {
      setWidgets([]);
      return;
    }
    (async () => {
      try {
        const w = await listDashboardWidgets(activeId);
        setWidgets(w);
      } catch {
        setWidgets([]);
      }
    })();
  }, [activeId]);

  async function onCreateDashboard() {
    try {
      const tpl = DASHBOARD_TEMPLATES.find((t) => t.key === templateKey) || DASHBOARD_TEMPLATES[0];
      const created = await createCustomDashboard({
        title_en: newEn || tpl?.title_en || "Executive View",
        title_ar: newAr || tpl?.title_ar || "لوحة تنفيذية",
      });
      // apply template widgets (so user sees something immediately)
      if (tpl?.widgets?.length) {
        for (let i = 0; i < tpl.widgets.length; i++) {
          await addWidget(created.id, tpl.widgets[i], i);
        }
        // add an initial notes block text if template includes notes
        const ws = await listDashboardWidgets(created.id);
        const note = ws.find((w) => w.widget_type === "notes");
        if (note) {
          await updateWidget(note.id, {
            config: {
              ...(note.config || {}),
              text: isAr
                ? "اكتب هنا ملاحظات تنفيذية: أهم التحسينات، أكبر الانخفاضات، وما يلزم اتخاذه من إجراءات."
                : "Write executive notes here: biggest improvements, biggest drops, and required actions.",
            },
          });
        }
      }
      toast({ title: isAr ? "تم الإنشاء" : "Created" });
      setCreateOpen(false);
      setNewEn("");
      setNewAr("");
      setTemplateKey(DASHBOARD_TEMPLATES[0]?.key ?? "ceo_overview");
      await refresh();
      setActiveId(created.id);
    } catch (e: any) {
      toast({ title: isAr ? "فشل الإنشاء" : "Create failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function onDeleteDashboard(id: string) {
    try {
      await deleteCustomDashboard(id);
      toast({ title: isAr ? "تم الحذف" : "Deleted" });
      await refresh();
    } catch (e: any) {
      toast({ title: isAr ? "فشل الحذف" : "Delete failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function onAddWidget() {
    if (!activeId) return;
    try {
      const order = widgets.length ? Math.max(...widgets.map((w) => w.position.order ?? 0)) + 1 : 0;
      await addWidget(activeId, addWidgetType, order);
      const w = await listDashboardWidgets(activeId);
      setWidgets(w);
    } catch (e: any) {
      toast({ title: isAr ? "فشل الإضافة" : "Add failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function onDeleteWidget(widgetId: string) {
    try {
      await deleteWidget(widgetId);
      if (activeId) setWidgets(await listDashboardWidgets(activeId));
    } catch (e: any) {
      toast({ title: isAr ? "فشل الحذف" : "Delete failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function onDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    const next = arrayMove(widgets, oldIndex, newIndex).map((w, idx) => ({ ...w, position: { ...w.position, order: idx } }));
    setWidgets(next);
    try {
      await reorderWidgets(next);
    } catch {
      // ignore: UI already updated; will reconcile on refresh
    }
  }

  async function openShareManager() {
    if (!activeId) return;
    try {
      setShares(await listDashboardShares(activeId));
      setShareOpen(true);
    } catch (e: any) {
      toast({ title: isAr ? "فشل التحميل" : "Failed to load shares", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function addShare() {
    if (!activeId) return;
    try {
      if (!shareRole && !shareUserId) {
        toast({ title: isAr ? "اختر دور أو مستخدم" : "Pick a role or user", variant: "destructive" });
        return;
      }
      await addDashboardShare({
        dashboard_id: activeId,
        share_role: shareUserId ? null : shareRole,
        share_user_id: shareUserId ? shareUserId : null,
        can_edit: shareCanEdit,
      });
      setShareUserId("");
      setShareCanEdit(false);
      setShares(await listDashboardShares(activeId));
      toast({ title: isAr ? "تمت المشاركة" : "Shared" });
    } catch (e: any) {
      toast({ title: isAr ? "فشل المشاركة" : "Share failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function removeShare(id: string) {
    try {
      await deleteDashboardShare(id);
      if (activeId) setShares(await listDashboardShares(activeId));
    } catch (e: any) {
      toast({ title: isAr ? "فشل الحذف" : "Delete failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function saveWidgetSettings(next: CustomDashboardWidget) {
    try {
      await updateWidget(next.id, { position: next.position, config: next.config });
      if (activeId) setWidgets(await listDashboardWidgets(activeId));
      setWidgetToEdit(null);
      toast({ title: isAr ? "تم الحفظ" : "Saved" });
    } catch (e: any) {
      toast({ title: isAr ? "فشل الحفظ" : "Save failed", description: String(e?.message ?? e), variant: "destructive" });
    }
  }

  async function exportDashboardToExcel() {
    if (!activeId || !active) return;
    if (!canExport) return;

    // Simple, robust export: each widget becomes a sheet
    // Uses the same source tables as ExecutiveDashboardsPage.
    const [{ data: profiles }, { data: departments }, { data: evaluations }, { data: tickets }] = await Promise.all([
      supabase.from("profiles").select("id,name_en,name_ar,department_id,is_active,deleted_at") as any,
      supabase.from("departments").select("id,name_en,name_ar") as any,
      supabase
        .from("evaluations")
        .select("id,evaluatee_id,evaluator_id,evaluation_type,status,performance_score,teamwork_score,workload_score,created_at")
        .eq("status", "completed") as any,
      supabase.from("action_tickets").select("id,title,description,status,severity,due_date,created_at") as any,
    ]);

    const prof = ((profiles || []) as any[]).filter((p) => p.is_active !== false && p.deleted_at == null);
    const depts = (departments || []) as any[];
    const evals = (evaluations || []) as any[];

    const deptById = new Map(depts.map((d) => [d.id, d]));

    const profileById = new Map(prof.map((p) => [p.id, p]));

    function applyWidgetFilters(w: CustomDashboardWidget, rows: any[]) {
      const cfg = (w.config || {}) as any;
      const deptId = cfg.department_id ? String(cfg.department_id) : "";
      const scope = String(cfg.evaluation_scope || "all"); // all | same | cross
      const months = Number(cfg.months_back || 0);

      return rows.filter((e) => {
        if (months && !withinMonths(e.created_at, months)) return false;
        if (scope === "same" && !isSameType(e.evaluation_type)) return false;
        if (scope === "cross" && !isCrossType(e.evaluation_type)) return false;
        if (deptId) {
          const p = profileById.get(e.evaluatee_id);
          if (String(p?.department_id || "") !== deptId) return false;
        }
        return true;
      });
    }

    function peopleInDept(deptId: string) {
      return prof.filter((p) => String(p.department_id || "") === String(deptId));
    }
    const avgScore = (rows: any[]) => {
      if (!rows.length) return 0;
      const s = rows.reduce((acc, r) => acc + Number(r.performance_score ?? 0), 0);
      return s / rows.length;
    };

    const sheets: { name: string; rows: any[] }[] = [];
    for (const w of widgets) {
      const filteredEvals = applyWidgetFilters(w, evals);
      const cfg = (w.config || {}) as any;
      const customSheetName = typeof cfg.sheet_name === "string" ? cfg.sheet_name : "";
      const label = isAr
        ? WIDGET_OPTIONS.find((o) => o.key === w.widget_type)?.ar ?? w.widget_type
        : WIDGET_OPTIONS.find((o) => o.key === w.widget_type)?.en ?? w.widget_type;

      const sheetPrefix = customSheetName ? customSheetName : label;

      if (w.widget_type === "kpi_overall_score") {
        sheets.push({ name: sheetPrefix, rows: [{ value: avgScore(filteredEvals) }] });
      } else if (w.widget_type === "kpi_participation") {
        const deptId = String(cfg.department_id || "");
        const denomProfiles = deptId ? peopleInDept(deptId) : prof;
        const denomIds = new Set(denomProfiles.map((p) => p.id));
        const evaluated = new Set(filteredEvals.map((e) => e.evaluatee_id).filter((id) => denomIds.has(id)));
        const participation = denomProfiles.length ? (evaluated.size / denomProfiles.length) * 100 : 0;
        sheets.push({ name: sheetPrefix, rows: [{ value: Math.round(participation) + "%" }] });
      } else if (w.widget_type === "table_departments_ranking") {
        const byDept = new Map<string, any[]>();
        for (const e of filteredEvals) {
          const p = profileById.get(e.evaluatee_id);
          const deptId = p?.department_id;
          if (!deptId) continue;
          if (!byDept.has(deptId)) byDept.set(deptId, []);
          byDept.get(deptId)!.push(e);
        }
        const rows = Array.from(byDept.entries())
          .map(([deptId, rows]) => {
            const d = deptById.get(deptId);
            return {
              department_id: deptId,
              department_en: d?.name_en,
              department_ar: d?.name_ar,
              avg_performance: avgScore(rows),
              count: rows.length,
            };
          })
          .sort((a, b) => (b.avg_performance ?? 0) - (a.avg_performance ?? 0));
        sheets.push({ name: sheetPrefix, rows });
      } else if (w.widget_type === "table_people_risk") {
        // Simple risk list: low avg score
        const byPerson = new Map<string, any[]>();
        for (const e of filteredEvals) {
          if (!byPerson.has(e.evaluatee_id)) byPerson.set(e.evaluatee_id, []);
          byPerson.get(e.evaluatee_id)!.push(e);
        }
        const rows = Array.from(byPerson.entries())
          .map(([pid, rows]) => {
            const p = profileById.get(pid);
            const dept = p?.department_id ? deptById.get(p.department_id) : null;
            return {
              profile_id: pid,
              name_en: p?.name_en,
              name_ar: p?.name_ar,
              department_id: p?.department_id,
              department_en: dept?.name_en,
              department_ar: dept?.name_ar,
              avg_performance: avgScore(rows),
              count: rows.length,
            };
          })
          .sort((a, b) => (a.avg_performance ?? 0) - (b.avg_performance ?? 0))
          .slice(0, 50);
        sheets.push({ name: sheetPrefix, rows });
      } else if (w.widget_type === "table_action_tickets") {
        sheets.push({ name: sheetPrefix, rows: (tickets || []) as any[] });
      } else if (w.widget_type === "notes") {
        sheets.push({ name: sheetPrefix, rows: [{ note: w.config?.text ?? "" }] });
      } else if (w.widget_type === "chart_trend_score") {
        // Raw evaluations trend data
        const rows = filteredEvals.map((e) => ({ created_at: e.created_at, performance_score: e.performance_score, evaluation_type: e.evaluation_type }));
        sheets.push({ name: sheetPrefix, rows });
      } else {
        sheets.push({ name: sheetPrefix.slice(0, 28), rows: [{ widget: w.widget_type }] });
      }
    }

    downloadXlsx(
      `custom_dashboard_${active.title_en.replace(/\s+/g, "_")}.xlsx`,
      sheets.map((s) => ({ name: s.name, rows: s.rows }))
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">
            {isAr
              ? "أنشئ لوحات مخصصة (مثل Asana) واسحب الويدجت لإعادة الترتيب، ثم صدّر إلى Excel."
              : "Create Asana-like custom dashboards: drag widgets to reorder, then export to Excel."}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                {isAr ? "لوحة جديدة" : "New dashboard"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{isAr ? "إنشاء لوحة" : "Create dashboard"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "قالب جاهز" : "Template"}</div>
                  <Select value={templateKey} onValueChange={setTemplateKey}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DASHBOARD_TEMPLATES.map((t) => (
                        <SelectItem key={t.key} value={t.key}>
                          {isAr ? t.title_ar : t.title_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "الاسم (EN)" : "Name (EN)"}</div>
                  <Input value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder="Executive Dashboard" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "الاسم (AR)" : "Name (AR)"}</div>
                  <Input value={newAr} onChange={(e) => setNewAr(e.target.value)} placeholder="لوحة تنفيذية" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={onCreateDashboard}>{isAr ? "إنشاء" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            className="gap-2"
            disabled={!activeId || !canExport}
            onClick={exportDashboardToExcel}
          >
            <Download className="h-4 w-4" />
            {isAr ? "تصدير Excel" : "Export Excel"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader className="py-4">
            <CardTitle className="text-base">{isAr ? "لوحاتي" : "Dashboards"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={activeId ?? "__none__"} onValueChange={(v) => setActiveId(v === "__none__" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder={isAr ? "اختر لوحة" : "Select dashboard"} />
              </SelectTrigger>
              <SelectContent>
                {dashboards.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {isAr ? d.title_ar : d.title_en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {active && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">{isAr ? active.title_ar : active.title_en}</div>
                  <div className="text-xs text-muted-foreground">{active.updated_at?.slice(0, 10)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={openShareManager}>
                    <Share2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDeleteDashboard(active.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Select value={addWidgetType} onValueChange={(v) => setAddWidgetType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WIDGET_OPTIONS.map((w) => (
                    <SelectItem key={w.key} value={w.key}>
                      {isAr ? w.ar : w.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={onAddWidget} disabled={!activeId} className="gap-2">
                <Plus className="h-4 w-4" />
                {isAr ? "إضافة" : "Add"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-8 space-y-3">
          {!activeId ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {isAr ? "اختر لوحة أو أنشئ لوحة جديدة." : "Select a dashboard or create a new one."}
              </CardContent>
            </Card>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={widgetIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {widgets.map((w) => {
                    const label = isAr
                      ? WIDGET_OPTIONS.find((o) => o.key === w.widget_type)?.ar ?? w.widget_type
                      : WIDGET_OPTIONS.find((o) => o.key === w.widget_type)?.en ?? w.widget_type;
                    return (
                      <SortableWidgetCard
                        key={w.id}
                        widget={w}
                        title={label}
                        onDelete={() => onDeleteWidget(w.id)}
                        onSettings={() => setWidgetToEdit(w)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Widget Settings */}
      <Dialog open={!!widgetToEdit} onOpenChange={(o) => (!o ? setWidgetToEdit(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "إعدادات الويدجت" : "Widget settings"}</DialogTitle>
          </DialogHeader>
          {widgetToEdit && (
            <div className="grid gap-4">
              <div>
                <div className="text-xs text-muted-foreground">{isAr ? "اسم الشيت (اختياري)" : "Sheet name (optional)"}</div>
                <Input
                  value={String((widgetToEdit.config as any)?.sheet_name || "")}
                  onChange={(e) =>
                    setWidgetToEdit({
                      ...widgetToEdit,
                      config: { ...(widgetToEdit.config || {}), sheet_name: e.target.value },
                    })
                  }
                  placeholder={isAr ? "مثال: KPI - يناير" : "e.g., KPI - Jan"}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "فلتر القسم" : "Department filter"}</div>
                  <Select
                    value={String((widgetToEdit.config as any)?.department_id || "")}
                    onValueChange={(v) =>
                      setWidgetToEdit({
                        ...widgetToEdit,
                        config: { ...(widgetToEdit.config || {}), department_id: v || null },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={isAr ? "كل الأقسام" : "All departments"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{isAr ? "كل الأقسام" : "All departments"}</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {isAr ? d.name_ar : d.name_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "نوع التقييم" : "Evaluation scope"}</div>
                  <Select
                    value={String((widgetToEdit.config as any)?.evaluation_scope || "all")}
                    onValueChange={(v) =>
                      setWidgetToEdit({
                        ...widgetToEdit,
                        config: { ...(widgetToEdit.config || {}), evaluation_scope: v },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "كل" : "All"}</SelectItem>
                      <SelectItem value="same">{isAr ? "نفس القسم" : "Same department"}</SelectItem>
                      <SelectItem value="cross">{isAr ? "بين الأقسام" : "Cross-department"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "آخر (بالشهور)" : "Months back"}</div>
                  <Select
                    value={String((widgetToEdit.config as any)?.months_back || 0)}
                    onValueChange={(v) =>
                      setWidgetToEdit({
                        ...widgetToEdit,
                        config: { ...(widgetToEdit.config || {}), months_back: Number(v) },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 3, 6, 12, 24].map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m === 0 ? (isAr ? "كل الفترات" : "All time") : isAr ? `${m} شهر` : `${m} months`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "عرض البطاقة" : "Card width"}</div>
                  <Select
                    value={String(widgetToEdit.position?.w ?? 12)}
                    onValueChange={(v) => setWidgetToEdit({ ...widgetToEdit, position: { order: widgetToEdit.position?.order ?? 0, ...(widgetToEdit.position || {}), w: Number(v) } })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12">{isAr ? "كامل" : "Full"}</SelectItem>
                      <SelectItem value="6">{isAr ? "نصف" : "Half"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {widgetToEdit.widget_type === "notes" && (
                <div>
                  <div className="text-xs text-muted-foreground">{isAr ? "الملاحظات" : "Notes"}</div>
                  <Textarea
                    value={String((widgetToEdit.config as any)?.text || "")}
                    onChange={(e) => setWidgetToEdit({ ...widgetToEdit, config: { ...(widgetToEdit.config || {}), text: e.target.value } })}
                    rows={6}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWidgetToEdit(null)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
            <Button onClick={() => widgetToEdit && saveWidgetSettings(widgetToEdit)} disabled={!widgetToEdit}>
              {isAr ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Manager */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isAr ? "مشاركة اللوحة" : "Share dashboard"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">{isAr ? "مشاركة مع دور" : "Share with role"}</div>
                <Select value={shareRole} onValueChange={setShareRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["admin", "super_user", "audit", "user"].map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{isAr ? "أو مشاركة مع مستخدم" : "Or share with user"}</div>
                <Select value={shareUserId} onValueChange={setShareUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder={isAr ? "اختياري" : "Optional"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{isAr ? "لا" : "None"}</SelectItem>
                    {profiles.slice(0, 200).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {(isAr ? p.name_ar : p.name_en) || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {isAr ? "إذا اخترت مستخدم، سيتم تجاهل الدور." : "If you pick a user, role will be ignored."}
                </div>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <Switch checked={shareCanEdit} onCheckedChange={setShareCanEdit} />
                  <div className="text-sm">{isAr ? "يمكنه التعديل" : "Can edit"}</div>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={addShare}>{isAr ? "إضافة مشاركة" : "Add share"}</Button>
            </div>

            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-medium">{isAr ? "المشاركات الحالية" : "Current shares"}</div>
              <div className="p-3 space-y-2">
                {shares.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{isAr ? "لا توجد مشاركات" : "No shares"}</div>
                ) : (
                  shares.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                      <div className="text-sm">
                        {s.share_role ? (
                          <span>{isAr ? "دور" : "Role"}: {s.share_role}</span>
                        ) : (
                          <span>
                            {isAr ? "مستخدم" : "User"}: {(profiles.find((p) => String(p.id) === String(s.share_user_id))?.[isAr ? "name_ar" : "name_en"] || profiles.find((p) => String(p.id) === String(s.share_user_id))?.email || s.share_user_id)}
                          </span>
                        )}
                        {s.can_edit ? <span className="ml-2 text-xs text-muted-foreground">({isAr ? "تعديل" : "edit"})</span> : null}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => removeShare(s.id)}>
                        {isAr ? "حذف" : "Remove"}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
