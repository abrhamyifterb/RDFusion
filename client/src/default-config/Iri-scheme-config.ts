export const defaultIriSchemeConfig = {
	iriSchemeCheck:    true,
	strictSchemeCheck: false,
	customIriScheme: "http, https, mailto, tel"
};
export type IriSchemeConfigKey = keyof typeof defaultIriSchemeConfig;

export const IriSchemeConfigLabels: Record<IriSchemeConfigKey,string> = {
	iriSchemeCheck: "Check for non-standard or uncommon IRI schemes",
	strictSchemeCheck: "Enable strict mode to only allow custom defined IRI schemes",
	customIriScheme: "Define a custom comma separated whitelist of allowed IRI schemes, like http, https, mailto, tel"
};