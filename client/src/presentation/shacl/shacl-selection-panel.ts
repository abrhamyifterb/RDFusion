/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import type { WorkspaceIndexProgress, WorkspaceIndexResult } from '../../utils/workspace-notifier';

interface ShaclSelectionSettings {
	mode: 'auto' | 'custom';
	custom?: {
		files: {
			fileUri: string;
			shapes: {
				shapeId: string;
				enabledTargets?: string[];
				enabledPropertyShapeIds?: string[];
			}[];
		}[];
	};
}

interface ListShapesResponse {
	selection: ShaclSelectionSettings;
	revision: number;
	files: {
		uri: string;
		fileName: string;
		filePath?: string;
		shapeCount?: number;
		targetCount?: number;
		propertyCount?: number;
		shapes?: {
			id: string;
			subjectValue: string;
			label: string;
			name?: string;
			description?: string;
			targetKeys: string[];
			targets: { key: string; value: string; display: string }[];
			properties: { id: string; path?: string; pathDisplay: string; label: string; summary: string }[];
		}[];
		targetGroups: {
			targetKey: string;
			targetLabel: string;
			targetDisplay: string;
			shapes: {
				id: string;
				subjectValue: string;
				label: string;
				name?: string;
				description?: string;
				targetKeys: string[];
				properties: { id: string; path?: string; pathDisplay: string; label: string; summary: string }[];
			}[];
		}[];
	}[];
}

type EnsureWorkspaceShaclIndex = (onProgress?: (progress: WorkspaceIndexProgress) => void) => Promise<WorkspaceIndexResult>;

function normalizeSelection(raw: any): ShaclSelectionSettings {
	if (!raw || typeof raw !== 'object' || raw.mode !== 'custom') {
		return { mode: 'auto' };
	}
	const files = (Array.isArray(raw.custom?.files) ? raw.custom.files : [])
		.filter((file: any) => file && typeof file.fileUri === 'string' && file.fileUri.trim().length > 0)
		.map((file: any) => ({
			fileUri: file.fileUri,
			shapes: (Array.isArray(file.shapes) ? file.shapes : [])
				.filter((shape: any) => shape && typeof shape.shapeId === 'string' && shape.shapeId.trim().length > 0)
				.map((shape: any) => {
					const out: any = { shapeId: shape.shapeId };
					if (Array.isArray(shape.enabledTargets)) {
						out.enabledTargets = shape.enabledTargets.filter((v: any) => typeof v === 'string' && v.trim().length > 0);
					}
					if (Array.isArray(shape.enabledPropertyShapeIds)) {
						out.enabledPropertyShapeIds = shape.enabledPropertyShapeIds.filter((v: any) => typeof v === 'string' && v.trim().length > 0);
					}
					return out;
				})
		}))
		.filter((file: any) => file.shapes.length > 0);
	return { mode: 'custom', custom: { files } };
}

export class ShaclSelectionPanel {
	public static currentPanel: ShaclSelectionPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly disposables: vscode.Disposable[] = [];
	private webviewReady = false;
	private indexInFlight: Promise<WorkspaceIndexResult> | undefined;
	private hasStartedInitialIndex = false;
	private refreshInFlight: Promise<void> | undefined;

	private constructor(
		panel: vscode.WebviewPanel,
		private readonly client: LanguageClient,
		private readonly ensureWorkspaceShaclIndex: EnsureWorkspaceShaclIndex,
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
					void this.refreshFromServer('Selection changed');
				}
			}),
			vscode.workspace.onDidSaveTextDocument(doc => {
				if (doc.languageId === 'turtle' || doc.languageId === 'jsonld') {
					void this.refreshFromServer('Document saved');
				}
			}),
			vscode.window.onDidChangeActiveTextEditor(editor => {
				if (editor?.document.languageId === 'turtle' || editor?.document.languageId === 'jsonld') {
					void this.refreshFromServer('Active RDF editor changed');
				}
			})
		);
	}

	public static createOrShow(
		_extensionUri: vscode.Uri,
		client: LanguageClient,
		ensureWorkspaceShaclIndex: EnsureWorkspaceShaclIndex,
		output: vscode.OutputChannel,
	): void {
		const column = vscode.window.activeTextEditor?.viewColumn;
		if (ShaclSelectionPanel.currentPanel) {
			ShaclSelectionPanel.currentPanel.panel.reveal(column);
			void ShaclSelectionPanel.currentPanel.refreshFromServer('Panel revealed');
			void ShaclSelectionPanel.currentPanel.startIndex('Background scan requested');
			return;
		}
		const panel = vscode.window.createWebviewPanel(
			'rdfusionShaclSelection',
			'RDFusion SHACL Selection',
			column || vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true }
		);
		ShaclSelectionPanel.currentPanel = new ShaclSelectionPanel(panel, client, ensureWorkspaceShaclIndex, output);
	}

	public dispose(): void {
		ShaclSelectionPanel.currentPanel = undefined;
		this.disposables.forEach(d => d.dispose());
	}

	private toRelativePath(fileUri: string, fallback: string): string {
		try {
			const uri = vscode.Uri.parse(fileUri);
			const folder = vscode.workspace.getWorkspaceFolder(uri);
			if (!folder) {
				return fallback;
			}
			const relative = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
			return relative || fallback;
		} catch {
			return fallback;
		}
	}

	private async handleMessage(msg: any): Promise<void> {
		this.output.appendLine(`[SHACL Panel] message: ${msg?.command ?? '<unknown>'}`);
		if (msg.command === 'ready') {
			this.webviewReady = true;
			await this.postMessage({ command: 'status', text: 'Webview connected. Showing current SHACL index, then scanning workspace in the background…' });
			void this.refreshFromServer('Initial load');
			void this.startIndex('Scanning workspace for SHACL shapes…');
			return;
		}
		if (msg.command === 'apply') {
			const cfg = vscode.workspace.getConfiguration('rdfusion');
			try {
				await cfg.update('shacl.selection', normalizeSelection(msg.selection), vscode.ConfigurationTarget.Global);
				await this.postMessage({ command: 'applied' });
				await this.refreshFromServer('Selection applied');
			} catch (err: any) {
				await this.postMessage({ command: 'error', error: err?.message ?? String(err) });
			}
			return;
		}
		if (msg.command === 'refresh') {
			void this.startIndex('Manual refresh requested…', true);
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
			await this.postMessage({ command: 'status', text: 'Still waiting for the previous SHACL shape list response…' });
			return this.refreshInFlight;
		}

		this.refreshInFlight = (async () => {
			const cfg = vscode.workspace.getConfiguration('rdfusion');
			const selection = normalizeSelection(cfg.get<ShaclSelectionSettings>('shacl.selection', { mode: 'auto' }));
			let softTimer: NodeJS.Timeout | undefined;
			try {
				softTimer = setTimeout(() => {
					void this.postMessage({
						command: 'status',
						text: 'The server is still preparing the SHACL shape list. The panel will update when the response arrives.'
					});
				}, 5000);

				const data = await this.client.sendRequest<ListShapesResponse>('rdfusion/shacl/listShapes', {});
				this.output.appendLine(`[SHACL Panel] listShapes returned ${data?.files?.length ?? 0} file(s)`);
				if (!data || !Array.isArray(data.files)) {
					await this.postMessage({ command: 'error', error: 'Unexpected SHACL response from server.' });
					return;
				}

				const dataWithPaths: ListShapesResponse = {
					...data,
					files: data.files.map(file => ({
						...file,
						filePath: this.toRelativePath(file.uri, file.fileName)
					}))
				};

				await this.postMessage({ command: 'setData', data: dataWithPaths, selection, reason });
			} catch (err: any) {
				const message = `Could not list SHACL shapes: ${err?.message ?? String(err)}`;
				this.output.appendLine(`[SHACL Panel] ${message}`);
				await this.postMessage({ command: 'error', error: message });
			} finally {
				if (softTimer) clearTimeout(softTimer);
				this.refreshInFlight = undefined;
			}
		})();

		return this.refreshInFlight;
	}

	private async startIndex(reason: string, force = false): Promise<void> {
		if (!this.webviewReady) return;
		if (this.indexInFlight && !force) {
			await this.postMessage({ command: 'status', text: 'SHACL workspace scan is already running…' });
			return;
		}
		if (this.hasStartedInitialIndex && !force) {
			return;
		}
		this.hasStartedInitialIndex = true;
		await this.postMessage({ command: 'status', text: reason });
		this.indexInFlight = this.ensureWorkspaceShaclIndex(progress => {
			void this.postMessage({ command: 'status', text: progress.message, progress });
		});
		try {
			const result = await this.indexInFlight;
			const message = `SHACL scan finished: ${result.indexed}/${result.candidates} candidate file(s), ${result.shapes} root shape(s), ${result.failed} failed.`;
			this.output.appendLine(`[SHACL Panel] ${message}`);
			await this.postMessage({ command: 'status', text: message, progress: result });
			await this.refreshFromServer('Workspace SHACL scan finished');
		} catch (err: any) {
			const message = `SHACL scan could not finish: ${err?.message ?? String(err)}`;
			this.output.appendLine(`[SHACL Panel] ${message}`);
			await this.postMessage({ command: 'error', error: message });
		} finally {
			this.indexInFlight = undefined;
		}
	}

	private getShellHtml(): string {
		return `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
:root{--border:var(--vscode-editorWidget-border);--bg:var(--vscode-editor-background);--fg:var(--vscode-foreground);--muted:var(--vscode-descriptionForeground);--accent:var(--vscode-focusBorder);}
*{box-sizing:border-box}body{font-family:var(--vscode-font-family);padding:12px;color:var(--fg);background:var(--bg);}
.toolbar{position:sticky;top:0;background:var(--bg);padding:0 0 12px;border-bottom:1px solid var(--border);z-index:2;box-shadow:0 6px 12px rgba(0,0,0,.08)}
.header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.title{font-size:16px;font-weight:700}.help{color:var(--muted);line-height:1.45;margin-top:4px;max-width:920px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mode{border:1px solid var(--border);border-radius:8px;padding:7px 10px;background:var(--vscode-editorWidget-background)}
.pill{padding:2px 8px;border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--muted)}.pill.strong{color:var(--fg);border-color:var(--accent)}
.notice{border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin:10px 0;line-height:1.45}.notice.info{background:var(--vscode-textBlockQuote-background)}.muted{color:var(--muted)}.status{font-size:12px;color:var(--muted)}.error{color:var(--vscode-errorForeground)}
button{padding:6px 10px;border:1px solid var(--vscode-button-border,transparent);background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:4px;cursor:pointer}button.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}button:disabled{opacity:.55;cursor:not-allowed}
.search{padding:6px 8px;min-width:260px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px}
details.file{border:1px solid var(--border);border-radius:10px;margin:10px 0;overflow:hidden}details.file>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px;background:var(--vscode-sideBar-background);cursor:pointer}.content{padding:10px}
.shape{border:1px solid var(--border);border-radius:8px;padding:9px;margin:8px 0;background:var(--vscode-editorWidget-background)}.shape.selected{outline:1px solid var(--accent)}.targetsLine{margin:8px 0 0 24px;display:flex;gap:8px;flex-wrap:wrap}.targetChoice{border:1px solid var(--border);border-radius:999px;padding:4px 8px;background:var(--vscode-editor-background)}
.shapeTop{display:flex;gap:8px;align-items:flex-start}.shapeName{font-weight:600}.mono{font-family:var(--vscode-editor-font-family);font-size:.95em}.desc{margin:5px 0 0 24px;color:var(--muted);line-height:1.4}.props{margin:8px 0 0 24px}.prop{padding:4px 0}.propSummary{color:var(--muted);font-size:12px;margin-left:24px}.hidden{display:none!important}input[type="checkbox"]{vertical-align:middle}.autoDisabled input[type="checkbox"]{opacity:.6}.divider{height:1px;background:var(--border);margin:8px 0}.empty{padding:18px;text-align:center;color:var(--muted)}
</style></head><body>
<div class="toolbar">
  <div class="header"><div><div class="title">RDFusion SHACL Selection</div><div class="help">Auto mode validates with every indexed root shape. Custom mode validates only checked targets/properties. Empty custom selection intentionally disables SHACL validation.</div></div><span id="status" class="status"></span></div>
  <div class="row">
    <label class="mode"><input type="radio" name="mode" value="auto"> Auto: all indexed shapes</label>
    <label class="mode"><input type="radio" name="mode" value="custom"> Custom: only checked items</label>
    <input id="search" class="search" placeholder="Filter by file, target, shape, path, message…">
    <button id="apply">Apply</button>
    <button id="refresh" class="secondary">Refresh / Scan</button>
    <button id="selectVisible" class="secondary">Select visible</button>
    <button id="clearCustom" class="secondary">Clear custom</button>
  </div>
  <div class="row" style="margin-top:8px"><span id="sumMode" class="pill strong">Mode: Auto</span><span id="sumFiles" class="pill">Files: Auto</span><span id="sumTargets" class="pill">Targets: Auto</span><span id="sumProps" class="pill">Properties: Auto</span><span id="sumIndexed" class="pill">Indexed: 0</span></div>
</div>
<div id="modeNotice" class="notice info"></div>
<div id="root" style="margin-top:12px"><div class="notice error">The SHACL selection view is loading. If this message remains, reload the RDFusion panel.</div></div>
<script>
(function(){
'use strict';
const root=document.getElementById('root');
const statusEl=document.getElementById('status');
const modeNotice=document.getElementById('modeNotice');
const radios=[...document.querySelectorAll('input[name="mode"]')];
let state={data:{files:[]},selection:{mode:'auto'}};
let hasData=false;
let gotExtensionResponse=false;
let vscode;
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function k(){return [...arguments].join('||')}
function currentMode(){return (radios.find(r=>r.checked)||{}).value||'auto'}
function setMode(m){radios.forEach(r=>r.checked=r.value===m)}
function isVisible(el){return !el.classList.contains('hidden') && !el.closest('.hidden')}
function setRootMessage(text,isError){if(hasData)return;root.innerHTML='<div class="notice '+(isError?'error':'muted')+'">'+esc(text)+'</div>'}
function setStatus(s,isError){statusEl.textContent=s||'';statusEl.className=isError?'status error':'status';if(s&&!hasData)setRootMessage(s,isError)}
function short(v){v=String(v||'');let i=Math.max(v.lastIndexOf('#'),v.lastIndexOf('/'));return i>=0?v.slice(i+1):v}
function selectionShapeMap(){const m=new Map();for(const f of state.selection.custom?.files||[]){for(const sh of f.shapes||[]){m.set(k(f.fileUri,sh.shapeId),sh)}}return m}
function allShapeRows(file,shape){return [...document.querySelectorAll('.cb-shape-target')].filter(x=>x.dataset.file===file&&x.dataset.shape===shape)}
function propertyRows(file,shape){return [...document.querySelectorAll('.cb-prop')].filter(x=>x.dataset.file===file&&x.dataset.shape===shape)}
function setCheckbox(cb,checked){cb.checked=checked;cb.indeterminate=false}
function updateParentState(){
  document.querySelectorAll('.shape').forEach(sh=>{const file=sh.dataset.file,shape=sh.dataset.shapeid;const targets=allShapeRows(file,shape);const any=targets.some(x=>x.checked);sh.classList.toggle('selected',any)});
  document.querySelectorAll('.target').forEach(t=>{const kids=[...t.querySelectorAll('.cb-shape-target')];const cb=t.querySelector('.cb-target');const checked=kids.filter(x=>x.checked).length;if(cb){cb.checked=kids.length>0&&checked===kids.length;cb.indeterminate=checked>0&&checked<kids.length}});
  document.querySelectorAll('details.file').forEach(d=>{const kids=[...d.querySelectorAll('.cb-shape-target')];const cb=d.querySelector('.cb-file');const checked=kids.filter(x=>x.checked).length;if(cb){cb.checked=kids.length>0&&checked===kids.length;cb.indeterminate=checked>0&&checked<kids.length}});
}
function applyModeEnabled(){const custom=currentMode()==='custom';document.body.classList.toggle('autoDisabled',!custom);document.querySelectorAll('.cb-file,.cb-target,.cb-shape-target,.cb-prop,#selectVisible,#clearCustom').forEach(x=>x.disabled=!custom);modeNotice.innerHTML=custom?'<b>Custom mode:</b> only checked target rows are used for SHACL validation. Checked properties limit that shape to those property shapes; leaving all properties checked uses the full shape.': '<b>Auto mode:</b> all indexed root shapes are used. The checkboxes below are intentionally unchecked/disabled because Auto does not save a manual selection.'}
function clearAll(){document.querySelectorAll('.cb-file,.cb-target,.cb-shape-target,.cb-prop').forEach(cb=>setCheckbox(cb,false));updateParentState();updateSummary()}
function selectVisible(){if(currentMode()!=='custom')return;document.querySelectorAll('.shape').forEach(sh=>{if(!isVisible(sh))return;sh.querySelectorAll('.cb-shape-target,.cb-prop').forEach(cb=>setCheckbox(cb,true))});updateParentState();updateSummary()}
function render(){
  hasData=true;root.innerHTML='';
  const saved=state.selection&&state.selection.mode==='custom'?state.selection:{mode:'auto'};
  setMode(saved.mode||'auto');
  const files=state.data.files||[];
  const uniqueShapeCount=files.reduce((n,f)=>n+collectShapes(f).length,0);
  document.getElementById('sumIndexed').textContent='Indexed: '+uniqueShapeCount+' shapes';
  if(!files.length){hasData=false;root.innerHTML='<div class="empty">No SHACL root shapes are indexed yet.<br><br>Use <b>Refresh / Scan</b>. Root shapes are discovered from sh:NodeShape, sh:Shape, targeted shapes, and shapes with sh:property.</div>';applyModeEnabled();updateSummary();return}
  const sm=selectionShapeMap();
  for(const f of files){
    const shapes=collectShapes(f);
    const displayPath=f.filePath||f.fileName;
    const det=document.createElement('details');det.className='file';det.open=false;det.dataset.file=f.uri;det.dataset.text=(displayPath+' '+f.uri+' '+shapes.map(s=>s.text).join(' ')).toLowerCase();
    const targetCount=new Set(shapes.flatMap(s=>s.targets.map(t=>t.key))).size;
    const propCount=shapes.reduce((n,s)=>n+(s.properties||[]).length,0);
    const sum=document.createElement('summary');sum.innerHTML='<span><input type="checkbox" class="cb-file"> <b>'+esc(displayPath)+'</b></span><span class="row"><span class="pill">Targets: '+targetCount+'</span><span class="pill">Shapes: '+shapes.length+'</span><span class="pill">Properties: '+propCount+'</span></span>';det.appendChild(sum);
    const content=document.createElement('div');content.className='content';
    for(const sh of shapes){
      const selected=saved.mode==='custom'?sm.get(k(f.uri,sh.id)):undefined;
      const shape=document.createElement('div');shape.className='shape';shape.dataset.file=f.uri;shape.dataset.shapeid=sh.id;shape.dataset.text=sh.text.toLowerCase();
      const descText=displayDescription(sh.description, sh.name, sh.label, short(sh.subjectValue));
      const desc=descText?'<div class="desc"><b>Message:</b> '+esc(descText)+'</div>':'';
      shape.innerHTML='<div class="shapeTop"><div style="flex:1"><div class="shapeName">'+esc(sh.name||sh.label||short(sh.subjectValue))+'</div><div class="muted mono">'+esc(short(sh.subjectValue||sh.id))+'</div></div><span class="pill">'+sh.targets.length+' target(s)</span><span class="pill">'+(sh.properties||[]).length+' propert'+((sh.properties||[]).length===1?'y':'ies')+'</span></div>'+desc+'<div class="targetsLine"></div><div class="props"></div>';
      const targetsLine=shape.querySelector('.targetsLine');
      for(const target of sh.targets){
        const shapeChecked=!!selected && (!selected.enabledTargets || selected.enabledTargets.includes(target.key));
        const label=document.createElement('label');label.className='targetChoice';
        label.innerHTML='<input type="checkbox" class="cb-shape-target" data-file="'+esc(f.uri)+'" data-shape="'+esc(sh.id)+'" data-target="'+esc(target.key)+'" '+(shapeChecked?'checked':'')+'> <span>'+esc(target.display||short(target.value)||'No explicit target')+'</span>';
        targetsLine.appendChild(label);
      }
      const props=shape.querySelector('.props');
      const anyTargetChecked=!!selected && Array.from(targetsLine.querySelectorAll('.cb-shape-target')).some(cb=>cb.checked);
      for(const p of sh.properties||[]){
        const pChecked=anyTargetChecked && (!selected?.enabledPropertyShapeIds || selected.enabledPropertyShapeIds.includes(p.id));
        const div=document.createElement('div');div.className='prop';div.dataset.text=(p.pathDisplay+' '+p.label+' '+p.summary).toLowerCase();
        const propSummary=displayDescription(p.summary, p.label, p.pathDisplay, sh.description);
        div.innerHTML='<label><input type="checkbox" class="cb-prop" data-file="'+esc(f.uri)+'" data-shape="'+esc(sh.id)+'" data-prop="'+esc(p.id)+'" '+(pChecked?'checked':'')+'> <span class="mono">'+esc(p.pathDisplay)+'</span> '+esc(p.label)+'</label>'+(propSummary?'<div class="propSummary">'+esc(propSummary)+'</div>':'');
        props.appendChild(div);
      }
      content.appendChild(shape);
    }
    det.appendChild(content);root.appendChild(det);
  }
  wire();applyModeEnabled();updateParentState();updateSummary();filter();
}
function textKey(v){return String(v||'').replace(/\\s+/g,' ').trim().toLowerCase()}
function displayDescription(value){const txt=String(value||'').trim();if(!txt)return'';const seen=new Set(Array.prototype.slice.call(arguments,1).map(textKey).filter(Boolean));return seen.has(textKey(txt))?'':txt}
function collectShapes(file){
  const source = Array.isArray(file.shapes) && file.shapes.length ? file.shapes : null;
  if(source){
    const items=source.map(shape=>({...shape,targets:[...(shape.targets||[])],properties:[...(shape.properties||[])]}))
      .sort((a,b)=>(a.name||a.label||a.id).localeCompare(b.name||b.label||b.id));
    for(const item of items){item.targets.sort((a,b)=>(a.display||'').localeCompare(b.display||''));item.text=((item.label||'')+' '+(item.name||'')+' '+(item.description||'')+' '+(item.subjectValue||'')+' '+item.targets.map(t=>t.display+' '+t.value).join(' ')+' '+(item.properties||[]).map(p=>p.label+' '+p.pathDisplay+' '+p.summary).join(' '));}
    return items;
  }
  const byId=new Map();
  for(const tg of file.targetGroups||[]){
    for(const shape of tg.shapes||[]){
      let item=byId.get(shape.id);
      if(!item){item={...shape,targets:[],properties:[...(shape.properties||[])]};byId.set(shape.id,item)}
      if(!item.targets.some(t=>t.key===tg.targetKey)){item.targets.push({key:tg.targetKey,value:tg.targetLabel,display:tg.targetDisplay})}
    }
  }
  const items=[...byId.values()].sort((a,b)=>(a.name||a.label||a.id).localeCompare(b.name||b.label||b.id));
  for(const item of items){item.targets.sort((a,b)=>(a.display||'').localeCompare(b.display||''));item.text=((item.label||'')+' '+(item.name||'')+' '+(item.description||'')+' '+(item.subjectValue||'')+' '+item.targets.map(t=>t.display+' '+t.value).join(' ')+' '+(item.properties||[]).map(p=>p.label+' '+p.pathDisplay+' '+p.summary).join(' '));}
  return items;
}
function wire(){
  document.querySelectorAll('.cb-file').forEach(cb=>cb.onchange=()=>{const det=cb.closest('details.file');det.querySelectorAll('.cb-shape-target,.cb-prop').forEach(x=>setCheckbox(x,cb.checked));updateParentState();updateSummary()});
  document.querySelectorAll('.cb-shape-target').forEach(cb=>cb.onchange=()=>{if(cb.checked){const det=cb.closest('details.file');const fileCb=det&&det.querySelector('.cb-file');if(fileCb)fileCb.indeterminate=true;}const sh=cb.closest('.shape');if(!cb.checked&&![...sh.querySelectorAll('.cb-shape-target')].some(x=>x.checked)){sh.querySelectorAll('.cb-prop').forEach(x=>setCheckbox(x,false))}else if(cb.checked){sh.querySelectorAll('.cb-prop').forEach(x=>setCheckbox(x,true))}updateParentState();updateSummary()});
  document.querySelectorAll('.cb-prop').forEach(cb=>cb.onchange=()=>{if(cb.checked){const sh=cb.closest('.shape');sh.querySelectorAll('.cb-shape-target').forEach(x=>setCheckbox(x,true))}updateParentState();updateSummary()});
}
radios.forEach(r=>r.onchange=()=>{applyModeEnabled();updateParentState();updateSummary()});
function buildSelection(){
  if(currentMode()==='auto')return{mode:'auto'};
  const files=[];
  document.querySelectorAll('details.file').forEach(det=>{
    const fileUri=det.dataset.file;const shapes=new Map();
    det.querySelectorAll('.cb-shape-target').forEach(cb=>{if(!cb.checked)return;let s=shapes.get(cb.dataset.shape);if(!s){s={shapeId:cb.dataset.shape,enabledTargets:new Set(),enabledPropertyShapeIds:undefined};shapes.set(cb.dataset.shape,s)}s.enabledTargets.add(cb.dataset.target)});
    for(const s of shapes.values()){
      const props=propertyRows(fileUri,s.shapeId);const checked=props.filter(p=>p.checked).map(p=>p.dataset.prop);
      if(props.length>0 && checked.length!==props.length){s.enabledPropertyShapeIds=new Set(checked)}
    }
    const arr=[...shapes.values()].map(s=>{const o={shapeId:s.shapeId,enabledTargets:[...s.enabledTargets]};if(s.enabledPropertyShapeIds!==undefined)o.enabledPropertyShapeIds=[...s.enabledPropertyShapeIds];return o});
    if(arr.length)files.push({fileUri,shapes:arr});
  });
  return{mode:'custom',custom:{files}};
}
function updateSummary(){
  const m=currentMode();document.getElementById('sumMode').textContent='Mode: '+(m==='auto'?'Auto':'Custom');
  if(m==='auto'){document.getElementById('sumFiles').textContent='Files: Auto';document.getElementById('sumTargets').textContent='Targets: Auto';document.getElementById('sumProps').textContent='Properties: Auto';return}
  const targets=[...document.querySelectorAll('.cb-shape-target:checked')];
  document.getElementById('sumFiles').textContent='Files: '+new Set(targets.map(x=>x.dataset.file)).size;
  document.getElementById('sumTargets').textContent='Selected targets: '+targets.length;
  document.getElementById('sumProps').textContent='Selected properties: '+document.querySelectorAll('.cb-prop:checked').length;
}
function filter(){
  const q=document.getElementById('search').value.trim().toLowerCase();document.querySelectorAll('details.file,.shape,.prop').forEach(n=>n.classList.remove('hidden'));
  if(!q)return;
  document.querySelectorAll('.prop').forEach(n=>n.classList.toggle('hidden',!(n.dataset.text||'').includes(q)));
  document.querySelectorAll('.shape').forEach(n=>{const child=[...n.querySelectorAll('.prop')].some(p=>!p.classList.contains('hidden'));n.classList.toggle('hidden',!child&&!(n.dataset.text||'').includes(q))});
  document.querySelectorAll('details.file').forEach(n=>{const child=[...n.querySelectorAll('.shape')].some(s=>!s.classList.contains('hidden'));n.classList.toggle('hidden',!child&&!(n.dataset.text||'').includes(q))});
}
document.getElementById('search').oninput=filter;
document.getElementById('selectVisible').onclick=selectVisible;
document.getElementById('clearCustom').onclick=clearAll;
document.getElementById('apply').onclick=()=>{setStatus('Saving SHACL selection…');vscode.postMessage({command:'apply',selection:buildSelection()})};
document.getElementById('refresh').onclick=()=>{setStatus('Requesting SHACL workspace scan…');vscode.postMessage({command:'refresh'})};
window.addEventListener('message',e=>{gotExtensionResponse=true;const msg=e.data;if(msg.command==='setData'){state.data=msg.data||{files:[]};state.selection=msg.selection||state.data.selection||{mode:'auto'};render();if(msg.reason){setStatus(msg.reason)}}else if(msg.command==='status'){setStatus(msg.text)}else if(msg.command==='applied'){setStatus('Applied');setTimeout(()=>setStatus(''),1000)}else if(msg.command==='error'){setStatus(msg.error||'Error',true)}});
try{vscode=acquireVsCodeApi();setRootMessage('Webview script is running. Sending ready message to RDFusion extension…');}
catch(e){setRootMessage('Could not initialize the RDFusion webview API: '+(e&&e.message?e.message:String(e)),true);return;}
setMode('auto');applyModeEnabled();updateSummary();
vscode.postMessage({command:'ready'});
setTimeout(()=>{if(!gotExtensionResponse){setStatus('RDFusion has not responded yet. If this continues, check the RDFusion output channel.',true)}},5000);
})();
</script></body></html>`;
	}
}