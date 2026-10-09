/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('Should get diagnostics', () => {
	const docUri = getDocUri('diagnostics.ttl');

	test('reports an invalid Turtle datatype', async () => {
		await activate(docUri);
		const diagnostics = await waitForDiagnostics(docUri);

		assert.ok(diagnostics.length > 0, 'Expected RDFusion to publish a diagnostic.');
		assert.ok(
			diagnostics.some(diagnostic => diagnostic.message.includes('Invalid lexical form')),
			'Expected an invalid XSD lexical form diagnostic.',
		);
	});
});

async function waitForDiagnostics(docUri: vscode.Uri): Promise<readonly vscode.Diagnostic[]> {
	const timeoutAt = Date.now() + 10_000;
	while (Date.now() < timeoutAt) {
		const diagnostics = vscode.languages.getDiagnostics(docUri);
		if (diagnostics.length > 0) {
			return diagnostics;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	return vscode.languages.getDiagnostics(docUri);
}
