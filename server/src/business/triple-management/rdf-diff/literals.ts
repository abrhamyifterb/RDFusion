import { Parser as N3Parser, Writer as N3Writer, DataFactory, Quad } from 'n3';
import { XSD, INTEGER_FAMILY } from './xsd-constants';

export function canonIntegerLex(s: string): string {
	if (!s) {return '0';}
	let t = s.trim();
	let neg = false;
	if (t.startsWith('+')) {t = t.slice(1);}
	if (t.startsWith('-')) { neg = true; t = t.slice(1); }
	t = t.replace(/^0+/, '');
	if (t.length === 0) {t = '0';}
	if (t === '0') {return '0';}
	return neg ? `-${t}` : t;
}

export function canonBooleanLex(s: string): string {
	const v = s.trim().toLowerCase();
	if (v === '1')  {return 'true';}
	if (v === '0')  {return 'false';}
	if (v === 'true' || v === 'false') {return v;}
	return v;
}

export function canonDecimalLex(s: string): string {
	if (!s) {return '0';}
	let t = s.trim();
	let neg = false;

	if (t.startsWith('+')) {t = t.slice(1);}
	if (t.startsWith('-')) { neg = true; t = t.slice(1); }

	if (t.startsWith('.')) {t = '0' + t;}

	const [intRaw, fracRaw = ''] = t.split('.', 2);
	let intPart = intRaw.replace(/^0+/, '');
	let fracPart = fracRaw;

	fracPart = fracPart.replace(/0+$/, '');

	if (!intPart) {intPart = '0';}

	if (intPart === '0' && (!fracPart || /^0*$/.test(fracPart))) {
		return '0';
	}

	const body = fracPart ? `${intPart}.${fracPart}` : intPart;
	return neg ? `-${body}` : body;
	}
	
export function normalizeLiteralsNQuads(nq: string): string {
	if (!nq || !nq.trim()) {return '';}
	const parser = new N3Parser({ format: 'N-Quads' });
	const inQuads: Quad[] = parser.parse(nq);
	if (!inQuads.length) {return '';}

	const outQuads: Quad[] = [];
	for (const q of inQuads) {
		let obj = q.object;

		if (obj.termType === 'Literal') {
		const lang = obj.language;
		const dt   = obj.datatype?.value;

		if (lang) {
			const lc = lang.toLowerCase();
			if (lc !== lang) {obj = DataFactory.literal(obj.value, lc);}
		} else if (dt) {
			if (dt === XSD.string) {
				obj = DataFactory.literal(obj.value);
			} else if (dt === XSD.boolean) {
				obj = DataFactory.literal(canonBooleanLex(obj.value), DataFactory.namedNode(XSD.boolean));
			} else if (INTEGER_FAMILY.has(dt)) {
				obj = DataFactory.literal(canonIntegerLex(obj.value), DataFactory.namedNode(dt));
			} else if (dt === XSD.decimal) {
				obj = DataFactory.literal(canonDecimalLex(obj.value), DataFactory.namedNode(XSD.decimal));
			}
		}
		}

		outQuads.push(DataFactory.quad(q.subject, q.predicate, obj, q.graph));
	}

	let out = '';
	const w = new N3Writer({ format: 'N-Quads' });
	w.addQuads(outQuads);
	w.end((err, result) => { 
		if (err) {
			throw err;
		} 
		out = result || ''; 
	});
	return out;
}
