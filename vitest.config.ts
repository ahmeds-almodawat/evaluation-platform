import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Keep Vitest focused on unit/integration tests only.
    // Playwright E2E specs must run through `npm run test:e2e`, not `npm run test`.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/tests/e2e/**',
      '**/tests-e2e/**',
      '**/playwright/**',
      '**/*.e2e.{test,spec}.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
