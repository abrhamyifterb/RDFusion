export interface RDFusionConfigSettings {
	turtle: {
		validations: Record<string, boolean>;
		autocomplete: Record<string, boolean>;
		formatting: Record<string, boolean | number>;
	};
	jsonld: {
		validations: Record<string, boolean>;
		autocomplete: Record<string, boolean>;
	};
	common: {
		validations: Record<string, boolean | string>;
	}
}