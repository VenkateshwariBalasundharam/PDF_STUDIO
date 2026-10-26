import { Component, ElementRef, OnDestroy, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { mmToPx, paginatePreview } from './preview-paginate';
import { BillTemplateStore } from '../../core/services/bill-template.store';
import { billTemplateProblem } from '../bill-generator/bill-template';

type Tab = 'html' | 'data';

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Helvetica, Arial, sans-serif; margin: 40px; color: #1e293b; }
    h1 { color: #2563eb; border-bottom: 2px solid #dbeafe; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
    th { background: #f1f5f9; }
    .total { text-align: right; margin-top: 24px; font-size: 1.2rem; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Invoice {{invoiceNo}}</h1>
  <p>Billed to <strong>{{customerName}}</strong> on {{invoiceDate}}</p>
  <table>
    <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
    {{#items}}
    <tr><td>{{description}}</td><td>{{quantity}}</td><td>{{price}}</td></tr>
    {{/items}}
  </table>
  <p class="total">Total: {{amount}}</p>
</body>
</html>`;

const DEFAULT_DATA = JSON.stringify({
  invoiceNo: 'INV-2026-909',
  customerName: 'Acme Global Corp',
  invoiceDate: '2026-10-10',
  items: [
    { description: 'PDF Generation API - Enterprise Plan', quantity: 1, price: '$499.00' },
    { description: 'Dedicated Worker Pool Node', quantity: 2, price: '$250.00' }
  ],
  amount: '$999.00'
}, null, 2);

const PAGE_PX: Record<string, [number, number]> = {
  A4: [794, 1123],
  Letter: [816, 1056],
  Legal: [816, 1344]
};

const SNIPPETS: { label: string; code: string }[] = [
  { label: 'Heading', code: '<h1>Title</h1>\n' },
  { label: 'Paragraph', code: '<p>Write your text here.</p>\n' },
  { label: 'Table', code: '<table>\n  <tr><th>Column A</th><th>Column B</th></tr>\n  <tr><td>Value</td><td>Value</td></tr>\n</table>\n' },
  { label: 'Variable', code: '{{name}}' },
  { label: 'Loop', code: '{{#items}}\n  <p>{{name}}</p>\n{{/items}}\n' },
  { label: 'Page break', code: '<div style="page-break-after: always;"></div>\n' }
];

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="overlay" *ngIf="saveOpen" (mousedown)="saveOpen = false">
      <div class="dialog" (mousedown)="$event.stopPropagation()">
        <h3>Save to Templates</h3>
        <p class="dnote">Saves this HTML on the Templates page, and in PDF Generator → Bills &amp; Invoices.</p>
        <input id="tplNameInput" type="text" maxlength="80" autocomplete="off" placeholder="Template name"
               [(ngModel)]="saveName" (keydown.enter)="confirmSave()">
        <span class="dnote" *ngIf="saveName.trim() && saveExists()">A template named "{{ saveName.trim() }}" already exists. Saving will replace it.</span>
        <span class="derr" *ngIf="saveError">{{ saveError }}</span>
        <div class="dbtns">
          <button type="button" class="btn-secondary" (click)="saveOpen = false">Cancel</button>
          <button type="button" class="btn-primary" (click)="confirmSave()" [disabled]="!saveName.trim()">{{ saveName.trim() && saveExists() ? 'Replace' : 'Save' }}</button>
        </div>
      </div>
    </div>
    <div class="editor-page">
      <header class="header">
        <div>
          <h2>HTML Code Editor</h2>
          <p class="subtitle">Write HTML, CSS and {{ '{{' }}template{{ '}}' }} tags and see the page update as you type.</p>
        </div>
        <div class="header-actions">
          <a routerLink="/editor" class="btn-secondary back">← Visual editor</a>
          <button type="button" class="btn-secondary" (click)="reset()">Reset</button>
          <button type="button" class="btn-secondary" (click)="saveFile()" title="Download the HTML as a .html file">Save file</button>
          <button type="button" class="btn-secondary" (click)="openSave()" title="Ctrl+S">{{ tplId ? 'Save template' : 'Save to Templates' }}</button>
          <button type="button" class="btn-primary gen" (click)="generate()" [disabled]="isGenerating">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/></svg>
            {{ isGenerating ? 'Generating...' : 'Download PDF' }}
          </button>
        </div>
      </header>

      <div class="status" *ngIf="statusMessage" [class.error]="isError">{{ statusMessage }}</div>

      <div class="workspace">
        <!-- Code pane -->
        <section class="card pane code-pane">
          <div class="pane-bar">
            <div class="tabs">
              <button type="button" [class.active]="tab === 'html'" (click)="tab = 'html'">HTML / CSS</button>
              <button type="button" [class.active]="tab === 'data'" (click)="tab = 'data'">
                Data (JSON)
                <span class="pill bad" *ngIf="dataError">!</span>
              </button>
            </div>
            <div class="snippets" *ngIf="tab === 'html'">
              <button type="button" *ngFor="let s of snippets" (click)="insert(s.code)">{{ s.label }}</button>
            </div>
          </div>

          <div class="code-wrap">
            <div class="gutter" #gutter aria-hidden="true">
              <div *ngFor="let n of lineNumbers">{{ n }}</div>
            </div>
            <textarea #codeArea class="code" spellcheck="false" wrap="off"
                      [ngModel]="tab === 'html' ? html : dataJson"
                      (ngModelChange)="onCode($event)"
                      (scroll)="syncScroll()"
                      (keydown)="onKey($event)"
                      (keyup)="updateCaret()" (click)="updateCaret()"></textarea>
          </div>

          <div class="code-foot">
            <span>Ln {{ caretLine }}, Col {{ caretCol }}</span>
            <span *ngIf="dataError" class="err">JSON error: {{ dataError }}</span>
            <span>{{ charCount | number }} chars</span>
          </div>
        </section>

        <!-- Preview pane -->
        <section class="card pane preview-pane">
          <div class="pane-bar">
            <span class="pane-title">Live preview</span>
            <div class="controls">
              <select [(ngModel)]="pageSize" (ngModelChange)="persist(); renderPreview(); fitSoon()" aria-label="Page size">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
              <select [(ngModel)]="orientation" (ngModelChange)="persist(); renderPreview(); fitSoon()" aria-label="Orientation">
                <option value="Portrait">Portrait</option>
                <option value="Landscape">Landscape</option>
              </select>
              <div class="zoom">
                <button type="button" (click)="zoomBy(-0.1)" aria-label="Zoom out">−</button>
                <span>{{ zoom * 100 | number:'1.0-0' }}%</span>
                <button type="button" (click)="zoomBy(0.1)" aria-label="Zoom in">+</button>
              </div>
              <button type="button" class="fit" (click)="fit()" aria-label="Fit page to preview">Fit</button>
            </div>
          </div>
          <div class="canvas" #canvas>
            <div class="paper" [style.width.px]="paperW * zoom" [style.height.px]="previewH * zoom">
              <iframe #preview sandbox="allow-same-origin" title="Live preview" scrolling="no"
                      (load)="onFrameLoad()"
                      [style.width.px]="paperW" [style.height.px]="previewH"
                      [style.transform]="'scale(' + zoom + ')'"></iframe>
            </div>
          </div>
          <div class="code-foot">
            <span>Preview approximates the PDF ({{ pageCount }} {{ pageCount === 1 ? 'page' : 'pages' }}). Final output comes from the Chromium engine.</span>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .editor-page { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .header h2 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
    .subtitle { color: var(--text-muted); font-size: 0.875rem; margin-top: 0.15rem; }
    .header-actions { display: flex; gap: 0.6rem; align-items: center; }
    .gen { display: inline-flex; align-items: center; gap: 0.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
    .gen:disabled { opacity: 0.6; cursor: wait; }
    .btn-secondary { border-radius: 8px; }
    .back { display: inline-flex; align-items: center; text-decoration: none; padding: 0.5rem 1rem; }
    .back:hover { text-decoration: none; }

    .status { padding: 0.55rem 0.8rem; border-radius: 8px; font-size: 0.85rem;
      background: rgba(16, 185, 129, 0.15); color: var(--success-text); }
    .overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; }
    .dialog { background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 12px;
      padding: 1.25rem; width: min(420px, 92vw); display: flex; flex-direction: column; gap: 0.6rem; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
    .dialog h3 { margin: 0; font-size: 1.05rem; }
    .dialog input { padding: 0.55rem 0.7rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); color: inherit; }
    .dnote { font-size: 0.78rem; color: var(--text-muted); }
    .derr { font-size: 0.8rem; color: var(--danger-text); }
    .dbtns { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.4rem; }
    .status.error { background: rgba(239, 68, 68, 0.15); color: var(--danger-text); }

    .workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1rem; align-items: stretch; }
    .pane { padding: 0; display: flex; flex-direction: column; overflow: hidden; height: calc(100vh - 230px); min-height: 460px; }
    .pane-bar { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;
      padding: 0.6rem 0.8rem; border-bottom: 1px solid var(--border-color); background: var(--bg-th); }
    .pane-title { font-size: 0.8rem; font-weight: 600; }

    .tabs { display: flex; gap: 0.35rem; }
    .tabs button { background: transparent; border: none; color: var(--text-muted); padding: 0.35rem 0.75rem; border-radius: 6px;
      display: inline-flex; align-items: center; gap: 0.4rem; }
    .tabs button:hover { background: var(--bg-hover); }
    .tabs button.active { background: var(--primary); color: #fff; }
    .pill.bad { background: var(--danger); color: #fff; border-radius: 99px; font-size: 0.65rem; padding: 0 0.35rem; }

    .snippets { display: flex; gap: 0.3rem; flex-wrap: wrap; }
    .snippets button { background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main);
      padding: 0.2rem 0.55rem; font-size: 0.75rem; border-radius: 6px; }
    .snippets button:hover { border-color: var(--primary); color: var(--primary); }

    .code-wrap { position: relative; flex: 1; display: flex; min-height: 0; background: var(--bg-input); }
    .gutter { width: 44px; flex-shrink: 0; overflow: hidden; padding: 0.75rem 0.5rem; text-align: right;
      font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.55; color: var(--text-muted);
      background: var(--bg-th); border-right: 1px solid var(--border-color); user-select: none; }
    .code { flex: 1; min-width: 0; height: 100%; border: none; border-radius: 0; resize: none; box-shadow: none !important;
      font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.55; padding: 0.75rem; tab-size: 2;
      white-space: pre; overflow: auto; background: var(--bg-input); }
    .code-foot { display: flex; justify-content: space-between; gap: 1rem; padding: 0.4rem 0.8rem; font-size: 0.72rem;
      color: var(--text-muted); border-top: 1px solid var(--border-color); background: var(--bg-th); }
    .err { color: var(--danger-text); }

    .controls { display: flex; align-items: center; gap: 0.5rem; }
    .controls select { width: auto; padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .zoom { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: var(--text-muted); }
    .zoom button { width: 24px; height: 24px; padding: 0; background: var(--bg-card); border: 1px solid var(--border-color);
      color: var(--text-main); border-radius: 6px; line-height: 1; }
    .zoom button:hover { border-color: var(--primary); }
    .controls .fit { height: 28px; padding: 0 0.6rem; background: var(--bg-card); border: 1px solid var(--border-color);
      color: var(--text-main); border-radius: 6px; font-size: 0.75rem; }
    .controls .fit:hover { border-color: var(--primary); color: var(--primary); }

    .canvas { flex: 1; overflow: auto; padding: 1.25rem; background: var(--bg-primary); min-height: 0; }
    .paper { margin: 0 auto; position: relative; }
    .paper iframe { border: none; background: transparent; transform-origin: top left; display: block;
      filter: drop-shadow(0 1px 3px rgba(15, 23, 42, 0.18)) drop-shadow(0 8px 14px rgba(15, 23, 42, 0.10)); }

    @media (max-width: 1100px) {
      .workspace { grid-template-columns: 1fr; }
      .pane { height: 70vh; }
    }
  `]
})
export class EditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('codeArea') codeArea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('gutter') gutter!: ElementRef<HTMLDivElement>;
  @ViewChild('preview') preview!: ElementRef<HTMLIFrameElement>;
  @ViewChild('canvas') canvas!: ElementRef<HTMLDivElement>;

  private readonly STORE = 'pdfstudio-editor-v1';
  snippets = SNIPPETS;

  tab: Tab = 'html';
  html = DEFAULT_HTML;
  dataJson = DEFAULT_DATA;
  dataError = '';
  pageSize = 'A4';
  orientation = 'Portrait';
  zoom = 0.7;
  previewH = 1123;       // height of ALL sheets in the preview (set after the page is laid out)
  pageCount = 1;

  // "Save to Templates"
  saveOpen = false;
  saveName = '';
  saveError = '';
  tplId = '';       // set once this code has been saved, so Save again updates the same template
  tplName = '';

  caretLine = 1;
  caretCol = 1;
  isGenerating = false;
  statusMessage = '';
  isError = false;

  private timer: any;

  ngOnInit(): void {
    try {
      const raw = localStorage.getItem(this.STORE);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.html === 'string') this.html = s.html;
        if (typeof s.dataJson === 'string') this.dataJson = s.dataJson;
        if (s.pageSize) this.pageSize = s.pageSize;
        if (s.orientation) this.orientation = s.orientation;
        if (typeof s.tplId === 'string' && this.store.get(s.tplId)) { this.tplId = s.tplId; this.tplName = s.tplName ?? ''; }
      }
    } catch { /* storage unavailable or corrupt: use defaults */ }
    this.validateData();
  }

  ngAfterViewInit(): void {
    this.renderPreview();
    this.fitSoon();
  }

  ngOnDestroy(): void { clearTimeout(this.timer); }

  get current(): string { return this.tab === 'html' ? this.html : this.dataJson; }
  get lineNumbers(): number[] { return Array.from({ length: this.current.split('\n').length }, (_, i) => i + 1); }
  get charCount(): number { return this.current.length; }
  get paperW(): number { const [w, h] = PAGE_PX[this.pageSize] ?? PAGE_PX['A4']; return this.orientation === 'Landscape' ? h : w; }
  get paperH(): number { const [w, h] = PAGE_PX[this.pageSize] ?? PAGE_PX['A4']; return this.orientation === 'Landscape' ? w : h; }

  onCode(value: string): void {
    if (this.tab === 'html') this.html = value; else { this.dataJson = value; this.validateData(); }
    this.queueRender();
  }

  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.openSave(); return; }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    this.replaceSelection('  ');
  }

  insert(code: string): void { this.replaceSelection(code); }

  private replaceSelection(text: string): void {
    const el = this.codeArea.nativeElement;
    const start = el.selectionStart, end = el.selectionEnd;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    if (this.tab === 'html') this.html = next; else this.dataJson = next;
    el.value = next;
    el.focus();
    el.setSelectionRange(start + text.length, start + text.length);
    this.updateCaret();
    this.queueRender();
  }

  updateCaret(): void {
    const el = this.codeArea?.nativeElement; if (!el) return;
    const before = el.value.slice(0, el.selectionStart).split('\n');
    this.caretLine = before.length;
    this.caretCol = before[before.length - 1].length + 1;
  }

  syncScroll(): void {
    this.gutter.nativeElement.scrollTop = this.codeArea.nativeElement.scrollTop;
  }

  /** Scales the page so its full width fits the preview pane (like the 55% in the design). */
  fit(): void {
    const el = this.canvas?.nativeElement; if (!el) return;
    const cs = getComputedStyle(el);
    const avail = el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
    if (avail <= 0) return;
    this.zoom = Math.min(1.5, Math.max(0.3, Math.floor((avail / this.paperW) * 100) / 100));
  }

  /** Fit after Angular has applied the new page size / layout. */
  fitSoon(): void { setTimeout(() => this.fit(), 0); }

  zoomBy(d: number): void { this.zoom = Math.min(1.5, Math.max(0.3, Math.round((this.zoom + d) * 10) / 10)); }

  persist(): void {
    try {
      localStorage.setItem(this.STORE, JSON.stringify({
        html: this.html, dataJson: this.dataJson, pageSize: this.pageSize, orientation: this.orientation,
        tplId: this.tplId, tplName: this.tplName
      }));
    } catch { /* ignore */ }
  }

  reset(): void {
    this.html = DEFAULT_HTML;
    this.dataJson = DEFAULT_DATA;
    this.pageSize = 'A4';
    this.orientation = 'Portrait';
    this.tplId = ''; this.tplName = '';
    this.statusMessage = '';
    this.validateData();
    this.persist();
    this.renderPreview();
  }

  private queueRender(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.persist(); this.renderPreview(); }, 250);
  }

  private validateData(): void {
    if (!this.dataJson.trim()) { this.dataError = ''; return; }
    try { JSON.parse(this.dataJson); this.dataError = ''; }
    catch (e: any) { this.dataError = e?.message ?? 'Invalid JSON'; }
  }

  private parsedData(): any {
    if (!this.dataJson.trim() || this.dataError) return {};
    try { return JSON.parse(this.dataJson); } catch { return {}; }
  }

  /** 10 mm like the PDF engine; designs made in the Visual editor (.pg pages) are full-bleed, as in their PDF. */
  get marginMm(): number { return /class\s*=\s*["'][^"']*\bpg\b/.test(this.html) ? 0 : 10; }

  renderPreview(): void {
    const frame = this.preview?.nativeElement; if (!frame) return;
    frame.srcdoc = this.mustache(this.html, this.parsedData());
  }

  /** The preview document has loaded: lay it out as real pages (margins, page breaks, one sheet per page). */
  onFrameLoad(): void {
    const frame = this.preview?.nativeElement;
    const doc = frame?.contentDocument;
    if (!frame || !doc || !doc.body || doc.location?.href !== 'about:srcdoc') return;
    const mg = mmToPx(this.marginMm);
    const r = paginatePreview(doc, { pageW: this.paperW, pageH: this.paperH, margin: { t: mg, r: mg, b: mg, l: mg }, gap: 24 });
    this.previewH = r.height;
    this.pageCount = r.pages;
  }

  /** Small Mustache subset for the preview only: variables, {{{raw}}}, sections and inverted sections. */
  private mustache(tpl: string, ctx: any): string {
    const lookup = (stack: any[], path: string): any => {
      if (path === '.') return stack[stack.length - 1];
      const parts = path.split('.');
      for (let i = stack.length - 1; i >= 0; i--) {
        let v = stack[i], ok = true;
        for (const p of parts) {
          if (v !== null && typeof v === 'object' && p in v) v = v[p]; else { ok = false; break; }
        }
        if (ok) return v;
      }
      return undefined;
    };
    const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
    const render = (t: string, stack: any[]): string =>
      t.replace(/\{\{([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\2\s*\}\}/g, (_m, type, key, inner) => {
        const v = lookup(stack, key);
        const empty = !v || (Array.isArray(v) && v.length === 0);
        if (type === '^') return empty ? render(inner, stack) : '';
        if (Array.isArray(v)) return v.map(item => render(inner, [...stack, item])).join('');
        if (v) return render(inner, typeof v === 'object' ? [...stack, v] : stack);
        return '';
      })
      .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{&\s*([\w.]+)\s*\}\}/g, (_m, a, b) => String(lookup(stack, a || b) ?? ''))
      .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => esc(lookup(stack, k)));
    return render(tpl, [ctx]);
  }

  generate(): void {
    if (this.dataError) {
      this.isError = true;
      this.statusMessage = 'Fix the JSON in the Data tab first: ' + this.dataError;
      this.tab = 'data';
      return;
    }
    this.isGenerating = true;
    this.isError = false;
    this.statusMessage = '';
    const data = this.dataJson.trim() ? this.parsedData() : undefined;

    this.api.generatePdf({
      htmlContent: this.html,
      templateData: data,
      pageSize: this.pageSize,
      orientation: this.orientation,
      marginTopMm: this.marginMm, marginBottomMm: this.marginMm, marginLeftMm: this.marginMm, marginRightMm: this.marginMm,
      printBackground: true,
      async: false
    }).subscribe({
      next: (result: any) => {
        this.isGenerating = false;
        if (result instanceof Blob) {
          const url = URL.createObjectURL(result);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'document.pdf';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          this.statusMessage = 'PDF generated and downloaded.';
        }
      },
      error: async (err: any) => {
        this.isGenerating = false;
        this.isError = true;
        let detail: string = err?.error?.message || err?.message || 'API connection error';
        try {
          if (err?.error instanceof Blob) {
            const body = JSON.parse(await err.error.text());
            if (body?.message) detail = body.message;
          }
        } catch { /* keep generic message */ }
        this.statusMessage = 'Generation failed: ' + detail;
      }
    });
  }

  constructor(private api: ApiService, private store: BillTemplateStore) {}

  /** The user's own HTML template with this name (case-insensitive), if any. */
  private existing() {
    const n = this.saveName.trim().toLowerCase();
    return this.store.mine().find(t => t.kind !== 'design' && t.name.toLowerCase() === n);
  }
  saveExists(): boolean { return !!this.existing(); }

  openSave(): void {
    this.saveError = '';
    this.saveName = this.tplName || 'My Template';
    this.saveOpen = true;
    setTimeout(() => { const el = document.getElementById('tplNameInput') as HTMLInputElement | null; el?.focus(); el?.select(); }, 0);
  }

  confirmSave(): void {
    const name = this.saveName.trim();
    if (!name) return;
    const problem = billTemplateProblem(this.html);
    if (problem) { this.saveError = problem; return; }
    const ex = this.existing();
    const id = ex?.id ?? (this.tplId && this.tplName.toLowerCase() === name.toLowerCase() ? this.tplId : this.store.newId());
    const saved = this.store.save({
      id, name, description: ex?.description || 'Written in the HTML code editor',
      htmlContent: this.html, kind: 'html', defaultPageSize: this.pageSize, defaultOrientation: this.orientation
    });
    if (!saved) { this.saveError = 'Could not save: this browser has no room left. Delete a template and try again.'; return; }
    this.tplId = saved.id; this.tplName = name;
    this.persist();
    this.saveOpen = false; this.saveError = '';
    this.isError = false;
    this.statusMessage = ex ? `Template "${name}" updated on the Templates page.` : `Saved to the Templates page as "${name}".`;
    setTimeout(() => { if (this.statusMessage.startsWith('Saved') || this.statusMessage.startsWith('Template')) this.statusMessage = ''; }, 5000);
  }

  /** Downloads the HTML as a file on the computer. */
  saveFile(): void {
    const blob = new Blob([this.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = ((this.tplName || 'template').replace(/[^\w\- ]+/g, '') || 'template') + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
