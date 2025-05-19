export const RE_BLANK        = /^\s*$/;
export const RE_AFTER_SEMI   = /;\s*$/;
export const RE_HEAD_LINE    = /^\s*(<[^>]+>|[A-Za-z][\w-]*:[\w-]+)\s+a\s+(<[^>]+>|[A-Za-z][\w-]*:[\w-]+)\s*;?$/;
export const RE_SUBJECT_ONLY = /^\s*(<[^>]+>|[A-Za-z][\w-]*:[\w-]+)\s*$/;
export const RE_PRED_START   = /^\s*(<[^>]+>|[A-Za-z][\w-]*:[\w-]*)$/;

export function inTriggerContext(
	text: string,
	subjectEnd: number,
	declOffset: number,
	cursorOff: number,
	dotOffset: number
): boolean {
	if (cursorOff <= subjectEnd) return false;

	if (dotOffset < Infinity && cursorOff > dotOffset) return false;

	let i = cursorOff - 1;
	while (i > subjectEnd && /\s/.test(text.charAt(i))) {
		i--;
	}

	if (i <= subjectEnd) {
		return true;
	}
	
	return text.charAt(i) === ';';
}
