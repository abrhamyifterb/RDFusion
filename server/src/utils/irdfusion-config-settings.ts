import type { ShaclSelectionSettings } from "../data/shacl/shacl-selection.js";
import {
  DEFAULT_SHACL_SELECTION,
  normalizeShaclSelectionSettings,
} from "../data/shacl/shacl-selection.js";

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
  };
  shacl: {
    selection: ShaclSelectionSettings;
  };
  performance: {
    trace: boolean;
  };
}

function recordOrEmpty<T extends string | number | boolean>(
  raw: unknown,
): Record<string, T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, T>;
}

export function defaultRDFusionConfigSettings(): RDFusionConfigSettings {
  return {
    turtle: { validations: {}, autocomplete: {}, formatting: {} },
    jsonld: { validations: {}, autocomplete: {} },
    common: { validations: {} },
    shacl: { selection: DEFAULT_SHACL_SELECTION },
    performance: { trace: false },
  };
}

export function normalizeRDFusionConfigSettings(
  raw: unknown,
): RDFusionConfigSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    turtle: {
      validations: recordOrEmpty<boolean>((value.turtle as Record<string, unknown> | undefined)?.validations),
      autocomplete: recordOrEmpty<boolean>((value.turtle as Record<string, unknown> | undefined)?.autocomplete),
      formatting: recordOrEmpty<boolean | number>((value.turtle as Record<string, unknown> | undefined)?.formatting),
    },
    jsonld: {
      validations: recordOrEmpty<boolean>((value.jsonld as Record<string, unknown> | undefined)?.validations),
      autocomplete: recordOrEmpty<boolean>((value.jsonld as Record<string, unknown> | undefined)?.autocomplete),
    },
    common: {
      validations: recordOrEmpty<boolean | string>((value.common as Record<string, unknown> | undefined)?.validations),
    },
    shacl: {
      selection: normalizeShaclSelectionSettings((value.shacl as Record<string, unknown> | undefined)?.selection),
    },
    performance: {
      trace: (value.performance as Record<string, unknown> | undefined)?.trace === true,
    },
  };
}
