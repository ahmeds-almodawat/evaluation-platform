export type ExecDashboardFilters = {
  // Month = single month view; Period = multi-month selection.
  timeMode?: "month" | "period";
  // YYYY-MM string (e.g. 2026-02) when timeMode === 'month'
  selectedMonth?: string | null;
  // Array of YYYY-MM strings when timeMode === 'period'
  selectedMonths?: string[];
  months: number;
  departmentId: string | null;
  evaluationScope: "all" | "same" | "cross";
};

export type SavedExecFilter = {
  id: string;
  name: string;
  filters: ExecDashboardFilters;
  createdAtIso: string;
  source?: 'local' | 'server';
};

const LS_KEY = "exec_dashboard_saved_filters_v1";

export function loadSavedExecFilters(): SavedExecFilter[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedExecFilter[]) : [];
  } catch {
    return [];
  }
}

function persistSavedExecFilters(filters: SavedExecFilter[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(filters));
}

export function saveExecFilter(name: string, filters: ExecDashboardFilters): SavedExecFilter {
  const list = loadSavedExecFilters();
  const item: SavedExecFilter = {
    id: crypto.randomUUID(),
    name: name.trim() || "Saved Filter",
    filters,
    createdAtIso: new Date().toISOString(),
  };
  persistSavedExecFilters([item, ...list]);
  return item;
}

export function deleteExecFilter(id: string): SavedExecFilter[] {
  const next = loadSavedExecFilters().filter((f) => f.id !== id);
  persistSavedExecFilters(next);
  return next;
}

// --- Server-side (DB) Saved Filters (enterprise) ---
// Uses table: public.saved_filters
// If the table/migration isn't applied yet, we silently fall back to localStorage.

import { supabase } from "@/integrations/supabase/client";

const SCOPE = "executive_dashboards";

export async function loadSavedExecFiltersServer(userId: string): Promise<SavedExecFilter[]> {
  try {
    const { data, error } = await supabase
      .from("saved_filters")
      .select("id,name,filters,created_at")
      .eq("scope", SCOPE)
      .or(`owner_user_id.eq.${userId},is_shared.eq.true`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      filters: r.filters as ExecDashboardFilters,
      createdAtIso: new Date(r.created_at).toISOString(),
      source: 'server' as const,
    }));
  } catch {
    return [];
  }
}

export async function saveExecFilterServer(userId: string, name: string, filters: ExecDashboardFilters): Promise<SavedExecFilter | null> {
  try {
    const { data, error } = await supabase
      .from("saved_filters")
      .insert({ owner_user_id: userId, scope: SCOPE, name: name.trim() || "Saved Filter", filters })
      .select("id,name,filters,created_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      filters: data.filters as ExecDashboardFilters,
      createdAtIso: new Date((data as any).created_at).toISOString(),
      source: 'server',
    };
  } catch {
    return null;
  }
}

export async function deleteExecFilterServer(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("saved_filters").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}
