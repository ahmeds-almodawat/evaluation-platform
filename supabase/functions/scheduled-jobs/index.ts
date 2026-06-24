// Scheduled jobs (cron) for reporting cache refresh + cycle reminders
// Deploy: supabase functions deploy scheduled-jobs
// Schedule via Supabase Dashboard -> Edge Functions -> scheduled-jobs -> Schedules

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") || crypto.randomUUID();
}

function getProvidedSecret(req: Request): string {
  const authHeader = req.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return (bearerMatch?.[1] || req.headers.get("x-cron-secret") || "").trim();
}

function safeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  const len = Math.max(left.length, right.length);

  for (let i = 0; i < len; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }

  return diff === 0;
}

function jsonResponse(body: unknown, status = 200, requestId?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
  });
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);

  const expectedSecret = (Deno.env.get("CRON_SECRET") || "").trim();
  const providedSecret = getProvidedSecret(req);

  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return jsonResponse(
      {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        request_id: requestId,
      },
      401,
      requestId,
    );
  }

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

    return jsonResponse({ ok: true, request_id: requestId, ...results }, 200, requestId);
  } catch (e) {
    console.error(e);
    return jsonResponse({ ok: false, error: String(e), request_id: requestId }, 500, requestId);
  }
});
