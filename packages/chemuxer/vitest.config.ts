import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'server/src/__tests__/**/*.test.ts',
      'client/src/__tests__/**/*.test.{ts,tsx}',
    ],
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    environmentMatchGlobs: [
      ['server/src/__tests__/**', 'node'],
    ],
    setupFiles: ['client/src/__tests__/setup.ts'],
  },
});
