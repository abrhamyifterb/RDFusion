/* eslint-disable @typescript-eslint/no-explicit-any */
import { Position, TextEdit, WorkspaceEdit } from 'vscode-languageserver';

export function declarePrefixAtTop(
	uri: string,
	prefix: string,
	iri: string,
	doc: any,
	applyEdit: (edit: WorkspaceEdit) => Promise<unknown>
) {
	if (!doc) {return;}
	const text = doc.getText();
	if (new RegExp(`@prefix\\s+${prefix}:`).test(text)) {return;}

	const edit: WorkspaceEdit = {
		changes: {
		[uri]: [
			TextEdit.insert(Position.create(0,0),
			`@prefix ${prefix}: <${iri}> .\n`
			)
		]
		}
	};
	applyEdit(edit).catch(() => {
		// console.log(`Something went wrong with prefix - ${prefix} declaration`);
	});
}
