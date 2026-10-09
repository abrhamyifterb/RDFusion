/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as assert from 'assert';
import { getDocUri, activate } from './helper';

suite('RDFusion extension activation', () => {
	const docUri = getDocUri('commands.ttl');

	test('registers core Turtle commands', async () => {
		await activate(docUri);
		const commands = await vscode.commands.getCommands(true);

		assert.ok(commands.includes('rdfusion.formatTriples'));
		assert.ok(commands.includes('rdfusion.groupBySubject'));
	});
});
