/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DocumentSnapshot } from '../document-snapshot.js';
import type { ShaclShape, ShaclTargetBinding } from './ishape-extractor.js';
import type { ShaclSelectionSettings } from './shacl-selection.js';
import {
	RDF_TYPE,
	SH_TARGET_CLASS,
	SH_TARGET_NODE,
	SH_TARGET_OBJECTS_OF,
	SH_TARGET_SUBJECTS_OF,
} from '../rdf/rdf-vocabulary';


export interface PropertyCoverage {
  propertyShapeId?: string;
  pathIri?: string;
  pathDisplay?: string;
  label?: string;
  summary?: string;
  focusNodes: number;
  nodesWithProperty: number;
  missingNodes: number;
  coveragePct: number;
  unmeasuredReason?: string;
}

export interface ShapeCoverageTarget {
  predicate: string;
  value: string;
  display: string;
  focusNodes: number;
}

export interface ShapeCoverage {
  shapeIri: string;
  sourceUri?: string;
  label?: string;
  name?: string;
  description?: string;
  targetClasses: string[];
  targetNodes: string[];
  targetSubjectsOf: string[];
  targetObjectsOf: string[];
  targets: ShapeCoverageTarget[];
  focusNodes: number;
  coveredFocusNodes: number;
  /** Backward-compatible alias for nodeCoveragePct. */
  coveragePct: number;
  /** Focus nodes that have at least one measured sh:path from this shape. */
  nodeCoveragePct: number;
  /** Sum of focus-node/property-shape pairs that currently exist in the data. */
  propertySlotsPresent: number;
  /** focusNodes * measured simple IRI sh:path count. */
  propertySlotsTotal: number;
  /** How many expected shape fields are present across the focus set. */
  propertyPresencePct: number;
  /** Actual non-rdf:type predicate assertions on this shape's focus nodes. */
  fieldAssertionsOnFocusNodes: number;
  /** Actual focus-node predicate assertions whose predicate is described by this shape. */
  governedFieldAssertionsOnFocusNodes: number;
  /** Share of observed fields on this shape's focus nodes that are described by its sh:paths. */
  fieldCoveragePct: number;
  properties: PropertyCoverage[];
}

export interface WorkspaceCoverage {
  selection: ShaclSelectionSettings;
  shapeRevision: number;
  dataDocumentsCount: number;
  dataQuadsCount: number;
  shapes: ShapeCoverage[];

  /** Main thesis-facing KPI: resources targeted by the active SHACL scope. */
  dataNodeCoveragePct: number;
  governedDataSubjectsCount: number;
  totalDataSubjects: number;

  /** Main field-level KPI: observed fields on governed resources described by selected sh:path IRIs. */
  governedFieldCoveragePct: number;
  governedPredicateAssertionsCount: number;
  totalPredicateAssertionsOnGovernedSubjects: number;

  /** Completeness KPI: expected shape-property slots present across all selected shapes. */
  shapePropertyPresencePct: number;
  propertySlotsPresent: number;
  propertySlotsTotal: number;

  /** Compatibility / advanced KPI: distinct data predicates referenced by selected sh:path IRIs. */
  workspacePredicateCoveragePct: number;
  referencedPredicatesCount: number;
  totalPredicatesCount: number;

  /** Governance gaps. */
  orphanPredicates: string[];
  orphanClasses: string[];
  deadShapes: string[];

  measuredPathsCount: number;
  unmeasuredPathsCount: number;
}

export interface DataIndex {
  subjectsByClass: Map<string, Set<string>>;
  poBySubject: Map<string, { p: string; o: string }[]>;
  subjectsByPredicate: Map<string, Set<string>>;
  objectsByPredicate: Map<string, Set<string>>;
  allSubjects: Set<string>;
  allPredicates: Set<string>;
  dataDocumentsCount: number;
  dataQuadsCount: number;
}

function valueOf(term: any): string {
  return term?.value ?? String(term ?? '');
}

function isSimpleIriPath(path: string | undefined): path is string {
  if (!path) return false;
  if (path.startsWith('_:')) return false;
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) || path.includes('://');
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? +((numerator / denominator) * 100).toFixed(1) : 0;
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

export function buildDataIndex(
  snapshots: DocumentSnapshot[],
  shapeSourceUris: Set<string> = new Set<string>(),
): DataIndex {
  const subjectsByClass = new Map<string, Set<string>>();
  const poBySubject = new Map<string, { p: string; o: string }[]>();
  const subjectsByPredicate = new Map<string, Set<string>>();
  const objectsByPredicate = new Map<string, Set<string>>();
  const allSubjects = new Set<string>();
  const allPredicates = new Set<string>();
  let dataDocumentsCount = 0;
  let dataQuadsCount = 0;

  for (const snapshot of snapshots) {
    if (shapeSourceUris.has(snapshot.uri)) continue;
    dataDocumentsCount++;
    const quads = snapshot.parsedGraph.quads ?? [];
    for (const q of quads) {
      const s = valueOf(q.subject);
      const p = valueOf(q.predicate);
      const o = valueOf(q.object);
      if (!s || !p) continue;

      dataQuadsCount++;
      allSubjects.add(s);
      if (p !== RDF_TYPE) {
        allPredicates.add(p);
      }

      if (!poBySubject.has(s)) poBySubject.set(s, []);
      poBySubject.get(s)!.push({ p, o });

      if (!subjectsByPredicate.has(p)) subjectsByPredicate.set(p, new Set());
      subjectsByPredicate.get(p)!.add(s);

      if (o) {
        if (!objectsByPredicate.has(p)) objectsByPredicate.set(p, new Set());
        objectsByPredicate.get(p)!.add(o);
      }

      if (p === RDF_TYPE && o) {
        if (!subjectsByClass.has(o)) subjectsByClass.set(o, new Set());
        subjectsByClass.get(o)!.add(s);
      }
    }
  }

  return {
    subjectsByClass,
    poBySubject,
    subjectsByPredicate,
    objectsByPredicate,
    allSubjects,
    allPredicates,
    dataDocumentsCount,
    dataQuadsCount,
  };
}

function addAll(target: Set<string>, source: Iterable<string> | undefined): void {
  if (!source) return;
  for (const item of source) target.add(item);
}

function focusNodesForTarget(target: ShaclTargetBinding, idx: DataIndex): Set<string> {
  switch (target.predicate) {
    case SH_TARGET_CLASS:
      return new Set(idx.subjectsByClass.get(target.value) ?? []);
    case SH_TARGET_NODE:
      return new Set(idx.allSubjects.has(target.value) ? [target.value] : []);
    case SH_TARGET_SUBJECTS_OF:
      return new Set(idx.subjectsByPredicate.get(target.value) ?? []);
    case SH_TARGET_OBJECTS_OF:
      return new Set(idx.objectsByPredicate.get(target.value) ?? []);
    default:
      return new Set();
  }
}

function getFieldAssertions(idx: DataIndex, subject: string): { p: string; o: string }[] {
  return (idx.poBySubject.get(subject) ?? []).filter((entry) => entry.p !== RDF_TYPE);
}

export function computeCoverage(
  shapes: ShaclShape[],
  idx: DataIndex,
  selection: ShaclSelectionSettings,
  shapeRevision: number,
): WorkspaceCoverage {
  const shapeCoverages: ShapeCoverage[] = [];
  const referencedPreds = new Set<string>();
  const deadShapes: string[] = [];
  let unmeasuredPathsCount = 0;

  const classesTargetedByShapes = new Set<string>();
  const governedSubjects = new Set<string>();
  const applicablePathsBySubject = new Map<string, Set<string>>();
  let workspacePropertySlotsPresent = 0;
  let workspacePropertySlotsTotal = 0;

  for (const shape of shapes) {
    const focusSet = new Set<string>();
    const targets: ShapeCoverageTarget[] = [];
    const targetClasses: string[] = [];
    const targetNodes: string[] = [];
    const targetSubjectsOf: string[] = [];
    const targetObjectsOf: string[] = [];

    for (const target of shape.targets) {
      const targetFocus = focusNodesForTarget(target, idx);
      addAll(focusSet, targetFocus);
      targets.push({
        predicate: target.predicate,
        value: target.value,
        display: target.display,
        focusNodes: targetFocus.size,
      });

      if (target.predicate === SH_TARGET_CLASS) {
        targetClasses.push(target.value);
        classesTargetedByShapes.add(target.value);
      } else if (target.predicate === SH_TARGET_NODE) {
        targetNodes.push(target.value);
      } else if (target.predicate === SH_TARGET_SUBJECTS_OF) {
        targetSubjectsOf.push(target.value);
      } else if (target.predicate === SH_TARGET_OBJECTS_OF) {
        targetObjectsOf.push(target.value);
      }
    }

    addAll(governedSubjects, focusSet);

    const focusNodes = focusSet.size;
    const perProp: PropertyCoverage[] = [];
    const hasAnyMeasuredProperty = new Map<string, boolean>();
    for (const s of focusSet) hasAnyMeasuredProperty.set(s, false);

    const measuredShapePaths = new Set<string>();
    let propertySlotsPresent = 0;
    let propertySlotsTotal = 0;

    for (const prop of shape.properties) {
      const path = prop.path;
      if (!isSimpleIriPath(path)) {
        unmeasuredPathsCount++;
        perProp.push({
          propertyShapeId: prop.id,
          pathIri: path,
          pathDisplay: prop.pathDisplay,
          label: prop.label,
          summary: prop.summary,
          focusNodes,
          nodesWithProperty: 0,
          missingNodes: focusNodes,
          coveragePct: 0,
          unmeasuredReason: path ? 'Not measured: this view only counts simple IRI sh:path values.' : 'Not measured: missing sh:path.',
        });
        continue;
      }

      referencedPreds.add(path);
      measuredShapePaths.add(path);
      let nodesWithProperty = 0;
      if (focusNodes > 0) {
        for (const s of focusSet) {
          const po = idx.poBySubject.get(s);
          if (!po) continue;
          if (po.some((entry) => entry.p === path)) {
            nodesWithProperty++;
            hasAnyMeasuredProperty.set(s, true);
          }
        }
      }

      propertySlotsPresent += nodesWithProperty;
      propertySlotsTotal += focusNodes;

      perProp.push({
        propertyShapeId: prop.id,
        pathIri: path,
        pathDisplay: prop.pathDisplay,
        label: prop.label,
        summary: prop.summary,
        focusNodes,
        nodesWithProperty,
        missingNodes: Math.max(0, focusNodes - nodesWithProperty),
        coveragePct: pct(nodesWithProperty, focusNodes),
      });
    }

    for (const subject of focusSet) {
      if (!applicablePathsBySubject.has(subject)) applicablePathsBySubject.set(subject, new Set());
      addAll(applicablePathsBySubject.get(subject)!, measuredShapePaths);
    }

    workspacePropertySlotsPresent += propertySlotsPresent;
    workspacePropertySlotsTotal += propertySlotsTotal;

    const coveredFocusNodes = Array.from(hasAnyMeasuredProperty.values()).filter(Boolean).length;
    let fieldAssertionsOnFocusNodes = 0;
    let governedFieldAssertionsOnFocusNodes = 0;
    for (const subject of focusSet) {
      for (const assertion of getFieldAssertions(idx, subject)) {
        fieldAssertionsOnFocusNodes++;
        if (measuredShapePaths.has(assertion.p)) {
          governedFieldAssertionsOnFocusNodes++;
        }
      }
    }

    const nodeCoveragePct = pct(coveredFocusNodes, focusNodes);
    const shapeCoverage: ShapeCoverage = {
      shapeIri: shape.subject,
      sourceUri: shape.sourceUri,
      label: shape.label,
      name: shape.name,
      description: shape.description,
      targetClasses: sorted(targetClasses),
      targetNodes: sorted(targetNodes),
      targetSubjectsOf: sorted(targetSubjectsOf),
      targetObjectsOf: sorted(targetObjectsOf),
      targets,
      focusNodes,
      coveredFocusNodes,
      coveragePct: nodeCoveragePct,
      nodeCoveragePct,
      propertySlotsPresent,
      propertySlotsTotal,
      propertyPresencePct: pct(propertySlotsPresent, propertySlotsTotal),
      fieldAssertionsOnFocusNodes,
      governedFieldAssertionsOnFocusNodes,
      fieldCoveragePct: pct(governedFieldAssertionsOnFocusNodes, fieldAssertionsOnFocusNodes),
      properties: perProp,
    };

    if (focusNodes === 0) deadShapes.push(shape.subject);
    shapeCoverages.push(shapeCoverage);
  }

  let totalPredicateAssertionsOnGovernedSubjects = 0;
  let governedPredicateAssertionsCount = 0;
  for (const subject of governedSubjects) {
    const applicablePaths = applicablePathsBySubject.get(subject) ?? new Set<string>();
    for (const assertion of getFieldAssertions(idx, subject)) {
      totalPredicateAssertionsOnGovernedSubjects++;
      if (applicablePaths.has(assertion.p)) {
        governedPredicateAssertionsCount++;
      }
    }
  }

  const referencedPredicatesCount = Array.from(referencedPreds).filter((p) => idx.allPredicates.has(p)).length;
  const totalPredicatesCount = idx.allPredicates.size;
  const workspacePredicateCoveragePct = totalPredicatesCount > 0 ? pct(referencedPredicatesCount, totalPredicatesCount) : 0;

  const orphanClasses = sorted(Array.from(idx.subjectsByClass.keys()).filter((c) => !classesTargetedByShapes.has(c)));
  const orphanPredicates = sorted(Array.from(idx.allPredicates).filter((p) => !referencedPreds.has(p)));

  return {
    selection,
    shapeRevision,
    dataDocumentsCount: idx.dataDocumentsCount,
    dataQuadsCount: idx.dataQuadsCount,
    shapes: shapeCoverages.sort((a, b) => (a.name ?? a.label ?? a.shapeIri).localeCompare(b.name ?? b.label ?? b.shapeIri)),
    dataNodeCoveragePct: pct(governedSubjects.size, idx.allSubjects.size),
    governedDataSubjectsCount: governedSubjects.size,
    totalDataSubjects: idx.allSubjects.size,
    governedFieldCoveragePct: pct(governedPredicateAssertionsCount, totalPredicateAssertionsOnGovernedSubjects),
    governedPredicateAssertionsCount,
    totalPredicateAssertionsOnGovernedSubjects,
    shapePropertyPresencePct: pct(workspacePropertySlotsPresent, workspacePropertySlotsTotal),
    propertySlotsPresent: workspacePropertySlotsPresent,
    propertySlotsTotal: workspacePropertySlotsTotal,
    workspacePredicateCoveragePct,
    referencedPredicatesCount,
    totalPredicatesCount,
    orphanPredicates,
    orphanClasses,
    deadShapes: sorted(deadShapes),
    measuredPathsCount: referencedPreds.size,
    unmeasuredPathsCount,
  };
}

export function computeWorkspaceCoverage(params: {
  snapshots: DocumentSnapshot[];
  shapeSourceUris: Set<string>;
  selectedShapes: ShaclShape[];
  selection: ShaclSelectionSettings;
  shapeRevision: number;
}): WorkspaceCoverage {
  const idx = buildDataIndex(params.snapshots, params.shapeSourceUris);
  return computeCoverage(params.selectedShapes, idx, params.selection, params.shapeRevision);
}
