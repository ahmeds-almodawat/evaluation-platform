import type { PostgrestError } from "@supabase/supabase-js";

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 600
): Promise<T> {
  let lastErr: any = null;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // small backoff
      const delay = baseDelayMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export function isNetworkLikeError(err: any) {
  const msg = String(err?.message || err || "");
  return msg.includes("Failed to fetch") || msg.includes("NetworkError");
}

export function throwIfError(error: PostgrestError | null) {
  if (error) throw error;
}
