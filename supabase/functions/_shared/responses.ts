import { corsHeaders } from './cors.ts';

export function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function jsonErr(code: string, message: string, status = 400, extra?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...(extra || {}) } }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
