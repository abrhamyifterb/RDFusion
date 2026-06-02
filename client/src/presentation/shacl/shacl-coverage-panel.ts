/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { WorkspaceIndexProgress, WorkspaceIndexResult } from '../../utils/workspace-notifier';

type EnsureWorkspaceRdfIndex = (onProgress?: (progress: WorkspaceIndexProgress) => void) => Promise<WorkspaceIndexResult>;

interface WorkspaceCoverage {
	selection: { mode: 'auto' | 'custom' };
	shapeRevision: number;
	dataDocumentsCount: number;
	dataQuadsCount: number;
	shapes: ShapeCoverage[];
	dataNodeCoveragePct: number;
	governedDataSubjectsCount: number;
	totalDataSubjects: number;
	governedFieldCoveragePct: number;
	governedPredicateAssertionsCount: number;
	totalPredicateAssertionsOnGovernedSubjects: number;
	shapePropertyPresencePct: number;
	propertySlotsPresent: number;
	propertySlotsTotal: number;
	workspacePredicateCoveragePct: number;
	referencedPredicatesCount: number;
	totalPredicatesCount: number;
	orphanPredicates: string[];
	orphanClasses: string[];
	deadShapes: string[];
	measuredPathsCount: number;
	unmeasuredPathsCount: number;
}

interface ShapeCoverage {
	shapeIri: string;
	sourceUri?: string;
	label?: string;
	name?: string;
	description?: string;
	targetClasses: string[];
	targetNodes: string[];
	targetSubjectsOf: string[];
	targetObjectsOf: string[];
	focusNodes: number;
	coveredFocusNodes: number;
	coveragePct: number;
	nodeCoveragePct?: number;
	propertySlotsPresent?: number;
	propertySlotsTotal?: number;
	propertyPresencePct?: number;
	fieldAssertionsOnFocusNodes?: number;
	governedFieldAssertionsOnFocusNodes?: number;
	fieldCoveragePct?: number;
	properties: PropertyCoverage[];
}

interface PropertyCoverage {
	propertyShapeId?: string;
	pathIri?: string;
	pathDisplay?: string;
	label?: string;
	summary?: string;
	focusNodes: number;
	nodesWithProperty: number;
	missingNodes?: number;
	coveragePct: number;
	unmeasuredReason?: string;
}

export class ShaclCoveragePanel {
	public static currentPanel: ShaclCoveragePanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly disposables: vscode.Disposable[] = [];
	private webviewReady = false;
	private refreshInFlight: Promise<void> | undefined;
	private indexInFlight: Promise<WorkspaceIndexResult> | undefined;
	private hasStartedInitialIndex = false;

	private constructor(
		panel: vscode.WebviewPanel,
		private readonly client: LanguageClient,
		private readonly ensureWorkspaceRdfIndex: EnsureWorkspaceRdfIndex,
		private readonly output: vscode.OutputChannel,
	) {
		this.panel = panel;
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.panel.onDidChangeViewState(e => {
			if (e.webviewPanel.visible) {
				void this.refreshFromServer('Panel revealed');
			}
		}, null, this.disposables);
		this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this), null, this.disposables);
		this.panel.webview.html = this.getShellHtml();

		this.disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('rdfusion.shacl.selection')) {
					void this.refreshFromServer('SHACL selection changed');
				}
			}),
			vscode.workspace.onDidSaveTextDocument(doc => {
				if (doc.languageId === 'turtle' || doc.languageId === 'jsonld') {
					void this.startIndex('Saved RDF document; refreshing coverage…', true);
				}
			}),
		);
	}

	public static createOrShow(
		_extensionUri: vscode.Uri,
		client: LanguageClient,
		ensureWorkspaceRdfIndex: EnsureWorkspaceRdfIndex,
		output: vscode.OutputChannel,
	): void {
		const column = vscode.window.activeTextEditor?.viewColumn;
		if (ShaclCoveragePanel.currentPanel) {
			ShaclCoveragePanel.currentPanel.panel.reveal(column);
			void ShaclCoveragePanel.currentPanel.refreshFromServer('Panel revealed');
			void ShaclCoveragePanel.currentPanel.startIndex('Refreshing indexed RDF workspace…');
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			'rdfusionShaclCoverage',
			'RDFusion SHACL Data Coverage',
			column || vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true },
		);
		ShaclCoveragePanel.currentPanel = new ShaclCoveragePanel(panel, client, ensureWorkspaceRdfIndex, output);
	}

	public dispose(): void {
		ShaclCoveragePanel.currentPanel = undefined;
		this.disposables.forEach(d => d.dispose());
	}

	private async handleMessage(msg: any): Promise<void> {
		this.output.appendLine(`[SHACL Coverage] message: ${msg?.command ?? '<unknown>'}`);
		if (msg.command === 'ready') {
			this.webviewReady = true;
			await this.postMessage({ command: 'status', text: 'Connected. Showing current indexed coverage, then scanning the workspace in the background…' });
			void this.refreshFromServer('Initial load');
			void this.startIndex('Scanning workspace RDF/SHACL files for coverage…');
			return;
		}
		if (msg.command === 'refresh') {
			void this.startIndex('Manual coverage refresh requested…', true);
			return;
		}
	}

	private async postMessage(message: any): Promise<void> {
		if (this.webviewReady) {
			await this.panel.webview.postMessage(message);
		}
	}

	private async refreshFromServer(reason: string): Promise<void> {
		if (!this.webviewReady) return;
		if (this.refreshInFlight) {
			await this.postMessage({ command: 'status', text: 'Still waiting for the previous coverage response…' });
			return this.refreshInFlight;
		}

		this.refreshInFlight = (async () => {
			try {
				const data = await this.client.sendRequest<WorkspaceCoverage>('rdfusion/coverage', {});
				this.output.appendLine(`[SHACL Coverage] coverage returned ${data?.shapes?.length ?? 0} shape(s), ${data?.dataDocumentsCount ?? 0} data doc(s)`);
				if (!data || !Array.isArray(data.shapes)) {
					await this.postMessage({ command: 'error', error: 'Unexpected coverage response from server.' });
					return;
				}
				await this.postMessage({ command: 'setData', data, reason });
			} catch (err: any) {
				const message = `Could not compute SHACL coverage: ${err?.message ?? String(err)}`;
				this.output.appendLine(`[SHACL Coverage] ${message}`);
				await this.postMessage({ command: 'error', error: message });
			} finally {
				this.refreshInFlight = undefined;
			}
		})();

		return this.refreshInFlight;
	}

	private async startIndex(reason: string, force = false): Promise<void> {
		if (!this.webviewReady) return;
		if (this.indexInFlight && !force) {
			await this.postMessage({ command: 'status', text: 'Workspace RDF scan is already running…' });
			return;
		}
		if (this.hasStartedInitialIndex && !force) {
			return;
		}
		this.hasStartedInitialIndex = true;
		await this.postMessage({ command: 'status', text: reason });
		this.indexInFlight = this.ensureWorkspaceRdfIndex(progress => {
			void this.postMessage({ command: 'status', text: progress.message, progress });
		});
		try {
			const result = await this.indexInFlight;
			const message = `Coverage scan finished: ${result.indexed}/${result.candidates} indexed file(s), ${result.shapes} root SHACL shape(s), ${result.failed} failed.`;
			this.output.appendLine(`[SHACL Coverage] ${message}`);
			await this.postMessage({ command: 'status', text: message, progress: result });
			await this.refreshFromServer('Workspace coverage scan finished');
		} catch (err: any) {
			const message = `Coverage scan failed: ${err?.message ?? String(err)}`;
			this.output.appendLine(`[SHACL Coverage] ${message}`);
			await this.postMessage({ command: 'error', error: message });
		} finally {
			this.indexInFlight = undefined;
		}
	}

	private getShellHtml(): string {
		return `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
:root{--border:var(--vscode-editorWidget-border);--bg:var(--vscode-editor-background);--fg:var(--vscode-foreground);--muted:var(--vscode-descriptionForeground);--accent:var(--vscode-focusBorder);--warn:var(--vscode-editorWarning-foreground);--err:var(--vscode-editorError-foreground);--ok:var(--vscode-testing-iconPassed)}
*{box-sizing:border-box}body{font-family:var(--vscode-font-family);padding:12px;color:var(--fg);background:var(--bg);line-height:1.45}button,select,input{font-family:inherit}button{cursor:pointer}code{word-break:break-all}.toolbar{position:sticky;top:0;background:var(--bg);padding:0 0 12px;border-bottom:1px solid var(--border);z-index:2}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.muted{color:var(--muted)}.status{margin-top:8px;color:var(--muted)}.hero{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:12px 0}.card{border:1px solid var(--border);border-radius:10px;padding:12px;background:rgba(127,127,127,.04)}.card.primary{border-color:var(--accent)}.label{color:var(--muted);font-size:12px}.big{font-size:2em;font-weight:800;line-height:1.1}.small{font-size:.9em}.pill{border:1px solid var(--border);border-radius:999px;padding:2px 8px;white-space:nowrap;font-size:12px}.pill.ok{border-color:var(--ok);color:var(--ok)}.pill.warn{border-color:var(--warn);color:var(--warn)}.pill.err{border-color:var(--err);color:var(--err)}.warning{color:var(--warn)}.ok{color:var(--ok)}.tabs{display:flex;gap:6px;margin:12px 0 8px}.tab{padding:6px 10px;border:1px solid var(--border);background:transparent;color:var(--fg);border-radius:999px}.tab.active{border-color:var(--accent);background:rgba(127,127,127,.08)}.panel{display:none}.panel.active{display:block}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.search,.select{padding:6px 8px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px}.search{min-width:280px;flex:1}.sectionHead{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}.shapeCard{border:1px solid var(--border);border-radius:10px;margin:8px 0;background:rgba(127,127,127,.03);overflow:hidden}.shapeCard>summary{cursor:pointer;padding:10px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.shapeCard[open]>summary{border-bottom:1px solid var(--border);background:rgba(127,127,127,.04)}.shapeBody{padding:10px}.shapeTitle{font-weight:700}.shapeMeta{display:flex;gap:6px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.metric{border:1px solid var(--border);border-radius:10px;padding:10px;background:rgba(127,127,127,.04)}.metricValue{font-size:1.4em;font-weight:700}.bar{height:8px;border:1px solid var(--border);border-radius:999px;overflow:hidden;background:rgba(127,127,127,.08);margin-top:8px}.fill{height:100%;background:var(--accent)}.hint{border-left:3px solid var(--accent);padding:8px 10px;background:rgba(127,127,127,.04);margin:10px 0}.pathTable{width:100%;border-collapse:collapse;margin-top:8px}.pathTable th,.pathTable td{text-align:left;border-bottom:1px solid var(--border);padding:7px;vertical-align:top}.pathTable th{color:var(--muted);font-weight:600}.listBlock{border:1px solid var(--border);border-radius:10px;margin:8px 0;overflow:hidden}.listBlock summary{cursor:pointer;padding:10px;font-weight:700;background:rgba(127,127,127,.04)}.listBody{padding:10px}.listBody ul{margin:6px 0 0 20px}.empty{padding:14px;border:1px dashed var(--border);border-radius:10px;margin-top:12px}.hidden{display:none!important}@media(max-width:760px){.top{display:block}}
</style></head><body>
	<div class="toolbar">
	<div class="top">
		<div>
		<h2 style="margin:0">RDFusion SHACL Data Coverage</h2>
		<div class="muted">Coverage shows what the active SHACL selection governs in the indexed RDF data.</div>
			<div class="context">
			<span><b>Resources:</b> RDF subjects targeted by shapes</span>
			<span><b>Fields:</b> data predicates matched by selected paths</span>
			<span><b>Measured paths:</b> simple IRI <code>sh:path</code> values</span>
			<span><b>Gaps:</b> predicates, classes, or shapes not covered</span>
			</div>
		</div>
		<button id="refresh">Refresh / Scan Workspace</button>
	</div>
	<div id="status" class="status">Connecting…</div>
	</div>
<main id="root"><div class="empty">Waiting for coverage data…</div></main>
<script>
(function(){
 const vscode = acquireVsCodeApi();
 const root = document.getElementById('root');
 const status = document.getElementById('status');
 const refresh = document.getElementById('refresh');
 const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const pct = (n) => Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '0.0';
 const num = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;
 function pctBar(n){ const v = Math.max(0, Math.min(100, Number(n) || 0)); return '<div class="bar"><div class="fill" style="width:'+v+'%"></div></div>'; }
 function ratio(a,b){ return num(b) > 0 ? esc(a)+' / '+esc(b) : 'No data'; }
 function card(title,value,detail,n,primary){ return '<div class="card '+(primary?'primary':'')+'"><div class="label">'+esc(title)+'</div><div class="big">'+esc(value)+'</div>'+(detail?'<div class="small">'+detail+'</div>':'')+(Number.isFinite(Number(n))?pctBar(n):'')+'</div>'; }
 function metric(title,value,detail,n){ return '<div class="metric"><div class="label">'+esc(title)+'</div><div class="metricValue">'+esc(value)+'</div>'+(detail?'<div class="small">'+detail+'</div>':'')+(Number.isFinite(Number(n))?pctBar(n):'')+'</div>'; }
 function iriText(items){ return Array.isArray(items) && items.length ? items.map(esc).join(', ') : ''; }
 function shapeLabel(shape){ return shape.name || shape.label || shape.shapeIri || '(unnamed shape)'; }
 function shapeText(shape){
   return [
     shapeLabel(shape),
     shape.shapeIri,
     shape.description,
     ...(shape.targetClasses || []),
     ...(shape.targetNodes || []),
     ...(shape.targetSubjectsOf || []),
     ...(shape.targetObjectsOf || []),
     ...((shape.properties || []).flatMap(p => [p.pathIri, p.pathDisplay, p.label, p.summary]))
   ].filter(Boolean).join(' ').toLowerCase();
 }
 function targets(shape){
   const parts = [];
   if (shape.targetClasses?.length) parts.push('<div><strong>Target classes:</strong> '+iriText(shape.targetClasses)+'</div>');
   if (shape.targetNodes?.length) parts.push('<div><strong>Target nodes:</strong> '+iriText(shape.targetNodes)+'</div>');
   if (shape.targetSubjectsOf?.length) parts.push('<div><strong>Subjects of:</strong> '+iriText(shape.targetSubjectsOf)+'</div>');
   if (shape.targetObjectsOf?.length) parts.push('<div><strong>Objects of:</strong> '+iriText(shape.targetObjectsOf)+'</div>');
   return parts.length ? parts.join('') : '<span class="muted">No measured targets.</span>';
 }
 function propertyRows(shape){
   const props = Array.isArray(shape.properties) ? shape.properties : [];
   if (!props.length) return '<div class="empty">No selected paths.</div>';
   return '<table class="pathTable"><thead><tr><th>Path</th><th>Present on</th><th>Missing</th></tr></thead><tbody>' +
     props.map(p => {
       const focus = num(p.focusNodes);
       const withProp = num(p.nodesWithProperty);
       const missing = Number.isFinite(Number(p.missingNodes)) ? num(p.missingNodes) : Math.max(0, focus - withProp);
       const path = p.pathIri || p.pathDisplay || p.label || '(unmeasured path)';
       const missingText = p.unmeasuredReason ? '<span class="warning">'+esc(p.unmeasuredReason)+'</span>' : esc(missing);
       return '<tr><td><code>'+esc(path)+'</code>'+(p.summary?'<div class="muted">'+esc(p.summary)+'</div>':'')+'</td><td>'+ratio(withProp, focus)+'</td><td>'+missingText+'</td></tr>';
     }).join('') + '</tbody></table>';
 }
 function listBlock(title, items, open){
   const arr = Array.isArray(items) ? items : [];
   return '<details class="listBlock" '+(open?'open':'')+'><summary>'+esc(title)+' <span class="pill">'+arr.length+'</span></summary><div class="listBody">' +
     (arr.length ? '<ul>'+arr.slice(0,150).map(x => '<li><code>'+esc(x)+'</code></li>').join('')+'</ul>' : '<p class="muted">None.</p>') +
     (arr.length > 150 ? '<p class="muted">Showing first 150.</p>' : '') + '</div></details>';
 }
 function tabButton(id,label,count){
   return '<button class="tab" data-tab="'+esc(id)+'">'+esc(label)+(count !== undefined ? ' <span class="pill">'+esc(count)+'</span>' : '')+'</button>';
 }
 function activateTab(id){
   document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === id));
   document.querySelectorAll('.panel').forEach(x => x.classList.toggle('active', x.id === 'panel-'+id));
 }
 function shapeStatus(shape){
   if (num(shape.focusNodes) === 0) return 'No data';
   if (num(shape.fieldCoveragePct) < 50) return 'Low coverage';
   return 'Covered';
 }
 function shapePill(shape){
   const s = shapeStatus(shape);
   const cls = s === 'Covered' ? 'ok' : s === 'Low coverage' ? 'warn' : 'err';
   return '<span class="pill '+cls+'">'+esc(s)+'</span>';
 }
 function renderShapeCard(shape, index){
   const label = shapeLabel(shape);
   const nodePct = Number.isFinite(Number(shape.nodeCoveragePct)) ? shape.nodeCoveragePct : shape.coveragePct;
   const fieldPct = Number.isFinite(Number(shape.fieldCoveragePct)) ? shape.fieldCoveragePct : 0;
   const presencePct = Number.isFinite(Number(shape.propertyPresencePct)) ? shape.propertyPresencePct : 0;
   return '<details class="shapeCard" data-shape-index="'+index+'" data-text="'+esc(shapeText(shape))+'" data-focus="'+esc(num(shape.focusNodes))+'" data-field="'+esc(num(fieldPct))+'">' +
     '<summary><div><div class="shapeTitle">'+esc(label)+'</div><div class="muted"><code>'+esc(shape.shapeIri)+'</code></div></div><div class="shapeMeta">'+shapePill(shape)+'<span class="pill">'+esc(shape.focusNodes)+' focus node(s)</span><span class="pill">'+pct(fieldPct)+'% fields</span></div></summary>' +
     '<div class="shapeBody">' +
     (shape.description ? '<p>'+esc(shape.description)+'</p>' : '') +
     '<div class="grid">' +
     metric('Covered focus nodes', pct(nodePct)+'%', ratio(shape.coveredFocusNodes, shape.focusNodes), nodePct) +
     metric('Covered fields', pct(fieldPct)+'%', ratio(shape.governedFieldAssertionsOnFocusNodes || 0, shape.fieldAssertionsOnFocusNodes || 0), fieldPct) +
     metric('Selected paths present', pct(presencePct)+'%', ratio(shape.propertySlotsPresent || 0, shape.propertySlotsTotal || 0), presencePct) +
     '</div>' +
     '<div class="hint">'+targets(shape)+'</div>' +
     propertyRows(shape) +
     '</div></details>';
 }
 function applyShapeFilters(){
   const q = (document.getElementById('shapeSearch')?.value || '').trim().toLowerCase();
   const filter = document.getElementById('shapeFilter')?.value || 'all';
   let visible = 0;
   document.querySelectorAll('.shapeCard').forEach(card => {
     const text = card.dataset.text || '';
     const focus = num(card.dataset.focus);
     const field = num(card.dataset.field);
     const matchesSearch = !q || text.includes(q);
     let matchesFilter = true;
     if (filter === 'withData') matchesFilter = focus > 0;
     if (filter === 'noData') matchesFilter = focus === 0;
     if (filter === 'lowCoverage') matchesFilter = focus === 0 || field < 50;
     if (filter === 'covered') matchesFilter = focus > 0 && field >= 80;
     const show = matchesSearch && matchesFilter;
     card.classList.toggle('hidden', !show);
     if (show) visible++;
   });
   const count = document.getElementById('shapeVisibleCount');
   if (count) count.textContent = visible+' visible';
 }
 function render(data, reason){
   const shapes = Array.isArray(data.shapes) ? data.shapes : [];
   const uncoveredSubjects = Math.max(0, num(data.totalDataSubjects) - num(data.governedDataSubjectsCount));
   const uncoveredPredicates = Array.isArray(data.orphanPredicates) ? data.orphanPredicates.length : 0;
   const uncoveredClasses = Array.isArray(data.orphanClasses) ? data.orphanClasses.length : 0;
   const deadShapes = Array.isArray(data.deadShapes) ? data.deadShapes.length : 0;
   const gapCount = uncoveredPredicates + uncoveredClasses + deadShapes;
   const hero = '<section class="hero">' +
     card('Covered resources', pct(data.dataNodeCoveragePct)+'%', ratio(data.governedDataSubjectsCount, data.totalDataSubjects), data.dataNodeCoveragePct, true) +
     card('Not covered', esc(uncoveredSubjects), 'RDF subject(s)', undefined, false) +
     card('Covered fields', pct(data.governedFieldCoveragePct)+'%', ratio(data.governedPredicateAssertionsCount, data.totalPredicateAssertionsOnGovernedSubjects), data.governedFieldCoveragePct, false) +
     card('Active shapes', esc(shapes.length), esc(data.measuredPathsCount)+' measured path(s)', undefined, false) +
     '</section>';
   const tabs = '<div class="tabs">'+tabButton('shapes','Shapes',shapes.length)+tabButton('gaps','Not covered',gapCount)+'</div>';
   const shapesPanel = '<section id="panel-shapes" class="panel active"><div class="sectionHead"><div><h3 style="margin:0">Shapes</h3><div class="muted">Search, filter, and open a shape.</div></div><span id="shapeVisibleCount" class="pill">'+shapes.length+' visible</span></div><div class="controls"><input id="shapeSearch" class="search" placeholder="Search shape, target, path, or IRI"><select id="shapeFilter" class="select"><option value="all">All</option><option value="withData">Has data</option><option value="noData">No data</option><option value="lowCoverage">Low coverage</option><option value="covered">Covered</option></select></div>' +
     (shapes.length ? shapes.map(renderShapeCard).join('') : '<div class="empty">No shapes found.</div>') + '</section>';
   const gapsPanel = '<section id="panel-gaps" class="panel"><div class="sectionHead"><div><h3 style="margin:0">Not covered</h3><div class="muted">Predicates, classes, and shapes missing from the active coverage.</div></div></div>' +
     listBlock('Predicates without selected SHACL paths', data.orphanPredicates, true) +
     listBlock('Classes without selected target shapes', data.orphanClasses, false) +
     listBlock('Shapes with no matching data', data.deadShapes, false) +
     (num(data.unmeasuredPathsCount) > 0 ? '<div class="card"><div class="label">Unmeasured paths</div><div class="big">'+esc(data.unmeasuredPathsCount)+'</div></div>' : '') +
     '</section>';
   root.innerHTML = hero + tabs + shapesPanel + gapsPanel;
   document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
   document.getElementById('shapeSearch')?.addEventListener('input', applyShapeFilters);
   document.getElementById('shapeFilter')?.addEventListener('change', applyShapeFilters);
   activateTab('shapes');
   applyShapeFilters();
   status.textContent = reason ? 'Updated: '+reason : 'Coverage loaded.';
 }
 refresh.addEventListener('click', () => vscode.postMessage({ command:'refresh' }));
 window.addEventListener('message', event => {
   const msg = event.data || {};
   if (msg.command === 'status') status.textContent = msg.text || '';
   if (msg.command === 'error') { status.textContent = msg.error || 'Error'; root.innerHTML = '<div class="empty warning">'+esc(msg.error || 'Error')+'</div>'; }
   if (msg.command === 'setData') render(msg.data, msg.reason);
 });
 status.textContent = 'Requesting coverage…';
 vscode.postMessage({ command:'ready' });
})();
</script></body></html>`;
	}
}