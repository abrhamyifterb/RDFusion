/* eslint-disable @typescript-eslint/no-explicit-any */

export function blankLineBetweenSubjects(lines:string[], cfg:any): string[]{
	if(!cfg.blankLineBetweenSubjects) {return lines;}
	const out:string[]=[]; 
	let prev=false; 
	const sub=/^[^\s@][^\s]*\s/;
	lines.forEach(l =>{ 
			const isS=sub.test(l); 
			if(isS&&prev) {
				out.push('');
			} 
			out.push(l); prev=isS; 
		});
	return out;
}