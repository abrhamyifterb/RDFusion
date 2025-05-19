export function computeLineColumn(input: string, offset: number): { line: number; character: number } {
	const lines = input.split(/\r?\n/);
	let cumulative = 0;
	for (let i = 0; i < lines.length; i++) {
		const lineLength = lines[i].length + 1;
		if (cumulative + lineLength > offset) {
			return { line: i, character: offset - cumulative };
		}
		cumulative += lineLength;
	}
	return { line: lines.length - 1, character: lines[lines.length - 1].length };
}
