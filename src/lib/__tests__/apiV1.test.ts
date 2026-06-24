import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
      },
    },
  };
});

import { apiV1Fetch } from '@/lib/apiV1';

describe('apiV1Fetch', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    (globalThis as any).fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  it('adds Authorization header and calls the api-v1 subroute URL', async () => {
    await apiV1Fetch('/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'x', password: 'y' }),
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toBe('https://example.supabase.co/functions/v1/api-v1/auth/sign-in');
    expect(init.method).toBe('POST');

    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
