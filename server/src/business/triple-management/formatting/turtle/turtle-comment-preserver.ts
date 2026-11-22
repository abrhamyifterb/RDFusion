import type { ParsedGraph, TurtleComment } from '../../../../data/irdf-parser.js';
import { ExposedTurtleParser } from '../../../../data/turtle/exposed-turtle-parser.js';

const MARKER_PREFIX = '__RDFUSION_TURTLE_COMMENT_';

interface PositionedSubject {
	id: string;
	offset: number;
}

export interface TurtleCommentPlan {
	header: TurtleComment[];
	footer: TurtleComment[];
	commentsBeforeSubject: Map<string, string[]>;
	markerComments: Map<string, TurtleComment>;
}

export class TurtleCommentPreservationError extends Error {
	constructor() {
		super('Formatting was cancelled because RDFusion could not preserve every Turtle comment safely.');
		this.name = 'TurtleCommentPreservationError';
	}
}

function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {starts.push(i + 1);}
	}
	return starts;
}

function positionOffset(
	starts: number[],
	position: { startLine?: number; startColumn?: number } | undefined,
): number | undefined {
	if (!position?.startLine || !position.startColumn) {return undefined;}
	const lineStart = starts[position.startLine - 1];
	return lineStart === undefined ? undefined : lineStart + position.startColumn - 1;
}

function subjectInRange(
	subjects: PositionedSubject[],
	startExclusive: number,
	endInclusive: number,
): PositionedSubject | undefined {
	return subjects
		.filter(subject => subject.offset > startExclusive && subject.offset <= endInclusive)
		.sort((a, b) => a.offset - b.offset)[0];
}

function statementBounds(periodOffsets: number[], offset: number): { previous: number; next?: number; beforePrevious: number } {
	const previousPeriods = periodOffsets.filter(period => period < offset);
	const previous = previousPeriods.at(-1) ?? -1;
	return {
		previous,
		beforePrevious: previousPeriods.at(-2) ?? -1,
		next: periodOffsets.find(period => period >= offset),
	};
}

function hasCodeBeforeCommentOnLine(sourceText: string, comment: TurtleComment): boolean {
	const lineStart = sourceText.lastIndexOf('\n', Math.max(0, comment.startOffset - 1)) + 1;
	return sourceText.slice(lineStart, comment.startOffset).trim().length > 0;
}

export function createTurtleCommentPlan(sourceText: string, parsed: ParsedGraph): TurtleCommentPlan {
	const comments = [...(parsed.comments ?? [])].sort((a, b) => a.startOffset - b.startOffset);
	const starts = lineStarts(sourceText);
	const subjectOccurrences = new Map<string, PositionedSubject>();

	for (const quad of parsed.quads) {
		const offset = positionOffset(starts, quad.positionToken);
		const id = quad.subject?.value;
		if (offset === undefined || typeof id !== 'string') {continue;}
		subjectOccurrences.set(`${id}\u0000${offset}`, { id, offset });
	}

	const subjects = Array.from(subjectOccurrences.values()).sort((a, b) => a.offset - b.offset);
	const periodOffsets = parsed.tokens
		.filter(token => token.type === 'Period' && typeof token.endOffset === 'number')
		.map(token => token.endOffset as number)
		.sort((a, b) => a - b);
	const firstSubjectOffset = subjects[0]?.offset ?? Number.POSITIVE_INFINITY;
	const sourceTokens = parsed.tokens
		.filter(token => typeof token.startOffset === 'number')
		.sort((a, b) => a.startOffset - b.startOffset);
	const firstTokenOffset = sourceTokens[0]?.startOffset ?? Number.POSITIVE_INFINITY;
	const lastTokenEndOffset = sourceTokens.at(-1)?.endOffset ?? -1;

	const plan: TurtleCommentPlan = {
		header: [],
		footer: [],
		commentsBeforeSubject: new Map(),
		markerComments: new Map(),
	};

	comments.forEach((comment, index) => {
		const bounds = statementBounds(periodOffsets, comment.startOffset);
		let subject: PositionedSubject | undefined;

		if (hasCodeBeforeCommentOnLine(sourceText, comment) && bounds.previous >= 0) {
			subject = subjectInRange(subjects, bounds.beforePrevious, bounds.previous);
		}
		if (!subject && bounds.next !== undefined) {
			subject = subjectInRange(subjects, bounds.previous, bounds.next);
		}

		if (!subject) {
			if (
				comment.startOffset < firstSubjectOffset
				&& (subjects.length > 0 || comment.startOffset < firstTokenOffset || comment.startOffset <= lastTokenEndOffset)
			) {plan.header.push(comment);}
			else {plan.footer.push(comment);}
			return;
		}

		const marker = `${MARKER_PREFIX}${index}__`;
		const markers = plan.commentsBeforeSubject.get(subject.id) ?? [];
		markers.push(marker);
		plan.commentsBeforeSubject.set(subject.id, markers);
		plan.markerComments.set(marker, comment);
	});

	return plan;
}

export function restoreTurtleComments(formattedText: string, plan: TurtleCommentPlan): string {
	const restored: string[] = [];
	const restoredMarkers = new Set<string>();

	for (const line of formattedText.split(/\r?\n/)) {
		const marker = line.trim();
		const comment = plan.markerComments.get(marker);
		if (comment) {
			restored.push(comment.image);
			restoredMarkers.add(marker);
		} else {
			restored.push(line);
		}
	}

	while (restored.at(-1) === '') {restored.pop();}
	const unplaced = Array.from(plan.markerComments)
		.filter(([marker]) => !restoredMarkers.has(marker))
		.map(([, comment]) => comment);
	const footer = [...plan.footer, ...unplaced].sort((a, b) => a.startOffset - b.startOffset);
	const output = [
		...plan.header.map(comment => comment.image),
		...restored,
		...footer.map(comment => comment.image),
	];

	return output.join('\n').trimEnd() + '\n';
}

export function assertTurtleCommentsPreserved(output: string, expected: readonly TurtleComment[]): void {
	const actual = new ExposedTurtleParser().getCommentTokens(output);
	const counts = (comments: readonly TurtleComment[]) => {
		const result = new Map<string, number>();
		for (const comment of comments) {result.set(comment.image, (result.get(comment.image) ?? 0) + 1);}
		return Array.from(result.entries()).sort(([left], [right]) => left.localeCompare(right));
	};

	if (JSON.stringify(counts(actual)) !== JSON.stringify(counts(expected))) {
		throw new TurtleCommentPreservationError();
	}
}
