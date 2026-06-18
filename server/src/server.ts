/* eslint-disable @typescript-eslint/no-explicit-any */
/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
  CompletionParams,
  CodeActionKind,
  CodeAction,
  CodeActionParams,
} from "vscode-languageserver/node.js";

import { TextDocument } from "vscode-languageserver-textdocument";
import { Cache } from "./data/cache/lru-cache.js";
import { DataManager } from "./data/data-manager.js";

import { ValidationManager } from "./business/validation/validation-manager.js";
import { ShapeManager } from "./data/shacl/shape-manager.js";
import { PrefixRegistry } from "./business/autocomplete/prefix/prefix-registry.js";
import { JsonLdPrefixCompletionProvider } from "./business/autocomplete/prefix/jsonld/jsonld-prefix-completion.js";
import { TtlPrefixCompletionProvider } from "./business/autocomplete/prefix/turtle/ttl-prefix-completion.js";
import { Fetcher } from "./business/autocomplete/prefix/fetcher.js";
import { TermProvider } from "./business/autocomplete/term-completion/term-provider.js";
import { TtlTermCompletionProvider } from "./business/autocomplete/term-completion/ttl-term-completion-provider.js";
import { JsonLdTermCompletionProvider } from "./business/autocomplete/term-completion/jsonld-term-completion-provider.js";
import { ShaclRegistry } from "./business/autocomplete/shacl-based/shacl-registry.js";
import {
  RDFusionConfigSettings,
  defaultRDFusionConfigSettings,
  normalizeRDFusionConfigSettings,
} from "./utils/irdfusion-config-settings.js";
import {
  DEFAULT_SHACL_SELECTION,
  ShaclSelectionSettings,
  normalizeShaclSelectionSettings,
} from "./data/shacl/shacl-selection.js";
import { GroupBySubjectCommand } from "./business/triple-management/grouping/group-by-subject-command.js";
import { FilterTriplesCommand } from "./business/triple-management/filtering/filter-triples-command.js";
import { VoIDGenerateCommand } from "./business/triple-management/void-generate/void-generate-command.js";
import {
  MergeGroupCommand,
  MergeParams,
} from "./business/triple-management/merge-files/merge-and-group-command.js";
import { SortTriplesCommand } from "./business/triple-management/sorting/sorting-triples-command.js";
import { TurtleFormatterCommand } from "./business/triple-management/formatting/turtle/turtle-formatter-command.js";
import { JsonldFrameCommand } from "./business/triple-management/formatting/jsonld/jsonld-frame-command.js";
import { RdfDiffService } from "./business/triple-management/rdf-diff/ttl-diff-command.js";
import { JsonLdRefactorProvider } from "./business/autocomplete/prefix/jsonld/jsonld-prefix-refactor.js";
import { JsonLdRenameProvider } from "./business/autocomplete/prefix/jsonld/jsonld-rename-provider.js";
import { JsonLdDifferentModesCommand } from "./business/triple-management/formatting/jsonld/jsonld-formatting-command.js";
import { UnicodeEscapesCommand } from "./business/triple-management/unicode-escape/unicode-escapes-command.js";
import { PerformanceTracer } from "./utils/performance-trace.js";
import { WorkspaceIndexService } from "./data/workspace-index-service.js";
import { ValidationScheduler } from "./business/validation/validation-scheduler.js";
import { TermMetadataService } from "./business/autocomplete/term-metadata/term-metadata-service.js";
import { registerHoverHandler } from "./business/autocomplete/hover/handler.js";
import { computeWorkspaceCoverage } from "./data/shacl/coverage.js";
import { RemoteTermCodeActionProvider } from "./business/validation/turtle/remote-term-code-actions.js";
import { PrefixDeclarationCodeActionProvider } from "./business/validation/prefix-declaration-code-actions.js";
import { normalizeNamespaceIri } from "./business/autocomplete/term-completion/remote-term-cache.js";
import { isJsonLdLikeDocument } from "./utils/shared/jsonld/document-detection.js";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

let serverConfigSettings: RDFusionConfigSettings =
  defaultRDFusionConfigSettings();
let validationConfigRevision = 0;
let validationSelectionRevision = 0;
let activeShaclSelection: ShaclSelectionSettings = DEFAULT_SHACL_SELECTION;

const cache = new Cache<string, any>(100);
const performanceTracer = new PerformanceTracer(connection);

const dataManager = new DataManager(cache, connection, performanceTracer);

const shapeManager = new ShapeManager(connection, performanceTracer);

const prefixFetcher = new Fetcher();
const prefixRegistry = new PrefixRegistry(prefixFetcher);
const jsonldProvider = new JsonLdPrefixCompletionProvider(
  prefixRegistry,
  connection,
  serverConfigSettings,
);
const ttlProvider = new TtlPrefixCompletionProvider(
  prefixRegistry,
  connection,
  serverConfigSettings,
);

const termProvider = new TermProvider(
  dataManager,
  prefixRegistry,
  serverConfigSettings,
);

termProvider.init();

const validationManager = new ValidationManager(
  dataManager,
  shapeManager,
  documents,
  serverConfigSettings,
  performanceTracer,
  termProvider,
);

const termMetadataService = new TermMetadataService(
  prefixRegistry,
  termProvider,
  shapeManager,
  () => activeShaclSelection,
);

const ttlDiff = new RdfDiffService(connection, documents);

const groupCommand = new GroupBySubjectCommand(
  dataManager,
  connection,
  documents,
);

const sortCommand = new SortTriplesCommand(dataManager, connection, documents);

const filterCommand = new FilterTriplesCommand(dataManager, connection, documents);

const voidGenerator = new VoIDGenerateCommand(dataManager, connection, documents);

const mergeGroupCommand = new MergeGroupCommand(dataManager, connection);

const ttlTermProvider = new TtlTermCompletionProvider(
  termProvider,
  connection,
  serverConfigSettings,
  termMetadataService,
);
const jsonldTermProvider = new JsonLdTermCompletionProvider(
  termProvider,
  prefixRegistry,
  connection,
  serverConfigSettings,
  termMetadataService,
  dataManager,
);

const turtleFormatterCommand = new TurtleFormatterCommand(
  dataManager,
  connection,
  documents,
  prefixRegistry,
  serverConfigSettings,
);
const jsonldFrameCommand = new JsonldFrameCommand(
  dataManager,
  connection,
  documents,
);
const jsonldFormattingCommand = new JsonLdDifferentModesCommand(
  dataManager,
  connection,
  documents,
  prefixRegistry,
);

const unicodeEscapeTransformCommand = new UnicodeEscapesCommand(
  connection,
  documents,
);

const initialShapes = shapeManager.getGlobalShapes();
const shaclRegistry = new ShaclRegistry(initialShapes);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

let lastSelectionFingerprint = stableStringify(activeShaclSelection);

function effectiveConfigSettings(): RDFusionConfigSettings {
  return {
    ...serverConfigSettings,
    shacl: {
      ...serverConfigSettings.shacl,
      selection: activeShaclSelection,
    },
  };
}

function updateRuntimeSettings(settings = effectiveConfigSettings()): void {
  performanceTracer.updateSettings(settings);
  validationManager.updateSettings(settings);
  termProvider.updateSettings(settings);
  ttlProvider.updateSettings(settings);
  jsonldProvider.updateSettings(settings);
  jsonldTermProvider.updateSettings(settings);
  turtleFormatterCommand.updateSettings(settings);
}

function updateActiveShaclSelection(rawSelection: unknown, reason: string): void {
  const nextSelection = normalizeShaclSelectionSettings(rawSelection);
  const nextFingerprint = stableStringify(nextSelection);
  activeShaclSelection = nextSelection;
  if (nextFingerprint !== lastSelectionFingerprint) {
    validationSelectionRevision++;
    lastSelectionFingerprint = nextFingerprint;
  }
  updateRuntimeSettings();
  performanceTracer.log("shacl.selectionChanged", {
    reason,
    selectionRevision: validationSelectionRevision,
  });
  invalidateAndRefreshOpenDiagnostics(reason);
}

const validationScheduler = new ValidationScheduler(
  connection,
  documents,
  validationManager,
  performanceTracer,
  {
    debounceMs: 75,
    concurrency: 2,
    getContext: () => ({
      configRevision: validationConfigRevision,
      shapeRevision: shapeManager.getRevision(),
      selectionRevision: validationSelectionRevision,
    }),
  },
);

function invalidateAndRefreshOpenDiagnostics(reason: string): void {
  validationScheduler.invalidateAll(reason);
  validationScheduler.scheduleAllOpen(reason);
}

const workspaceIndexService = new WorkspaceIndexService(
  dataManager,
  shapeManager,
  shaclRegistry,
  connection,
  () => invalidateAndRefreshOpenDiagnostics("shape-index"),
  performanceTracer,
  (uri) => termProvider.updateLocalTermsForUri(uri),
  (uri) => termProvider.removeLocalTermsForUri(uri),
);

const refactor = new JsonLdRefactorProvider(
  connection,
  dataManager,
  documents,
  prefixRegistry,
);
const rename = new JsonLdRenameProvider(connection, dataManager, documents);

connection.onInitialize((params: InitializeParams) => {
  // Server initialization handled through LSP onInitialize.
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      renameProvider: { prepareProvider: true },
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [":", '"', "@"],
      },
      hoverProvider: true,
      executeCommandProvider: {
        commands: [
          "jsonld.applyPrefixServer",
          "rdf.groupBySubject",
          "rdf.filterTriples",
          "rdf.filterTriplesBySubject",
          "rdf.filterTriplesByPredicate",
          "rdf.filterTriplesByObject",
          "rdf.sortTriples",
          "rdf.generateVoID",
          "rdf.mergeFiles",
          "rdf.frameJsonld",
          "rdf.formatTriples",
          "rdf.compactJsonld",
          "rdf.expandJsonld",
          "rdf.flattenJsonld",
          "rdf.turtleUnicodeEscapeTransform",
        ],
      },
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.Refactor, CodeActionKind.QuickFix],
        resolveProvider: false,
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }

  // // console.dir(params.initializationOptions);
  const initOpts = (params.initializationOptions as any)?.rdfusion;

  if (initOpts) {
    serverConfigSettings = normalizeRDFusionConfigSettings(initOpts);
    activeShaclSelection = serverConfigSettings.shacl.selection;
    lastSelectionFingerprint = stableStringify(activeShaclSelection);
  }

  updateRuntimeSettings();
  performanceTracer.log("server.initialize", {
    hasConfigurationCapability,
    hasWorkspaceFolderCapability,
  });

  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined,
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }

  connection.client.register(
    DidChangeConfigurationNotification.type,
    undefined,
  );
});

connection.onDidChangeConfiguration((change) => {
  const updatedConfigSettings = (change.settings as any)?.rdfusion;
  if (updatedConfigSettings) {
    serverConfigSettings = normalizeRDFusionConfigSettings(
      updatedConfigSettings,
    );
  }

  validationConfigRevision++;

  updateRuntimeSettings();
  performanceTracer.log("server.configurationChanged", {
    configRevision: validationConfigRevision,
    selectionRevision: validationSelectionRevision,
  });
  invalidateAndRefreshOpenDiagnostics("configuration");
});

async function indexWorkspaceFilesRequest(
  label: string,
  params: { files?: { uri: string; version?: number; size?: number }[]; final?: boolean },
) {
  const files = params.files ?? [];
  connection.console.log(
    `[Workspace Index] ${label}: received ${files.length} candidate file(s); final=${params.final !== false}`,
  );
  const result = await workspaceIndexService.indexWorkspaceFiles(files, {
    final: params.final !== false,
    refreshDiagnostics: true,
  });
  connection.console.log(
    `[Workspace Index] ${label}: indexed=${result.indexed}, skipped=${result.skippedUnchanged}, failed=${result.failed}, totalRootShapes=${result.shapes}, revision=${result.revision}`,
  );
  return result;
}

connection.onRequest(
  "rdfusion/workspace/indexShaclFiles",
  async (params: { files?: { uri: string; version?: number; size?: number }[]; final?: boolean }) => {
    return indexWorkspaceFilesRequest("SHACL-filtered RDF", params);
  },
);

connection.onRequest(
  "rdfusion/workspace/indexRdfFiles",
  async (params: { files?: { uri: string; version?: number; size?: number }[]; final?: boolean }) => {
    return indexWorkspaceFilesRequest("RDF workspace", params);
  },
);

connection.onNotification(
  "rdfusion/shacl/setSelection",
  (params: { selection?: unknown }) => {
    updateActiveShaclSelection(params?.selection, "shacl-selection");
  },
);

connection.onRequest(
  "rdfusion/workspace/removeIndexedFile",
  (params: { uri: string }) => {
    performanceTracer.log("workspace.removeIndexedFile", { uri: params.uri });
    return workspaceIndexService.removeFile(params.uri, true);
  },
);

connection.onNotification(
  "workspace/parsedRdf",
  async (params: { uri: string; text: string; version: number }) => {
    try {
      performanceTracer.log("workspace.parsedRdf", {
        uri: params.uri,
        version: params.version,
      });
      await workspaceIndexService.indexParsedRdf(
        params.uri,
        params.text,
        params.version,
      );
    } catch (error: any) {
      connection.console.error(
        `[Server] Error processing ${params.uri}: ${error?.message ?? String(error)}`,
      );
    }
  },
);

connection.onNotification(
  "workspace/removeParsedRdf",
  (params: { uri: string }) => {
    performanceTracer.log("workspace.removeParsedRdf", { uri: params.uri });
    workspaceIndexService.removeFile(params.uri, true);
  },
);

shapeManager.refreshGlobalIndex(dataManager);

const DOCUMENT_INDEX_DEBOUNCE_MS = 75;
const REMOTE_VOCAB_PREFETCH_PREFIX_LIMIT = 8;
const documentIndexTimers = new Map<string, NodeJS.Timeout>();
const documentIndexSequences = new Map<string, number>();
const remoteVocabularyPrefetchInFlight = new Set<string>();

function maybePrefetchRemoteVocabularyTerms(uri: string, version: number): void {
  const snapshot = dataManager.getSnapshot(uri);
  const parsed = snapshot?.parsedGraph as any;
  const prefixEntries: { prefix: string; namespaceIri: string }[] = [];
  if (parsed?.prefixes && typeof parsed.prefixes === "object") {
    prefixEntries.push(
      ...Object.entries(parsed.prefixes)
        .map(([prefix, namespaceIri]) => ({ prefix: String(prefix), namespaceIri: String(namespaceIri ?? "") }))
        .filter(({ prefix, namespaceIri }) => prefix && namespaceIri),
    );
  }
  if (parsed?.prefixMap instanceof Map) {
    for (const [prefix, namespaceIri] of parsed.prefixMap.entries()) {
      if (prefix && namespaceIri && !String(namespaceIri).startsWith('@')) {
        prefixEntries.push({ prefix: String(prefix), namespaceIri: String(namespaceIri) });
      }
    }
  } else if (parsed?.contextMap instanceof Map) {
    for (const [prefix, namespaceIri] of parsed.contextMap.entries()) {
      if (prefix && namespaceIri && !String(namespaceIri).startsWith('@') && /[:/?#[\]@]$/.test(String(namespaceIri))) {
        prefixEntries.push({ prefix: String(prefix), namespaceIri: String(namespaceIri) });
      }
    }
  }
  if (typeof parsed?.vocab === 'string' && parsed.vocab) {
    prefixEntries.push({ prefix: '@vocab', namespaceIri: parsed.vocab });
  }
  const prefixes = Array.from(
    new Map(prefixEntries.map((entry) => [`${entry.prefix}\u0000${entry.namespaceIri}`, entry])).values(),
  );
  const syntax = uri.toLowerCase().endsWith('.jsonld') ? 'jsonld' : 'turtle';
  const missing = prefixes
    .filter(({ prefix, namespaceIri }) => termProvider.getCachedRemoteTermsForPrefix(prefix, namespaceIri, syntax) === undefined)
    .slice(0, REMOTE_VOCAB_PREFETCH_PREFIX_LIMIT);
  if (missing.length === 0) {
    return;
  }

  const namespaces = missing.map(({ namespaceIri }) => normalizeNamespaceIri(namespaceIri));
  const key = `${uri}@${version}:${Array.from(new Set(namespaces)).sort().join(',')}`;
  if (remoteVocabularyPrefetchInFlight.has(key)) {
    return;
  }
  remoteVocabularyPrefetchInFlight.add(key);
  performanceTracer.log("remoteVocabulary.prefetch.start", { uri, version, prefixes: missing.map(({ prefix }) => prefix), namespaces });

  void Promise.all(missing.map(({ prefix, namespaceIri }) => termProvider.prefetchRemoteTermsForPrefix(prefix, connection, namespaceIri, syntax)))
    .then(() => {
      const latest = documents.get(uri);
      if (!latest || latest.version !== version) {
        return;
      }
      performanceTracer.log("remoteVocabulary.prefetch.done", { uri, version, prefixes: missing.map(({ prefix }) => prefix), namespaces });
      validationScheduler.invalidateUri(uri, "remote-vocabulary");
      validationScheduler.schedule(uri, "remote-vocabulary");
    })
    .catch((error: any) => {
      performanceTracer.log("remoteVocabulary.prefetch.failed", {
        uri,
        version,
        error: error?.message ?? String(error),
      });
    })
    .finally(() => {
      remoteVocabularyPrefetchInFlight.delete(key);
    });
}

function scheduleDocumentIndex(uri: string, reason: "open" | "change"): void {
  const existing = documentIndexTimers.get(uri);
  if (existing) {
    clearTimeout(existing);
    documentIndexTimers.delete(uri);
  }

  if (reason === "open") {
    void runLatestDocumentIndex(uri, reason);
    return;
  }

  documentIndexTimers.set(
    uri,
    setTimeout(() => {
      documentIndexTimers.delete(uri);
      void runLatestDocumentIndex(uri, reason);
    }, DOCUMENT_INDEX_DEBOUNCE_MS),
  );
}

async function runLatestDocumentIndex(
  uri: string,
  reason: "open" | "change",
): Promise<void> {
  const document = documents.get(uri);
  if (!document) {
    return;
  }

  const sequence = (documentIndexSequences.get(uri) ?? 0) + 1;
  documentIndexSequences.set(uri, sequence);
  const version = document.version;

  try {
    performanceTracer.log(`document.${reason}.index.start`, { uri, version });
    await workspaceIndexService.indexParsedRdf(
      uri,
      document.getText(),
      version,
      document.languageId,
    );

    const latest = documents.get(uri);
    if (
      !latest ||
      latest.version !== version ||
      documentIndexSequences.get(uri) !== sequence
    ) {
      performanceTracer.log(`document.${reason}.index.stale`, {
        uri,
        indexedVersion: version,
        latestVersion: latest?.version,
      });
      return;
    }

    validationScheduler.invalidateUri(uri, reason);
    validationScheduler.schedule(uri, reason);
    maybePrefetchRemoteVocabularyTerms(uri, version);
  } catch (err: any) {
    connection.console.error(
      `Error ${reason === "open" ? "parsing" : "updating"} ${uri}: ${err?.message ?? String(err)}`,
    );
  }
}

documents.onDidOpen((event) => {
  scheduleDocumentIndex(event.document.uri, "open");
});

documents.onDidChangeContent((change) => {
  scheduleDocumentIndex(change.document.uri, "change");
});


documents.onDidClose((event) => {
  const timer = documentIndexTimers.get(event.document.uri);
  if (timer) {
    clearTimeout(timer);
    documentIndexTimers.delete(event.document.uri);
  }
  documentIndexSequences.delete(event.document.uri);
  validationScheduler.clearUri(event.document.uri);
});

connection.onCompletion(async (params: CompletionParams) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) {
    return [];
  }
  if (doc.languageId === "turtle") {
    const prefixItems = ttlProvider.provide(params, documents);
    const termItems = ttlTermProvider.provide(params, documents);
    
    return [...(await prefixItems), ...(await termItems)];
  }
  if (isJsonLdLikeDocument(doc.uri, doc.languageId, doc.getText())) {
    const prefixItemsJ = jsonldProvider.provide(params, documents);
    const termItemsJ = jsonldTermProvider.provide(params, documents);
    return [...(await prefixItemsJ), ...(await termItemsJ)];
  }
  return [];
});

interface UriArg {
  uri: string;
}

interface FilterArgs {
  uri: string;
  subjectFilters?: string[];
  predicateFilters?: string[];
  objectFilters?: string[];
}

interface SortArgs {
  uri: string;
  mode: string;
  direction: string;
}

interface FrameArgs {
  uri: string;
  data: string;
}

interface UnicodeEscapeTargetsArg {
  uri: string;
  mode: string;
}

type ExecHandler = (args: any[] | undefined) => Promise<any> | any;

const execHandlers = new Map<string, ExecHandler>();

function registerExec(id: string, handler: ExecHandler) {
  if (execHandlers.has(id)) {
    connection.console.warn(`executeCommand handler overwritten: ${id}`);
  }
  execHandlers.set(id, handler);
}

function arg0<T extends object>(
  args: any[] | undefined,
  required: (keyof T)[] = [],
): T {
  const payload = (args?.[0] ?? {}) as T;
  for (const k of required) {
    if ((payload as any)[k] === undefined) {
      throw new Error(
        `Missing required argument "${String(k)}" for executeCommand`,
      );
    }
  }
  return payload;
}

registerExec("jsonld.applyPrefixServer", (args) =>
  refactor.handleApplyPrefixServer(args),
);

registerExec("rdf.groupBySubject", async (args) => {
  const p = arg0<UriArg>(args, ["uri"]);
  return groupCommand.execute(p);
});

registerExec("rdf.filterTriples", async (args) => {
  const p = arg0<FilterArgs>(args, ["uri"]);
  return filterCommand.execute(p);
});

registerExec("rdf.filterTriplesBySubject", async (args) => {
  const p = arg0<FilterArgs>(args, ["uri"]);
  return filterCommand.execute(p);
});

registerExec("rdf.filterTriplesByPredicate", async (args) => {
  const p = arg0<FilterArgs>(args, ["uri"]);
  return filterCommand.execute(p);
});

registerExec("rdf.filterTriplesByObject", async (args) => {
  const p = arg0<FilterArgs>(args, ["uri"]);
  return filterCommand.execute(p);
});

registerExec("rdf.sortTriples", async (args) => {
  const p = arg0<SortArgs>(args, ["uri", "mode", "direction"]);
  return sortCommand.execute(p);
});

registerExec("rdf.generateVoID", async (args) => {
  const p = arg0<UriArg>(args, ["uri"]);
  return voidGenerator.execute(p);
});

registerExec("rdf.mergeFiles", async (args) => {
  const p = arg0<MergeParams>(args);
  return mergeGroupCommand.execute(p);
});

registerExec("rdf.frameJsonld", async (args) => {
  const p = arg0<FrameArgs>(args, ["uri", "data"]);
  return jsonldFrameCommand.execute(p);
});

registerExec("rdf.compactJsonld", async (args) => {
  const p = arg0<SortArgs>(args, ["uri", "mode"]);
  return jsonldFormattingCommand.execute(p);
});

registerExec("rdf.expandJsonld", async (args) => {
  const p = arg0<SortArgs>(args, ["uri", "mode"]);
  return jsonldFormattingCommand.execute(p);
});

registerExec("rdf.flattenJsonld", async (args) => {
  const p = arg0<SortArgs>(args, ["uri", "mode"]);
  return jsonldFormattingCommand.execute(p);
});

registerExec("rdf.formatTriples", async (args) => {
  const p = arg0<UriArg>(args, ["uri"]);
  return turtleFormatterCommand.format(p);
});

registerExec("rdf.turtleUnicodeEscapeTransform", async (args) => {
  const p = arg0<UnicodeEscapeTargetsArg>(args, ["uri", "mode"]);
  return unicodeEscapeTransformCommand.execute(p);
});

connection.onExecuteCommand(async (params) => {
  const handler = execHandlers.get(params.command);
  if (!handler) {
    connection.console.warn(`Unknown executeCommand: ${params.command}`);
    return;
  }

  try {
    return await handler(params.arguments);
  } catch (err: any) {
    connection.console.error(
      `executeCommand ${params.command} failed: ${err?.stack || err?.message || String(err)}`,
    );
    throw err;
  }
});

const remoteTermCodeActions = new RemoteTermCodeActionProvider();
const prefixDeclarationCodeActions = new PrefixDeclarationCodeActionProvider(prefixRegistry, documents);

const codeActionProviders: ((
  p: CodeActionParams,
) => CodeAction[] | Promise<CodeAction[]>)[] = [
  refactor.provideCodeActions,
  (params) => remoteTermCodeActions.provideCodeActions(params),
  (params) => prefixDeclarationCodeActions.provideCodeActions(params),
];

connection.onCodeAction(
  async (params: CodeActionParams): Promise<CodeAction[]> => {
    const lists = await Promise.all(
      codeActionProviders.map((fn) => Promise.resolve(fn(params))),
    );
    return lists.flat().filter(Boolean) as CodeAction[];
  },
);

connection.onPrepareRename((params) => {
  return rename.prepareRename(params);
});

connection.onRenameRequest((params) => {
  return rename.rename(params);
});

connection.onRequest("rdfusion/shacl/listShapes", async () => {
  return performanceTracer.time("shacl.listShapes", async () => {
    return shapeManager.listShapes(
      activeShaclSelection,
      { includeTargetGroups: false },
    );
  });
});

connection.onRequest("rdfusion/coverage", async () => {
  return performanceTracer.time("shacl.coverage", async () => {
    const selection = activeShaclSelection;
    return computeWorkspaceCoverage({
      snapshots: dataManager.getAllSnapshots(),
      shapeSourceUris: shapeManager.getIndexedShapeUris(),
      selectedShapes: shapeManager.getSelectedShapes(selection),
      selection,
      shapeRevision: shapeManager.getRevision(),
    });
  });
});


registerHoverHandler(
  connection,
  documents,
  termMetadataService,
  performanceTracer,
  dataManager,
);

ttlDiff.register();

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
