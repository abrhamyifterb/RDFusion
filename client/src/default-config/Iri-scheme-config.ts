export const defaultIriSchemeConfig = {
	iriSchemeCheck:    true,
	strictSchemeCheck: false,
	customIriScheme: "http, https, mailto, tel"
};
export type IriSchemeConfigKey = keyof typeof defaultIriSchemeConfig;

export const IriSchemeConfigLabels: Record<IriSchemeConfigKey,string> = {
	iriSchemeCheck: "Check for non-standard or uncommon IRI schemes",
	strictSchemeCheck: "Use only the custom allowed IRI schemes",
	customIriScheme: "Allowed IRI schemes, comma-separated, for example: http, https, mailto, tel"
};