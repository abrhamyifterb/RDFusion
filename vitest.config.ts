/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      exclude: ['**/test/**', '**/*.d.ts']
    },
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, 'server/src'),
    }
  }
});
