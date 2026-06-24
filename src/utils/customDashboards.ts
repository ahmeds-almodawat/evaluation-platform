import { supabase } from "@/integrations/supabase/client";

export type CustomDashboard = {
  id: string;
  title_en: string;
  title_ar: string;
  description_en: string | null;
  description_ar: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
};

export type DashboardWidgetType =
  | "kpi_overall_score"
  | "kpi_participation"
  | "chart_trend_score"
  | "table_departments_ranking"
  | "table_people_risk"
  | "table_action_tickets"
  | "notes";

export type CustomDashboardWidget = {
  id: string;
  dashboard_id: string;
  widget_type: DashboardWidgetType;
  position: { order: number; w?: number };
  config: Record<string, any>;
  created_at: string;
};

export type CustomDashboardShare = {
  id: string;
  dashboard_id: string;
  created_at: string;
  share_role: string | null;
  share_user_id: string | null;
  can_edit: boolean;
};

export async function listCustomDashboards(): Promise<CustomDashboard[]> {
  const { data, error } = await supabase
    .from("custom_dashboards")
    .select("id,title_en,title_ar,description_en,description_ar,created_by,created_at,updated_at,is_published")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []) as any;
}

export async function createCustomDashboard(input: {
  title_en: string;
  title_ar: string;
  description_en?: string;
  description_ar?: string;
}): Promise<CustomDashboard> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("custom_dashboards")
    .insert({
      created_by: uid,
      title_en: input.title_en,
      title_ar: input.title_ar,
      description_en: input.description_en ?? null,
      description_ar: input.description_ar ?? null,
      is_published: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as any;
}

export async function updateCustomDashboard(
  id: string,
  patch: Partial<Pick<CustomDashboard, "title_en" | "title_ar" | "description_en" | "description_ar" | "is_published">>
) {
  const { error } = await supabase.from("custom_dashboards").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCustomDashboard(id: string) {
  const { error } = await supabase.from("custom_dashboards").delete().eq("id", id);
  if (error) throw error;
}

export async function listDashboardWidgets(dashboardId: string): Promise<CustomDashboardWidget[]> {
  const { data, error } = await supabase
    .from("custom_dashboard_widgets")
    .select("id,dashboard_id,widget_type,position,config,created_at")
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data || []) as any[];
  // Ensure position.order exists
  return rows
    .map((r) => ({
      ...r,
      position: { order: Number(r.position?.order ?? 0), w: r.position?.w ?? 12 },
      config: r.config || {},
    }))
    .sort((a, b) => (a.position.order ?? 0) - (b.position.order ?? 0));
}

export async function addWidget(dashboardId: string, widget_type: DashboardWidgetType, order: number) {
  const { data, error } = await supabase
    .from("custom_dashboard_widgets")
    .insert({ dashboard_id: dashboardId, widget_type, position: { order, w: 12 }, config: {} })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function updateWidget(id: string, patch: Partial<Pick<CustomDashboardWidget, "position" | "config">>) {
  const { error } = await supabase.from("custom_dashboard_widgets").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function deleteWidget(id: string) {
  const { error } = await supabase.from("custom_dashboard_widgets").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderWidgets(widgets: CustomDashboardWidget[]) {
  // update in small batch
  const updates = widgets.map((w, idx) => ({ id: w.id, position: { ...(w.position || {}), order: idx } }));
  const { error } = await supabase.from("custom_dashboard_widgets").upsert(updates, { onConflict: "id" });
  if (error) throw error;
}

export async function listDashboardShares(dashboardId: string): Promise<CustomDashboardShare[]> {
  const { data, error } = await supabase
    .from("custom_dashboard_shares")
    .select("id,dashboard_id,created_at,share_role,share_user_id,can_edit")
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as any;
}

export async function addDashboardShare(input: {
  dashboard_id: string;
  share_role?: string | null;
  share_user_id?: string | null;
  can_edit?: boolean;
}) {
  const { data, error } = await supabase
    .from("custom_dashboard_shares")
    .insert({
      dashboard_id: input.dashboard_id,
      share_role: input.share_role ?? null,
      share_user_id: input.share_user_id ?? null,
      can_edit: input.can_edit ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function deleteDashboardShare(shareId: string) {
  const { error } = await supabase.from("custom_dashboard_shares").delete().eq("id", shareId);
  if (error) throw error;
}
