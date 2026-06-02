/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['server/src/test/performance/**/*.perf.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, 'server/src'),
    },
  },
});
