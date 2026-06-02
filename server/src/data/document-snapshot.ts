import type {
  CachedParsedGraph,
  JsonldParsedGraph,
  ParsedGraph,
} from "./irdf-parser";

export type RDFusionFileType = "turtle" | "jsonld" | "unknown";

export interface DocumentSnapshot {
  uri: string;
  version: number;
  fileType: RDFusionFileType;
  parsedGraph: ParsedGraph | JsonldParsedGraph;
  byteSize?: number;
  parsedAt: number;
}

export function snapshotToCachedParsedGraph(
  snapshot: DocumentSnapshot,
): CachedParsedGraph {
  return {
    version: snapshot.version,
    parsedGraph: snapshot.parsedGraph,
  };
}
