export const defaultTurtleFormatConfig = {
	indentSize:               2,
	useUntypedNumeric:        true,
	useKnownPrefixes:         true,
	compactSingletonLists:    true,
	breakPredicates:          true,
	breakObjects: 			  false,
	breakSubject:             true,
	blankLineBetweenSubjects: true,
	breakPredObj:             true
};

export type TurtleFormattingKey = keyof typeof defaultTurtleFormatConfig;

export const turtleFormattingLabels: Record<TurtleFormattingKey,string> = {
	indentSize: "Spaces per indent level for predicate lines",
	useUntypedNumeric: "Emit numeric and boolean literals untyped",
	useKnownPrefixes: "Refactor full IRIs into prefix form if available",	
	blankLineBetweenSubjects: "Insert extra blank line between subject blocks",
	breakSubject: "Place subject on its own line",
	breakPredicates: "Place each predicate - object pair on its own line",
	breakPredObj: "Align Predicate-Object-List",
	breakObjects: "Split comma separated object lists on to their own line",
	compactSingletonLists: "Render single element lists as '(item)'",
};