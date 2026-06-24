import { vi } from 'vitest';

// Reasonable defaults for unit tests. Individual tests can override.
vi.stubEnv('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL || 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key');
vi.stubEnv('VITE_SENTRY_DSN', process.env.VITE_SENTRY_DSN || '');
