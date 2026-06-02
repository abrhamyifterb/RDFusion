interface LineIndexCacheEntry {
	input: string;
	starts: number[];
}

let lastLineIndex: LineIndexCacheEntry | undefined;

function buildLineStarts(input: string): number[] {
	const starts = [0];
	for (let i = 0; i < input.length; i++) {
		const ch = input.charCodeAt(i);
		if (ch === 13 /* \r */) {
			if (input.charCodeAt(i + 1) === 10 /* \n */) {
				i++;
			}
			starts.push(i + 1);
		} else if (ch === 10 /* \n */) {
			starts.push(i + 1);
		}
	}
	return starts;
}

function getLineStarts(input: string): number[] {
	if (lastLineIndex?.input === input) {
		return lastLineIndex.starts;
	}
	const starts = buildLineStarts(input);
	lastLineIndex = { input, starts };
	return starts;
}

export function clearLineColumnCache(): void {
	lastLineIndex = undefined;
}

export function computeLineColumn(input: string, offset: number): { line: number; character: number } {
	const starts = getLineStarts(input);
	const safeOffset = Math.max(0, Math.min(offset, input.length));
	let low = 0;
	let high = starts.length - 1;

	while (low <= high) {
		const mid = (low + high) >> 1;
		const start = starts[mid];
		const nextStart = mid + 1 < starts.length ? starts[mid + 1] : input.length + 1;
		if (safeOffset < start) {
			high = mid - 1;
		} else if (safeOffset >= nextStart) {
			low = mid + 1;
		} else {
			return { line: mid, character: safeOffset - start };
		}
	}

	const line = Math.max(0, starts.length - 1);
	return { line, character: safeOffset - starts[line] };
}
