import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { Node } from 'jsonc-parser';
import {
	walkAst,
	nodeText,
	nodeToRange
} from '../../syntax/utils.js';
import { ValidationRule } from '../../../utils.js';
import { computeLineColumn } from '../../../../../data/compute-line-column.js';

export default class DuplicateCheck implements ValidationRule {
	public readonly key = 'duplicateTriple';
	private text!: string;
	private ast!: Node;

	public init(ctx: { text: string; ast: Node }) {
		this.text = ctx.text;
		this.ast  = ctx.ast;
	}

	public run(): Diagnostic[] {
		const diags: Diagnostic[] = [];

		walkAst(this.ast, node => {
			if (node.type === 'object') {
				const seenKeys = new Map<string, Node[]>();

				for (const child of node.children ?? []) {
					if (child.type !== 'property' || !child.children) {continue;}
					const keyNode = child.children[0];
					const rawKey = nodeText(this.text, keyNode).replace(/^"|"$/g, '');
					const arr = seenKeys.get(rawKey) || [];
					arr.push(child);
					seenKeys.set(rawKey, arr);
				}

				for (const [rawKey, props] of seenKeys) {
					if (props.length <= 1) {continue;}

					for (const propNode of props) {
						const keyNode = propNode.children![0];

						const otherPositions = props
							.filter(r => r !== propNode)
							.map(r => {
								const kn = r.children![0];
								const pos = computeLineColumn(this.text, kn.offset);
								return `${pos.line+1}`;
							})
							.join(', ');

						const message = otherPositions
							? `Duplicate property “${rawKey}” also at line ${otherPositions}`
							: `Duplicate property “${rawKey}”`;

						diags.push(Diagnostic.create(
							nodeToRange(this.text, keyNode),
							`${message}`,
							DiagnosticSeverity.Warning,
							'RDFusion'
						));
					}
				}
			}
		});

		walkAst(this.ast, node => {
			if (node.type === 'array') {
				const seenVals = new Map<string, Node[]>();

				for (const elem of node.children ?? []) {
					const rawText = nodeText(this.text, elem).replace(/^"|"$/g, '');
					const arr = seenVals.get(rawText) || [];
					arr.push(elem);
					seenVals.set(rawText, arr);
				}

				for (const [literal, nodes] of seenVals) {
					if (nodes.length <= 1) {continue;}

					for (const elemNode of nodes) {
						const otherPositions = nodes
							.filter(r => r !== elemNode)
							.map(r => {
								const pos = computeLineColumn(this.text, r.offset);
								return `${pos.line+1}`;
							})
							.join(', ');

						const message = otherPositions
							? `Duplicate array value “${literal}” also at line ${otherPositions}`
							: `Duplicate array value “${literal}”`;

						diags.push(Diagnostic.create(
							nodeToRange(this.text, elemNode),
							`${message}`,
							DiagnosticSeverity.Warning,
							'RDFusion'
						));
					}
				}
			}
		});
		
		walkAst(this.ast, node => {
			if (node.type === 'property' && node.children) {
				const keyNode = node.children[0];
				const rawKey = nodeText(this.text, keyNode).replace(/^"|"$/g, '');
				if (rawKey !== '@context') {return;}

				const valNode = node.children[1];
				if (!valNode || valNode.type !== 'object') {return;}

				const iriMap = new Map<string, Node[]>();
				for (const ctxProp of valNode.children ?? []) {
					if (ctxProp.type !== 'property' || !ctxProp.children) {continue;}
					const vNode = ctxProp.children[1];
					if (!vNode || vNode.type !== 'string') {continue;}

					const rawIri = nodeText(this.text, vNode).replace(/^"|"$/g, '');
					const arr = iriMap.get(rawIri) || [];
					arr.push(vNode);
					iriMap.set(rawIri, arr);
				}

				for (const [rawIri, nodes] of iriMap) {
					if (nodes.length <= 1) {continue;}

					for (const iriNode of nodes) {
						const otherPositions = nodes
							.filter(r => r !== iriNode)
							.map(r => {
								const pos = computeLineColumn(this.text, r.offset);
								return `${pos.line+1}`;
							})
							.join(', ');

						const message = otherPositions
							? `Duplicate @context IRI “${rawIri}” also at line ${otherPositions}`
							: `Duplicate @context IRI “${rawIri}”`;

						diags.push(Diagnostic.create(
							nodeToRange(this.text, iriNode),
							`${message}`,
							DiagnosticSeverity.Warning,
							'RDFusion'
						));
					}
				}
			}
		});

		return diags;
	}
}
