// Scheduled jobs (cron) for reporting cache refresh + cycle reminders
// Deploy: supabase functions deploy scheduled-jobs
// Schedule via Supabase Dashboard -> Edge Functions -> scheduled-jobs -> Schedules

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

Deno.serve(async (req) => {
  try {
    // Optional: allow manual run with mode
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "all"; // all | refresh | reminders

    const results: Record<string, unknown> = { mode };

    if (mode === "all" || mode === "refresh") {
      const { error } = await supabase.rpc("system_refresh_reporting_cache", {});
      if (error) throw new Error(`refresh cache failed: ${error.message}`);
      results.refresh = "ok";
    }

    if (mode === "all" || mode === "reminders") {
      const { data, error } = await supabase.rpc("system_send_cycle_reminders", {});
      if (error) throw new Error(`send reminders failed: ${error.message}`);
      results.reminders = data ?? "ok";
    }

    return jsonResponse({ ok: true, ...results });
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: String(e) }, 500);
  }
});
