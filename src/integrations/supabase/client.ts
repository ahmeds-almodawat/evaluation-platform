import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * IMPORTANT:
 * - In production you MUST set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY on Vercel.
 * - If not configured, we export a “safe stub” so the app does not white-screen.
 */
function makeStub(): SupabaseClient {
  const err = () =>
    new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel Environment Variables, then redeploy.'
    );

  const stub: any = {
    from: () => ({
      select: async () => ({ data: null, error: err() }),
      update: async () => ({ data: null, error: err() }),
      insert: async () => ({ data: null, error: err() }),
      upsert: async () => ({ data: null, error: err() }),
      delete: async () => ({ data: null, error: err() }),
      eq: () => stub.from(),
      single: async () => ({ data: null, error: err() }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: err() }),
        update: async () => ({ data: null, error: err() }),
        remove: async () => ({ data: null, error: err() }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    functions: {
      invoke: async () => ({ data: null, error: err() }),
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: err() }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: null, error: err() }),
      signOut: async () => ({ error: err() }),
    },
  };

  return stub as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : makeStub();
