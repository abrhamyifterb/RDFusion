import pkg from 'millan';
const { TurtleParser } = pkg;

export class ExposedTurtleParser extends TurtleParser {
	public getBase(): string | null {
		if (typeof this.base === 'function') {
		const result = this.base();
		return typeof result === 'string' ? result : null;
		}
		return (this.base as unknown) as string | null;
	}
	
	public getNamespacesMap(): Record<string, string> {
		return this.namespacesMap;
	}
}
