import { supabase } from '@/integrations/supabase/client';

export type ApiV1Error = {
  error: { code: string; message: string };
};

/**
 * Low-level helper to call the Supabase Edge Function "api-v1" with sub-routes.
 *
 * Important:
 * - We use fetch (not supabase.functions.invoke) so we can hit /api/v1/* subpaths.
 */
export async function apiV1Fetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!baseUrl) throw new Error('Missing VITE_SUPABASE_URL');

  const url = `${baseUrl}/functions/v1/api-v1${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });
  return res;
}

export async function apiV1Json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiV1Fetch(path, init);
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (payload as ApiV1Error)?.error?.message || res.statusText;
    throw new Error(err);
  }
  return payload as T;
}
