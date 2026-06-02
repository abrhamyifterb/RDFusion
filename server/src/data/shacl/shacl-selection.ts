/* eslint-disable @typescript-eslint/no-explicit-any */
import { SH_TARGET_CLASS } from '../rdf/rdf-vocabulary';

export type ShaclSelectionMode = 'auto' | 'custom';

export interface ShaclSelectionShapeSettings {
	shapeId: string;
	enabledTargets?: string[];
	enabledTargetClasses?: string[];
	enabledPropertyShapeIds?: string[];
}

export interface ShaclSelectionSettings {
	mode: ShaclSelectionMode;
	custom?: {
		files: {
			fileUri: string;
			shapes: ShaclSelectionShapeSettings[];
		}[];
	};
}

export const DEFAULT_SHACL_SELECTION: ShaclSelectionSettings = { mode: 'auto' };

function stringArray(raw: unknown, keepEmpty = false): string[] | undefined {
	if (!Array.isArray(raw)) {
		return undefined;
	}
	const values = raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
	if (values.length === 0 && keepEmpty) {
		return [];
	}
	return values.length > 0 ? values : undefined;
}

export function normalizeShaclSelectionSettings(raw: unknown): ShaclSelectionSettings {
	if (!raw || typeof raw !== 'object') {
		return DEFAULT_SHACL_SELECTION;
	}

	const value = raw as any;
	if (value.mode !== 'custom') {
		return DEFAULT_SHACL_SELECTION;
	}

	const files = (Array.isArray(value.custom?.files) ? value.custom.files : [])
		.filter((file: any) => file && typeof file.fileUri === 'string' && file.fileUri.trim().length > 0)
		.map((file: any) => {
			const shapes = (Array.isArray(file.shapes) ? file.shapes : [])
				.filter((shape: any) => shape && typeof shape.shapeId === 'string' && shape.shapeId.trim().length > 0)
				.map((shape: any): ShaclSelectionShapeSettings => {
					const normalized: ShaclSelectionShapeSettings = { shapeId: shape.shapeId };

					const enabledTargets = stringArray(shape.enabledTargets)
						?? stringArray(shape.enabledTargetClasses)?.map(v => `${SH_TARGET_CLASS}|${v}`);
					if (enabledTargets) {
						normalized.enabledTargets = enabledTargets;
					}

					const enabledPropertyShapeIds = stringArray(
						shape.enabledPropertyShapeIds,
						Object.prototype.hasOwnProperty.call(shape, 'enabledPropertyShapeIds')
					);
					if (enabledPropertyShapeIds !== undefined) {
						normalized.enabledPropertyShapeIds = enabledPropertyShapeIds;
					}

					return normalized;
				});
			return { fileUri: file.fileUri, shapes };
		})
		.filter((file: { shapes: ShaclSelectionShapeSettings[] }) => file.shapes.length > 0);

	return { mode: 'custom', custom: { files } };
}
