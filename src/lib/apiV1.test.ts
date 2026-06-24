import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-token' } },
        }),
      },
    },
  };
});

describe('apiV1Fetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the api-v1 URL and attaches the Authorization header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { apiV1Fetch } = await import('./apiV1');

    await apiV1Fetch('/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'x', password: 'y' }),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain('/functions/v1/api-v1/auth/sign-in');

    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});
