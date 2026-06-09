import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'server/src/__tests__/**/*.test.ts',
      'client/src/__tests__/**/*.test.{ts,tsx}',
      'shared/__tests__/**/*.test.ts',
    ],
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['server/src/__tests__/**', 'node'],
      ['shared/__tests__/**', 'node'],
    ],
    setupFiles: ['client/src/__tests__/setup.ts'],
  },
});
