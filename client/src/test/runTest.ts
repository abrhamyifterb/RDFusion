/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'path';
import { readFileSync, rmSync } from 'fs';

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

const vscodeVersion = '1.141.0';

async function main() {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '../../../');

		const extensionTestsPath = path.resolve(__dirname, './index');
		const testResultPath = path.resolve(extensionDevelopmentPath, '.vscode-test', 'extension-test-result.json');
		rmSync(testResultPath, { force: true });
		const downloadedExecutable = await downloadAndUnzipVSCode(vscodeVersion);
		const vscodeExecutablePath = process.platform === 'linux'
			? path.join(path.dirname(downloadedExecutable), 'bin', 'code')
			: downloadedExecutable;

		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
			extensionTestsEnv: { RDFUSION_TEST_RESULT_PATH: testResultPath },
			launchArgs: ['--wait'],
		});

		const result = JSON.parse(readFileSync(testResultPath, 'utf8')) as {
			status?: string;
			error?: string;
		};
		if (result.status !== 'passed') {
			throw new Error(result.error || 'VS Code extension tests did not pass.');
		}
	} catch (error) {
		console.error('Failed to run VS Code extension tests');
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}

main();
