/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	test: {
		include: ['client/test-unit/**/*.test.ts'],
		environment: 'node',
	},
	resolve: {
		alias: {
			vscode: path.resolve(__dirname, 'client/test-unit/mocks/vscode.ts'),
		},
	},
});
