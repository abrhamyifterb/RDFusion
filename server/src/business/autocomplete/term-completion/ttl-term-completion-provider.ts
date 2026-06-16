import {
	CompletionItem,
	Connection,
	TextDocumentPositionParams,
	TextDocuments
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ICompletionProvider } from '../icompletion-provider';
import { TermProvider } from './term-provider';
import { RDFusionConfigSettings } from '../../../utils/irdfusion-config-settings';
import type { TermMetadata, TermMetadataService } from '../term-metadata/term-metadata-service.js';
import {
	completionKindForSemanticRole,
	isClassOnlyTerm,
	roleSortPrefix,
	termSemanticKind,
} from '../term-metadata/term-semantic-kind.js';
import {
	TurtleCompletionContext,
	TurtleCompletionContextResolver,
	TurtleCompletionRole,
} from '../context/turtle-completion-context.js';

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTurtlePrefixNamespace(text: string, prefix: string): string | undefined {
	const escapedPrefix = escapeRegExp(prefix);
	const patterns = [
		new RegExp(`(?:^|\\n)\\s*@prefix\\s+${escapedPrefix}:\\s*<([^>]+)>\\s*\\.`, 'i'),
		new RegExp(`(?:^|\\n)\\s*PREFIX\\s+${escapedPrefix}:\\s*<([^>]+)>`, 'i'),
	];
	for (const pattern of patterns) {
		const match = text.match(pattern);
		if (match?.[1]) return match[1];
	}
	return undefined;
}

function roleScore(role: TurtleCompletionRole, metadata?: TermMetadata): number {
	const kind = termSemanticKind(metadata);
	if (role === 'predicate') {
		if (kind === 'shacl-field') return 0;
		if (kind === 'property') return 1;
		if (kind === 'unknown') return 3;
		return 9;
	}
	if (role === 'subject') {
		if (kind === 'class' || kind === 'resource') return 0;
		if (kind === 'unknown') return 2;
		return 4;
	}
	if (role === 'object') {
		if (kind === 'class' || kind === 'resource') return 0;
		if (kind === 'unknown') return 2;
		return 4;
	}
	return 1;
}

function shouldIncludeTermForRole(role: TurtleCompletionRole, metadata?: TermMetadata): boolean {
	if (role === 'predicate') {
		return !isClassOnlyTerm(metadata);
	}
	return true;
}

function roleDetailLabel(role: TurtleCompletionRole, metadata?: TermMetadata): string {
	const kind = termSemanticKind(metadata);
	const semantic = kind === 'shacl-field' ? 'SHACL field'
		: kind === 'property' ? 'property'
		: kind === 'class' ? 'class'
		: kind === 'resource' ? 'resource'
		: 'term';
	return role === 'unknown' ? semantic : `${semantic} for ${role}`;
}

function shouldOfferTerms(context: TurtleCompletionContext): boolean {
	return !context.inComment
		&& !context.inLiteral
		&& !context.inPrefixDeclaration
		&& context.role !== 'comment'
		&& context.role !== 'literal'
		&& context.role !== 'prefix'
		&& !!context.tokenPrefix;
}

export class TtlTermCompletionProvider implements ICompletionProvider {
	private configSettings: RDFusionConfigSettings;
	private contextResolver: TurtleCompletionContextResolver;

	constructor(
		private termProvider: TermProvider,
		private connection: Connection,
		initialSettings: RDFusionConfigSettings,
		private termMetadata?: TermMetadataService,
		contextResolver?: TurtleCompletionContextResolver,
	) {
		this.configSettings = initialSettings;
		this.contextResolver = contextResolver ?? new TurtleCompletionContextResolver();
	}

	public async provide(
		params: TextDocumentPositionParams,
		documents: TextDocuments<TextDocument>
	): Promise<CompletionItem[]> {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) {return [];}

		const context = this.contextResolver.resolve(doc, params.position);
		if (!shouldOfferTerms(context)) {return [];}

		const prefix = context.tokenPrefix!;
		const fragment = context.tokenFragment ?? '';
		const namespaceIri = findTurtlePrefixNamespace(doc.getText(), prefix);
		const terms = await this.termProvider.getTermsFor(prefix, this.connection, namespaceIri, 'turtle');
		const candidates = terms
			.filter(term => term.startsWith(fragment))
			.slice(0, 200)
			.map(term => {
				const metadata = this.termMetadata?.getMetadata(prefix, term, {
					source: 'context',
					role: context.role === 'subject' || context.role === 'predicate' || context.role === 'object'
						? context.role
						: 'unknown',
					namespaceIri,
					syntax: 'turtle',
				});
				if (!shouldIncludeTermForRole(context.role, metadata)) {
					return undefined;
				}
				const score = roleScore(context.role, metadata);
				const semanticKind = termSemanticKind(metadata);
				const item: CompletionItem = {
					label: `${term}`,
					kind: completionKindForSemanticRole(context.role === 'subject' || context.role === 'predicate' || context.role === 'object' ? context.role : 'unknown', metadata),
					insertText: term,
					detail: `${roleDetailLabel(context.role, metadata)} from ${prefix}`,
					sortText: `${roleSortPrefix(score)}_${semanticKind}_${term}`,
					data: {
						rdfusionContext: {
							role: context.role,
								semanticKind,
							prefix,
							fragment,
						},
					},
				};
				return this.termMetadata?.enrichCompletionItem(item, prefix, term, {
					source: 'context',
					role: context.role === 'subject' || context.role === 'predicate' || context.role === 'object'
						? context.role
						: 'unknown',
					namespaceIri,
					syntax: 'turtle',
				}) ?? item;
			})
			.filter((item): item is CompletionItem => !!item)
			.sort((a, b) => String(a.sortText ?? a.label).localeCompare(String(b.sortText ?? b.label)));

		return candidates.slice(0, 50);
	}

	public updateSettings(newSettings: RDFusionConfigSettings) {
		this.configSettings = newSettings;
	}
}
