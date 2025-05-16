// import * as assert from 'assert';

// // --- Fake VS Code Connection for Server ---
// const fakeConnection: vscode.Connection = {
//   console: {
//     log: (msg: any) => { /* optionally capture logs */ },
//     error: (msg: any) => { /* optionally capture logs */ },
//     warn: (msg: any) => { /* optionally capture logs */ }
//   }
// } as unknown as vscode.Connection;

// // --- Fake LanguageClient for Notifier Testing ---
// class FakeLanguageClient extends LanguageClient {
//   public notifications: { method: string; params: any }[] = [];
//   sendNotification(method: string, params: any): void {
//     this.notifications.push({ method, params });
//   }
// }
// const fakeClient = new FakeLanguageClient('fake', 'fake', {} as any, {} as any);

// // --- Fake RDF Parser Implementation for DataManager ---
// class FakeRDFParser {
//   // Simulate parsing by returning a ParsedGraph.
//   // If the input text includes "shape" then return a graph with a SHACL shape quad.
//   async parse(input: string, fileType: string): Promise<ParsedGraph> {
//     let quads: any[] = [];
//     let tokens: any[] = [];
//     if (fileType === 'turtle' && input.includes('shape')) {
//       quads.push({
//         subject: { value: "b1" },
//         predicate: { value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" },
//         object: { value: "http://www.w3.org/ns/shacl#Shape" }
//       });
//       tokens.push("SHACL");
//     } else {
//       quads.push({
//         subject: { value: "s1" },
//         predicate: { value: "http://example.org/predicate" },
//         object: { value: "http://example.org/object" }
//       });
//       tokens.push("data");
//     }
//     return { quads, tokens, errors: [], cst: [] };
//   }
//   async update(changedRange: any, newInput: string): Promise<ParsedGraph> {
//     return this.parse(newInput, 'turtle');
//   }
// }

// // Override RDFParser in our DataManager façade.
// class FakeRDFParserFacade {
//   async parse(input: string, fileType: string): Promise<ParsedGraph> {
//     return new FakeRDFParser().parse(input, fileType);
//   }
// }

// // We override DataManager to use our fake RDF parser.
// class FakeDataManager extends DataManager {
//   constructor(cache: LruCache<string, any>, connection: vscode.Connection) {
//     super(cache, connection);
//     (this as any).rdfParser = new FakeRDFParserFacade();
//   }
// }

// // --- Tests Begin Here ---
// describe('WorkspaceScanner Module', () => {
//   it('should call its callback with a simulated file list', async () => {
//     // Simulate a list of URIs.
//     const fakeFiles = [Uri.parse('file:///test1.ttl'), Uri.parse('file:///test2.jsonld')];
//     let callbackCalled = false;
//     const testCallback: WorkspaceScanCallback = (files: vscode.Uri[]) => {
//       callbackCalled = true;
//       assert(Array.isArray(files), 'Expected an array of files');
//       // For demonstration, we check the length.
//       assert.strictEqual(files.length, fakeFiles.length);
//     };

//     // Create an instance of WorkspaceScanner but override its performScan.
//     const scanner = new WorkspaceScanner('**/*.{ttl,jsonld}', testCallback, 100);
//     // Monkey-patch performScan to return our simulated file list.
//     (scanner as any).performScan = async () => {
//       testCallback(fakeFiles);
//     };
//     await scanner.performScan();
//     assert.strictEqual(callbackCalled, true, 'Callback should be called');
//     scanner.dispose();
//   });
// });

// describe('WorkspaceNotifier Module', () => {
//   it('should send notifications with correct fileType based on extension', async () => {
//     // Simulate a file with .ttl extension.
//     const testUri = Uri.parse('file:///sample.ttl');
//     // Create a fake workspace file: content, stat.
//     const fakeFileContent = Buffer.from('data with shape', 'utf8');
//     const fakeStat = { mtime: 123456789 };

//     // Monkey-patch vscode.workspace.fs.readFile and stat.
//     const originalReadFile = vscode.workspace.fs.readFile;
//     const originalStat = vscode.workspace.fs.stat;
//     vscode.workspace.fs.readFile = async () => fakeFileContent;
//     vscode.workspace.fs.stat = async () => fakeStat;

//     // Clear notifications in fakeClient.
//     fakeClient.notifications = [];
//     await sendParsedRdfNotification([testUri], fakeClient);
//     // Check that the notification includes fileType 'turtle' (because .ttl)
//     assert.strictEqual(fakeClient.notifications.length, 1, 'Expected one notification');
//     const notification = fakeClient.notifications[0];
//     assert.strictEqual(notification.method, 'workspace/parsedRdf');
//     assert.strictEqual(notification.params.fileType, 'turtle');
    
//     // Restore original functions.
//     vscode.workspace.fs.readFile = originalReadFile;
//     vscode.workspace.fs.stat = originalStat;
//   });
// });

// describe('DataManager Caching and Parsing', () => {
//   const cache = new LruCache<string, any>(10);
//   const dataManager = new FakeDataManager(cache, fakeConnection);

//   it('should cache the parsed graph when version is unchanged', async () => {
//     const uri = 'file:///test.ttl';
//     const input = 'data without shape';
//     const version = 1;
//     const parsed1 = await dataManager.parseDocument(uri, input, version, 'turtle');
//     const parsed2 = await dataManager.parseDocument(uri, input, version, 'turtle');
//     // Because our fake parser returns the same data, the cache should hold the same ParsedGraph.
//     assert.strictEqual(parsed1.quads[0].subject.value, parsed2.quads[0].subject.value);
//   });

//   it('should re-parse when version changes or fileType differs', async () => {
//     const uri = 'file:///test.ttl';
//     const inputV1 = 'data without shape';
//     const inputV2 = 'data with shape';
//     const parsed1 = await dataManager.parseDocument(uri, inputV1, 1, 'turtle');
//     const parsed2 = await dataManager.parseDocument(uri, inputV2, 2, 'turtle');
//     // If "shape" is present in inputV2, FakeRDFParser returns a quad with subject "b1".
//     assert.notStrictEqual(parsed1.quads[0].subject.value, parsed2.quads[0].subject.value);
//   });
// });

// describe('ShapeManager Extraction', () => {
//   const shapeManager = new ShapeManager(fakeConnection);
  
//   it('should extract SHACL shapes when present in quads (explicit type)', () => {
//     const parsedGraph: ParsedGraph = {
//       quads: [{
//         subject: { value: "b1" },
//         predicate: { value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" },
//         object: { value: "http://www.w3.org/ns/shacl#Shape" }
//       }],
//       tokens: [],
//       errors: [],
//       cst: []
//     };
//     shapeManager.updateShapeIndex('file:///shape.ttl', parsedGraph);
//     const shapes = shapeManager.getGlobalShapes();
//     assert.ok(shapes.length > 0, "Expected at least one SHACL shape extracted");
//   });

//   it('should extract SHACL shapes using SHACL namespace even without explicit type', () => {
//     const parsedGraph: ParsedGraph = {
//       quads: [{
//         subject: { value: "b2" },
//         predicate: { value: "http://www.w3.org/ns/shacl#minCount" },
//         object: { value: "1" }
//       }],
//       tokens: [],
//       errors: [],
//       cst: []
//     };
//     shapeManager.updateShapeIndex('file:///shape2.ttl', parsedGraph);
//     const shapes = shapeManager.getGlobalShapes();
//     // Since our extractor checks for any predicate starting with the SHACL namespace,
//     // we expect this file to be indexed.
//     assert.ok(shapes.some(s => s.subject === "b2"), "Expected shape with subject b2 to be extracted");
//   });

//   it('should remove shape from index if not present', () => {
//     const parsedGraph: ParsedGraph = {
//       quads: [{
//         subject: { value: "s1" },
//         predicate: { value: "http://example.org/predicate" },
//         object: { value: "http://example.org/object" }
//       }],
//       tokens: [],
//       errors: [],
//       cst: []
//     };
//     shapeManager.updateShapeIndex('file:///nonShape.ttl', parsedGraph);
//     const shapes = shapeManager.getGlobalShapes();
//     // We expect no shapes from this file.
//     assert.ok(!shapes.some(s => s.subject === "s1"), "Expected no shape for subject s1");
//   });
// });
