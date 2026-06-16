import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Optional idempotency helper.
 * Requires `public.api_idempotency` table (added in the integration readiness migration).
 */
export async function readIdempotency(
  adminClient: ReturnType<typeof createClient>,
  clientId: string,
  key: string,
) {
  const { data, error } = await adminClient
    .from('api_idempotency')
    .select('response_status,response_body')
    .eq('client_id', clientId)
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return null;
  return data as { response_status: number; response_body: any };
}

export async function writeIdempotency(
  adminClient: ReturnType<typeof createClient>,
  params: { client_id: string; key: string; request_hash?: string; response_status: number; response_body: any },
) {
  try {
    await adminClient.from('api_idempotency').upsert({
      client_id: params.client_id,
      key: params.key,
      request_hash: params.request_hash ?? null,
      response_status: params.response_status,
      response_body: params.response_body,
    }, { onConflict: 'client_id,key' });
  } catch (_e) {}
}
