export interface RDFusionConfigSettings {
	turtle: {
		validations: Record<string, boolean>;
		autocomplete: Record<string, boolean>;
	};
	jsonld: {
		validations: Record<string, boolean>;
		autocomplete: Record<string, boolean>;
	};
}