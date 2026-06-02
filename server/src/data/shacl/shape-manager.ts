/* eslint-disable @typescript-eslint/no-explicit-any */
import { Connection } from "vscode-languageserver/node.js";
import { IShapeExtractor, ShaclShape } from "./ishape-extractor";
import {
  isTargetPredicate,
  ShaclShapeExtractor,
  targetKey,
} from "./shacl-shape-extractor.js";
import { JsonldParsedGraph, ParsedGraph } from "../irdf-parser";
import { DataManager } from "../data-manager";
import {
  DEFAULT_SHACL_SELECTION,
  ShaclSelectionSettings,
  normalizeShaclSelectionSettings,
} from "./shacl-selection.js";
import { PerformanceTracer } from "../../utils/performance-trace.js";
import { SH_NS, SH_PROPERTY } from '../rdf/rdf-vocabulary';

const SHACL_NAMESPACE = SH_NS;

export interface ListShapesResponse {
  selection: ShaclSelectionSettings;
  revision: number;
  files: {
    uri: string;
    fileName: string;
    shapeCount: number;
    targetCount: number;
    propertyCount: number;
    shapes: ShapeListItem[];
    /** Compatibility payload for older panel code. Prefer shapes[].targets. */
    targetGroups: {
      targetKey: string;
      targetLabel: string;
      targetDisplay: string;
      shapes: ShapeListItem[];
    }[];
  }[];
}

export interface ShapeListItem {
  id: string;
  subjectValue: string;
  label: string;
  name?: string;
  description?: string;
  targetKeys: string[];
  targets: ShapeTargetSummary[];
  properties: ShapePropertySummary[];
}

export interface ShapeTargetSummary {
  key: string;
  value: string;
  display: string;
}

export interface ShapePropertySummary {
  id: string;
  path?: string;
  pathDisplay: string;
  label: string;
  summary: string;
}

export interface ShapePropertyMetadata extends ShapePropertySummary {
  shapeId: string;
  shapeLabel: string;
  shapeName?: string;
  sourceUri: string;
  targetDisplays: string[];
}

interface ShapeSummary {
  id: string;
  subject: string;
  label?: string;
  name?: string;
  description?: string;
  targets: ShapeTargetSummary[];
  properties: ShapePropertySummary[];
}

export interface ListShapesOptions {
  /**
   * Older panel versions consumed targetGroups. The current panel consumes
   * files[].shapes directly. Keep the compatibility payload opt-in so the
   * large-workspace path does not duplicate every shape under every target.
   */
  includeTargetGroups?: boolean;
}

function fileNameFromUri(uri: string): string {
  try {
    const decoded = decodeURIComponent(uri);
    const clean = decoded.replace(/^file:\/\//, "");
    return clean.split(/[\\/]/).filter(Boolean).pop() ?? uri;
  } catch {
    return uri.split(/[\\/]/).filter(Boolean).pop() ?? uri;
  }
}

function cloneShape(shape: ShaclShape): ShaclShape {
  return {
    ...shape,
    targets: [...shape.targets],
    properties: [...shape.properties],
    quads: [...shape.quads],
  };
}

function toSummary(shape: ShaclShape): ShapeSummary {
  return {
    id: shape.id,
    subject: shape.subject,
    label: shape.label,
    name: shape.name,
    description: shape.description,
    targets: shape.targets.map((target) => ({
      key: target.key,
      value: target.value,
      display: target.display,
    })),
    properties: shape.properties.map((property) => ({
      id: property.id,
      path: property.path,
      pathDisplay: property.pathDisplay,
      label: property.label,
      summary: property.summary,
    })),
  };
}

export class ShapeManager {
  /** Full validation payloads, including quad arrays needed by shacl-engine. */
  private validationIndex = new Map<string, ShaclShape[]>();
  /** Compact UI/listing payloads. listShapes never touches full quad arrays. */
  private summaryIndex = new Map<string, ShapeSummary[]>();
  private shapeExtractor: IShapeExtractor;
  private revision = 0;
  private fileSignatures = new Map<string, string>();

  constructor(
    private connection: Connection,
    private tracer?: PerformanceTracer,
  ) {
    this.shapeExtractor = new ShaclShapeExtractor();
  }

  updateShapeIndex(
    uri: string,
    parsedGraph: ParsedGraph | JsonldParsedGraph,
  ): void {
    const update = () => {
      const before = this.fileSignatures.get(uri);

      if (!this.mayContainShaclShapes(parsedGraph)) {
        this.validationIndex.delete(uri);
        this.summaryIndex.delete(uri);
        this.fileSignatures.delete(uri);
        if (before !== undefined) {
          this.revision++;
        }
        return { shapes: 0, quads: 0, skippedExtractor: true };
      }

      const validationShapes = this.shapeExtractor
        .extractShapes(parsedGraph)
        .map((shape) => ({ ...shape, sourceUri: uri }));
      const summaries = validationShapes.map(toSummary);
      const after = this.buildFileSignature(summaries, validationShapes);

      if (validationShapes.length > 0) {
        this.validationIndex.set(uri, validationShapes);
        this.summaryIndex.set(uri, summaries);
        this.fileSignatures.set(uri, after);
      } else {
        this.validationIndex.delete(uri);
        this.summaryIndex.delete(uri);
        this.fileSignatures.delete(uri);
      }

      if (before !== after) {
        this.revision++;
      }
      return {
        shapes: validationShapes.length,
        quads: validationShapes.reduce(
          (total, shape) => total + shape.quads.length,
          0,
        ),
        skippedExtractor: false,
      };
    };

    const result = this.tracer
      ? this.tracer.timeSync("shape.updateIndex", update, { uri })
      : update();
    this.tracer?.log("shape.indexed", {
      uri,
      shapes: result.shapes,
      quads: result.quads,
      revision: this.revision,
      skippedExtractor: result.skippedExtractor,
    });
  }

  private mayContainShaclShapes(
    parsedGraph: ParsedGraph | JsonldParsedGraph,
  ): boolean {
    for (const quad of parsedGraph.quads ?? []) {
      const predicate = quad?.predicate?.value ?? "";
      const object = quad?.object?.value ?? "";
      if (
        predicate.startsWith(SHACL_NAMESPACE) ||
        object.startsWith(SHACL_NAMESPACE)
      ) {
        return true;
      }
    }
    return false;
  }

  removeShapeIndex(uri: string): void {
    const hadValidation = this.validationIndex.delete(uri);
    const hadSummary = this.summaryIndex.delete(uri);
    if (hadValidation || hadSummary) {
      this.fileSignatures.delete(uri);
      this.revision++;
    }
  }

  refreshGlobalIndex(dataManager: DataManager): void {
    for (const snapshot of dataManager.getAllSnapshots()) {
      this.updateShapeIndex(snapshot.uri, snapshot.parsedGraph);
    }
  }

  getGlobalShapes(): ShaclShape[] {
    return Array.from(this.validationIndex.values()).flat().map(cloneShape);
  }

  getShapeCountForUri(uri: string): number {
    return this.summaryIndex.get(uri)?.length ?? 0;
  }

  getTotalShapeCount(): number {
    let total = 0;
    for (const shapes of this.summaryIndex.values()) {
      total += shapes.length;
    }
    return total;
  }

  getIndexedShapeUris(): Set<string> {
    return new Set(this.summaryIndex.keys());
  }

  hasShapeIndex(uri: string): boolean {
    return this.summaryIndex.has(uri);
  }

  getRevision(): number {
    return this.revision;
  }


  getPropertyMetadataForIri(
    iri: string,
    selection: ShaclSelectionSettings = DEFAULT_SHACL_SELECTION,
  ): ShapePropertyMetadata[] {
    const normalized = normalizeShaclSelectionSettings(selection);
    const out: ShapePropertyMetadata[] = [];

    const selectedByFile = new Map<string, Map<string, {
      enabledTargets?: Set<string>;
      enabledPropertyShapeIds?: Set<string>;
    }>>();
    if (normalized.mode === "custom") {
      const files = normalized.custom?.files ?? [];
      if (files.length === 0) {
        return [];
      }
      for (const file of files) {
        const shapes = new Map<string, {
          enabledTargets?: Set<string>;
          enabledPropertyShapeIds?: Set<string>;
        }>();
        for (const shape of file.shapes) {
          shapes.set(shape.shapeId, {
            enabledTargets: shape.enabledTargets === undefined ? undefined : new Set(shape.enabledTargets),
            enabledPropertyShapeIds: shape.enabledPropertyShapeIds === undefined ? undefined : new Set(shape.enabledPropertyShapeIds),
          });
        }
        selectedByFile.set(file.fileUri, shapes);
      }
    }

    for (const [sourceUri, shapes] of this.summaryIndex.entries()) {
      const selectedShapes = normalized.mode === "custom" ? selectedByFile.get(sourceUri) : undefined;
      if (normalized.mode === "custom" && !selectedShapes) {
        continue;
      }

      for (const shape of shapes) {
        const selectedShape = normalized.mode === "custom"
          ? selectedShapes?.get(shape.id) ?? selectedShapes?.get(shape.subject)
          : undefined;
        if (normalized.mode === "custom" && !selectedShape) {
          continue;
        }

        const targetDisplays = selectedShape?.enabledTargets
          ? shape.targets.filter((target) => selectedShape.enabledTargets?.has(target.key)).map((target) => target.display)
          : shape.targets.map((target) => target.display);
        if (selectedShape?.enabledTargets && targetDisplays.length === 0) {
          continue;
        }

        for (const property of shape.properties) {
          if (property.path !== iri) {
            continue;
          }
          if (selectedShape?.enabledPropertyShapeIds && !selectedShape.enabledPropertyShapeIds.has(property.id)) {
            continue;
          }
          out.push({
            ...property,
            shapeId: shape.id,
            shapeLabel: shape.label ?? shape.id,
            shapeName: shape.name,
            sourceUri,
            targetDisplays,
          });
        }
      }
    }
    return out.sort((a, b) =>
      `${a.shapeName ?? a.shapeLabel}:${a.label}`.localeCompare(`${b.shapeName ?? b.shapeLabel}:${b.label}`),
    );
  }

  getSelectedShapes(
    selection: ShaclSelectionSettings = DEFAULT_SHACL_SELECTION,
  ): ShaclShape[] {
    const normalized = normalizeShaclSelectionSettings(selection);
    if (normalized.mode !== "custom") {
      return this.getGlobalShapes();
    }

    const selectedFiles = normalized.custom?.files ?? [];
    if (selectedFiles.length === 0) {
      return [];
    }

    const out: ShaclShape[] = [];
    for (const file of selectedFiles) {
      const indexed = this.validationIndex.get(file.fileUri) ?? [];
      for (const selectedShape of file.shapes) {
        const shape = indexed.find(
          (s) =>
            s.id === selectedShape.shapeId ||
            s.subject === selectedShape.shapeId,
        );
        if (!shape) continue;

        const next = cloneShape(shape);

        if (selectedShape.enabledTargets !== undefined) {
          const targetSet = new Set(selectedShape.enabledTargets);
          next.targets = next.targets.filter((t) => targetSet.has(t.key));
          next.quads = next.quads.filter((q) => {
            const predicate = q.predicate?.value ?? "";
            if (!isTargetPredicate(predicate)) return true;
            return targetSet.has(targetKey(predicate, q.object?.value ?? ""));
          });
        }

        if (selectedShape.enabledPropertyShapeIds !== undefined) {
          const propSet = new Set(selectedShape.enabledPropertyShapeIds);
          const allowedSubjects = this.collectSelectedPropertyClosure(
            next.quads,
            next.subject,
            propSet,
          );
          next.properties = next.properties.filter((p) => propSet.has(p.id));
          next.quads = next.quads.filter((q) => {
            const subject = q.subject?.value ?? "";
            const predicate = q.predicate?.value ?? "";
            const object = q.object?.value ?? "";
            if (
              subject === next.subject &&
              predicate === SH_PROPERTY
            ) {
              return propSet.has(object);
            }
            if (subject === next.subject) {
              return true;
            }
            return allowedSubjects.has(subject);
          });
        }

        if (
          next.targets.length > 0 ||
          selectedShape.enabledTargets === undefined
        ) {
          out.push(next);
        }
      }
    }

    return out;
  }

  private collectSelectedPropertyClosure(
    quads: any[],
    rootSubject: string,
    selectedPropertyIds: Set<string>,
  ): Set<string> {
    const subjectsWithQuads = new Set(
      quads.map((q) => q.subject?.value ?? "").filter(Boolean),
    );
    const allowed = new Set<string>(selectedPropertyIds);
    let changed = true;

    while (changed) {
      changed = false;
      for (const q of quads) {
        const subject = q.subject?.value ?? "";
        const object = q.object?.value ?? "";
        if (!allowed.has(subject) || !object || allowed.has(object)) {
          continue;
        }
        if (subjectsWithQuads.has(object)) {
          allowed.add(object);
          changed = true;
        }
      }
    }

    return allowed;
  }

  private buildFileSignature(
    summaries: ShapeSummary[],
    validationShapes: ShaclShape[],
  ): string {
    const quadCountByShape = new Map(
      validationShapes.map((shape) => [shape.id, shape.quads.length]),
    );
    return summaries
      .map((shape) =>
        [
          shape.id,
          shape.subject,
          quadCountByShape.get(shape.id) ?? 0,
          shape.targets
            .map((target) => target.key)
            .sort()
            .join(","),
          shape.properties
            .map((prop) => `${prop.id}:${prop.path ?? ""}`)
            .sort()
            .join(","),
        ].join(":"),
      )
      .sort()
      .join("|");
  }

  listShapes(
    selection: ShaclSelectionSettings = DEFAULT_SHACL_SELECTION,
    options: ListShapesOptions = {},
  ): ListShapesResponse {
    const includeTargetGroups = options.includeTargetGroups === true;
    const files = Array.from(this.summaryIndex.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([uri, shapes]) => {
        const shapeItems: ShapeListItem[] = shapes
          .map((shape) => {
            const targets = this.withFallbackTarget(shape.targets);
            return {
              id: shape.id,
              subjectValue: shape.subject,
              label: shape.label ?? shape.id,
              name: shape.name,
              description: shape.description,
              targetKeys: shape.targets.map((t) => t.key),
              targets,
              properties: shape.properties,
            };
          })
          .sort((a, b) =>
            (a.name ?? a.label ?? a.id).localeCompare(
              b.name ?? b.label ?? b.id,
            ),
          );

        const targetCount = new Set(
          shapeItems.flatMap((shape) =>
            shape.targets.map((target) => target.key),
          ),
        ).size;
        const propertyCount = shapeItems.reduce(
          (total, shape) => total + shape.properties.length,
          0,
        );

        return {
          uri,
          fileName: fileNameFromUri(uri),
          shapeCount: shapeItems.length,
          targetCount,
          propertyCount,
          shapes: shapeItems,
          targetGroups: includeTargetGroups
            ? this.buildTargetGroups(shapeItems)
            : [],
        };
      })
      .filter((file) => file.shapes.length > 0);

    return {
      selection: normalizeShaclSelectionSettings(selection),
      revision: this.revision,
      files,
    };
  }

  private withFallbackTarget(
    targets: ShapeTargetSummary[],
  ): ShapeTargetSummary[] {
    return targets.length > 0
      ? targets
      : [
          {
            key: "no-target",
            value: "No target",
            display: "No explicit target",
          },
        ];
  }

  private buildTargetGroups(shapeItems: ShapeListItem[]): {
    targetKey: string;
    targetLabel: string;
    targetDisplay: string;
    shapes: ShapeListItem[];
  }[] {
    const targetGroups = new Map<
      string,
      {
        targetKey: string;
        targetLabel: string;
        targetDisplay: string;
        shapes: ShapeListItem[];
      }
    >();

    for (const shape of shapeItems) {
      for (const target of shape.targets) {
        if (!targetGroups.has(target.key)) {
          targetGroups.set(target.key, {
            targetKey: target.key,
            targetLabel: target.value,
            targetDisplay: target.display,
            shapes: [],
          });
        }
        targetGroups.get(target.key)!.shapes.push(shape);
      }
    }

    return Array.from(targetGroups.values()).sort((a, b) =>
      a.targetDisplay.localeCompare(b.targetDisplay),
    );
  }
}
