import { supabase } from "@/integrations/supabase/client";

export type DashboardFlag = {
  id: string;
  target_type: "profile" | "department";
  target_id: string;
  flag_type: string;
  note: string | null;
  created_at: string;
};

export type ActionTicket = {
  id: string;
  created_at: string;
  title: string;
  description: string | null;
  severity: "low" | "medium" | "high";
  status: "open" | "in_progress" | "done";
  due_date: string | null;
  assignee_user_id: string | null;
};

export type ActionTicketTarget = {
  id: string;
  ticket_id: string;
  target_type: "profile" | "department";
  target_id: string;
  label: string | null;
};

export async function loadDashboardFlags(): Promise<DashboardFlag[]> {
  try {
    const { data, error } = await supabase
      .from("dashboard_flags")
      .select("id,target_type,target_id,flag_type,note,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []) as any;
  } catch {
    return [];
  }
}

export async function toggleProfileFlag(profileId: string, note?: string): Promise<boolean> {
  try {
    // If flag exists, delete it; otherwise create it.
    const { data: existing } = await supabase
      .from("dashboard_flags")
      .select("id")
      .eq("target_type", "profile")
      .eq("target_id", profileId)
      .limit(1);

    if (existing && existing.length) {
      const { error } = await supabase.from("dashboard_flags").delete().eq("id", existing[0].id);
      if (error) throw error;
      return true;
    }

    const { error } = await supabase.from("dashboard_flags").insert({
      target_type: "profile",
      target_id: profileId,
      flag_type: "attention",
      note: note || null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    } as any);
    if (error) throw error;
    return true;
  } catch {
    return false;
  }
}

export async function loadActionTickets(): Promise<{ tickets: ActionTicket[]; targets: ActionTicketTarget[] }> {
  try {
    const { data: tickets, error: tErr } = await supabase
      .from("action_tickets")
      .select("id,created_at,title,description,severity,status,due_date,assignee_user_id")
      .order("created_at", { ascending: false });
    if (tErr) throw tErr;

    const { data: targets, error: gErr } = await supabase
      .from("action_ticket_targets")
      .select("id,ticket_id,target_type,target_id,label");
    if (gErr) throw gErr;

    return { tickets: (tickets || []) as any, targets: (targets || []) as any };
  } catch {
    return { tickets: [], targets: [] };
  }
}

export async function createActionTicket(input: {
  title: string;
  description?: string;
  severity?: "low" | "medium" | "high";
  due_date?: string;
  assignee_user_id?: string;
  targets: Array<{ target_type: "profile" | "department"; target_id: string; label?: string }>;
}): Promise<string | null> {
  try {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data: ticket, error } = await supabase
      .from("action_tickets")
      .insert({
        title: input.title,
        description: input.description || null,
        severity: input.severity || "medium",
        due_date: input.due_date || null,
        assignee_user_id: input.assignee_user_id || null,
        created_by: uid,
      } as any)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!ticket?.id) return null;

    if (input.targets.length) {
      const rows = input.targets.map((t) => ({
        ticket_id: ticket.id,
        target_type: t.target_type,
        target_id: t.target_id,
        label: t.label || null,
      }));
      const { error: insErr } = await supabase.from("action_ticket_targets").insert(rows as any);
      if (insErr) throw insErr;
    }

    return ticket.id;
  } catch {
    return null;
  }
}
