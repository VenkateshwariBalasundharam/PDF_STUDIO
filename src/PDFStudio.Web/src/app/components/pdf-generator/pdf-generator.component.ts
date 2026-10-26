import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { GeneratePdfRequest, TemplateDto } from '../../core/models/api.models';
import { BillGeneratorComponent } from '../bill-generator/bill-generator.component';
import { BillTemplateStore } from '../../core/services/bill-template.store';
import { prepareBillHtml, keepAddressBreaks } from '../bill-generator/bill-template';
import { TEMPLATES, TplDef } from '../design-editor/design-templates';
import { designCss, designPagesHtml, formatDesignField } from '../design-editor/design-render';
import { Doc, Field, PAGE_PX, uid } from '../design-editor/design-model';

@Component({
  selector: 'app-pdf-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, BillGeneratorComponent],
  template: `
    <div class="generator-container">
      <h2>Interactive PDF Generator</h2>
      <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">
        Generate pixel-perfect PDFs using Chromium engine with custom HTML, CSS, headers, and footers.
      </p>

      <div class="view-tabs">
        <button type="button" [class.active]="view === 'pdf'" (click)="view = 'pdf'">HTML / Template to PDF</button>
        <button type="button" [class.active]="view === 'bills'" (click)="view = 'bills'">Bills &amp; Invoices</button>
      </div>

      <div class="split-view" *ngIf="view === 'pdf'">
        <!-- Configuration and Code Pane -->
        <div class="card form-pane">
          <div class="form-group">
            <label>Start from a template</label>
            <select [ngModel]="pickedTemplateId" (ngModelChange)="pickTemplate($event)">
              <option value="">— choose a template —</option>
              <optgroup label="Server templates" *ngIf="serverTemplates.length">
                <option *ngFor="let t of serverTemplates" [value]="'srv:' + t.id">{{ t.name }} (v{{ t.currentVersion }})</option>
              </optgroup>
              <optgroup label="Built-in invoice formats">
                <option *ngFor="let t of builtInFormats" [value]="'bill:' + t.id">{{ t.name }}</option>
              </optgroup>
              <optgroup label="My saved templates" *ngIf="myTemplates.length">
                <option *ngFor="let t of myTemplates" [value]="'bill:' + t.id">{{ t.name }}{{ t.kind === 'design' ? ' (design)' : '' }}</option>
              </optgroup>
              <optgroup label="Editor design templates">
                <option *ngFor="let t of designTemplates" [value]="'gal:' + t.id">{{ t.name }}</option>
              </optgroup>
            </select>
            <div class="hint" *ngIf="pickHint" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">{{ pickHint }}</div>
          </div>

          <div class="form-group">
            <label>Rendering Mode</label>
            <select [(ngModel)]="mode">
              <option value="html">Raw HTML / CSS</option>
              <option value="template">Mustache Template</option>
            </select>
          </div>

          <div class="form-group" *ngIf="mode === 'html'">
            <label>HTML Content</label>
            <textarea [(ngModel)]="request.htmlContent" rows="12" class="mono"></textarea>
            <label style="margin-top: 0.75rem;">Data (JSON) - optional, fills {{ '{{' }}tags{{ '}}' }} in the HTML</label>
            <textarea [(ngModel)]="htmlDataJson" rows="5" class="mono" placeholder='Leave empty for plain HTML'></textarea>
          </div>

          <div class="form-group" *ngIf="mode === 'template'">
            <label style="margin-top: 0.75rem;">Template ID</label>
            <input type="text" [(ngModel)]="request.templateId" placeholder="e.g. invoice-standard">
            <label style="margin-top: 0.75rem;">Template Data (JSON)</label>
            <textarea [(ngModel)]="templateDataJson" rows="8" class="mono"></textarea>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label>Page Size</label>
              <select [(ngModel)]="request.pageSize">
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
            <div class="form-group">
              <label>Orientation</label>
              <select [(ngModel)]="request.orientation">
                <option value="Portrait">Portrait</option>
                <option value="Landscape">Landscape</option>
              </select>
            </div>
          </div>

          <div class="checkbox-row">
            <label>
              <input type="checkbox" [(ngModel)]="request.printBackground"> Print Backgrounds &amp; Colors
            </label>
            <label>
              <input type="checkbox" [(ngModel)]="request.async"> Async Background Processing
            </label>
          </div>

          <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
            <button class="btn-primary" (click)="generate()" [disabled]="isGenerating">
              {{ isGenerating ? 'Generating...' : '⚡ Generate PDF' }}
            </button>
            <button class="btn-secondary" (click)="resetForm()">Reset</button>
          </div>

          <div *ngIf="statusMessage" class="status-msg" [ngClass]="{'error': isError}">
            {{ statusMessage }}
          </div>
        </div>

        <!-- Live Preview Pane -->
        <div class="card preview-pane">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3>Document Preview</h3>
            <a *ngIf="previewUrl" [href]="previewUrl" download="output.pdf" class="btn-secondary" style="font-size: 0.75rem;">
              ⬇ Download
            </a>
          </div>
          <div *ngIf="!previewUrl" class="preview-placeholder">
            <span>Click 'Generate PDF' to render live preview</span>
          </div>
          <iframe *ngIf="previewUrl" [src]="previewUrl" class="preview-iframe"></iframe>
        </div>
      </div>

      <app-bill-generator *ngIf="view === 'bills'"></app-bill-generator>
    </div>
  `,
  styles: [`
    .view-tabs { display: flex; gap: .5rem; margin-bottom: 1rem; }
    .view-tabs button { padding: .5rem 1rem; border: 1px solid var(--border-color); background: transparent; color: inherit; border-radius: 6px; cursor: pointer; }
    .view-tabs button.active { background: var(--primary, #4f46e5); color: #fff; border-color: transparent; }
    .split-view {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.5rem;
    }
    @media (max-width: 1100px) {
      .split-view { grid-template-columns: minmax(0, 1fr); }
    }
    .form-group {
      margin-bottom: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .form-group label {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-muted);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }
    .checkbox-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      font-size: 0.875rem;
      margin-top: 0.5rem;
    }
    .checkbox-row label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }
    .preview-pane {
      display: flex;
      flex-direction: column;
      min-height: 550px;
    }
    .preview-placeholder {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px dashed var(--border-color);
      border-radius: 6px;
      color: var(--text-muted);
    }
    .preview-iframe {
      width: 100%;
      flex: 1;
      height: calc(100vh - 230px);
      min-height: 480px;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: white;
    }
    .status-msg {
      margin-top: 1rem;
      padding: 0.5rem;
      border-radius: 4px;
      font-size: 0.85rem;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success-text);
    }
    .status-msg.error {
      background: rgba(239, 68, 68, 0.15);
      color: var(--danger-text);
    }
  `]
})
export class PdfGeneratorComponent implements OnInit {
  view: 'pdf' | 'bills' = 'pdf';
  mode: 'html' | 'template' = 'html';
  htmlDataJson = '';
  isGenerating = false;
  statusMessage = '';
  isError = false;
  previewUrl: SafeResourceUrl | null = null;
  templateDataJson = JSON.stringify(
    {
      companyName: 'PDFStudio Pvt Ltd',
      invoiceNo: 'INV-2026-909',
      customerName: 'Acme Global Corp',
      invoiceDate: '2026-10-10',
      items: [
        { description: 'PDF Generation API - Enterprise Plan', quantity: 1, price: '499.00' },
        { description: 'Dedicated Worker Pool Node', quantity: 2, price: '250.00' }
      ],
      amount: '999.00'
    },
    null,
    2
  );

  request: GeneratePdfRequest = {
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Helvetica, Arial, sans-serif; margin: 40px; color: #333; }
    h1 { color: #4338ca; border-bottom: 2px solid #e0e7ff; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #f8fafc; font-weight: bold; }
  </style>
</head>
<body>
  <h1>PDFStudio Enterprise Invoice</h1>
  <p>Rendered with high-fidelity Chromium headless engine.</p>
  <table>
    <tr><th>Item</th><th>Quantity</th><th>Unit Price</th><th>Total</th></tr>
    <tr><td>PDF Generation API - Enterprise Plan</td><td>1</td><td>$499.00</td><td>$499.00</td></tr>
    <tr><td>Dedicated Worker Pool Node</td><td>2</td><td>$250.00</td><td>$500.00</td></tr>
  </table>
  <h3 style="text-align: right; margin-top: 30px;">Total: $999.00</h3>
</body>
</html>`,
    pageSize: 'A4',
    orientation: 'Portrait',
    printBackground: true,
    async: false
  };

  constructor(
    private api: ApiService,
    private sanitizer: DomSanitizer,
    private store: BillTemplateStore
  ) {}

  pickHint = '';
  builtInFormats: { id: string; name: string }[] = [];
  myTemplates: { id: string; name: string; kind?: string }[] = [];
  designTemplates: TplDef[] = TEMPLATES;

  serverTemplates: TemplateDto[] = [];
  pickedTemplateId = '';

  ngOnInit(): void {
    this.refreshLocalTemplates();
    this.api.getRenderableTemplates().subscribe({
      next: t => { this.serverTemplates = Array.isArray(t) ? t : []; },
      error: () => { this.serverTemplates = []; }
    });
  }

  /** Builds starter JSON from the tags a Mustache template uses; {{#list}}...{{/list}} sections become one-row arrays. */
  static sampleData(html: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    let rest = html;
    for (const m of html.matchAll(/\{\{#\s*([A-Za-z_][\w.]*)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g)) {
      const row: Record<string, string> = {};
      for (const f of m[2].matchAll(/\{\{\{?\s*([A-Za-z_]\w*)\s*\}?\}\}/g)) row[f[1]] = `Sample ${f[1]}`;
      data[m[1]] = [row];
      rest = rest.replace(m[0], '');
    }
    for (const m of rest.matchAll(/\{\{\{?\s*([A-Za-z_][\w.]*)\s*\}?\}\}/g)) data[m[1]] = `Sample ${m[1]}`;
    return data;
  }

  private refreshLocalTemplates(): void {
    const all = this.store.list();
    this.builtInFormats = all.filter(t => t.builtIn);
    this.myTemplates = all.filter(t => !t.builtIn);
  }

  private static readonly SAMPLE_INVOICE = {
    invoiceNo: 'INV-2026-001', invoiceDate: '2026-10-23', customerName: 'Acme Global Corp',
    customerAddress: '12 Main Road, Salem', hasSecure: true, secureValue: 'XXXXXX1234', invoiceClass: '',
    items: [
      { sno: 1, description: 'PDF Generation API - Enterprise Plan', quantity: '1', price: '499.00', lineTotal: '499.00' },
      { sno: 2, description: 'Dedicated Worker Pool Node', quantity: '2', price: '250.00', lineTotal: '500.00' }
    ],
    subtotal: '999.00', tax: '179.82', total: '1,178.82', nSubtotal: 999, nTax: 179.82, nTotal: 1178.82,
    hasInvoiceChart: false
  };

  /** Starter data for an invoice-format template (the same shape the Bills & Invoices tab sends). */
  private static billSampleData(): Record<string, unknown> {
    return {
      company: 'M & Co.', companyAddress: '12 Main Road, Salem', taxLabel: 'Tax (18%)', secureLabel: 'Tax ID',
      sheets: [{ sheetClass: '', invoices: [PdfGeneratorComponent.SAMPLE_INVOICE] }],
      layoutClass: '', slot: '', showSummary: false
    };
  }

  /** An Editor design as plain HTML with its sample values filled in. */
  private designToHtml(doc: Doc): string {
    return designCss(doc) + designPagesHtml(doc, doc.fields ?? []);
  }

  private galleryDoc(t: TplDef): Doc {
    const [w, h] = PAGE_PX['A4'];
    const landscape = t.orientation === 'Landscape';
    const r = t.build({ W: landscape ? h : w, H: landscape ? w : h, color: '#2563eb', logo: false, title: t.name });
    const fields: Field[] = r.fields.map(f => ({
      id: uid(), key: f.key!, label: f.label ?? f.key!, type: f.type ?? 'text', value: f.value ?? '', decimals: f.decimals,
      currency: f.currency, dateFormat: f.dateFormat, trueLabel: f.trueLabel, falseLabel: f.falseLabel
    }));
    return { title: t.name, size: 'A4', orientation: t.orientation, fields, locale: 'en-US',
      pages: [{ id: uid(), bg: r.bg ?? '#ffffff', els: r.els }] };
  }

  private useHtml(html: string, data: Record<string, unknown> | null, size: string, orientation: string, zeroMargins: boolean): void {
    this.mode = 'html';
    this.request.templateId = undefined;
    this.request.htmlContent = html;
    this.htmlDataJson = data ? JSON.stringify(data, null, 2) : '';
    this.request.pageSize = size;
    this.request.orientation = orientation;
    const m = zeroMargins ? 0 : undefined;
    this.request.marginTopMm = m; this.request.marginBottomMm = m; this.request.marginLeftMm = m; this.request.marginRightMm = m;
  }

  /** Fills the form from the chosen template: server templates set the Template ID; the others load their HTML and sample data. */
  pickTemplate(value: string): void {
    this.pickedTemplateId = value;
    this.pickHint = '';
    if (!value) return;
    const [kind, ...rest] = value.split(':');
    const id = rest.join(':');

    if (kind === 'srv') {
      const t = this.serverTemplates.find(x => x.id === id);
      if (!t) return;
      this.mode = 'template';
      this.request.templateId = t.id;
      this.request.marginTopMm = this.request.marginBottomMm = this.request.marginLeftMm = this.request.marginRightMm = undefined;
      // The list endpoint doesn't return HTML, so only regenerate sample data when we actually have it;
      // otherwise keep the existing JSON (its default matches the seeded invoice-standard template).
      if (t.htmlContent) this.templateDataJson = JSON.stringify(PdfGeneratorComponent.sampleData(t.htmlContent), null, 2);
      return;
    }

    if (kind === 'bill') {
      const t = this.store.get(id);
      if (!t) return;
      if (t.kind === 'design' && t.design) {
        this.useHtml(this.designToHtml(t.design), null, t.design.size, t.design.orientation, true);
        this.pickHint = 'Design loaded as HTML with its sample values filled in. Edit the HTML to change them.';
      } else {
        this.useHtml(keepAddressBreaks(prepareBillHtml(t.htmlContent)), PdfGeneratorComponent.billSampleData(),
          t.defaultPageSize || 'A4', t.defaultOrientation || 'Portrait', false);
        this.pickHint = 'Loaded as HTML with sample invoice data. Change the Data (JSON) to fill in your own values.';
      }
      return;
    }

    if (kind === 'gal') {
      const t = TEMPLATES.find(x => x.id === id);
      if (!t) return;
      const doc = this.galleryDoc(t);
      this.useHtml(this.designToHtml(doc), null, doc.size, doc.orientation, true);
      this.pickHint = 'Design loaded as HTML with its sample values filled in. Open the Editor to change fields visually.';
    }
  }

  generate(): void {
    this.isGenerating = true;
    this.statusMessage = '';
    this.isError = false;

    if (this.mode === 'html') {
      this.request.templateId = undefined;
      this.request.templateData = undefined;
      if (this.htmlDataJson.trim()) {
        try {
          this.request.templateData = JSON.parse(this.htmlDataJson);
        } catch {
          this.statusMessage = 'Invalid JSON in Data';
          this.isError = true;
          this.isGenerating = false;
          return;
        }
      }
    } else {
      if (!this.request.templateId || !this.request.templateId.trim()) {
        this.statusMessage = 'Enter a Template ID, for example: invoice-standard';
        this.isError = true;
        this.isGenerating = false;
        return;
      }
      try {
        this.request.templateData = JSON.parse(this.templateDataJson);
      } catch {
        this.statusMessage = 'Invalid JSON in Template Data';
        this.isError = true;
        this.isGenerating = false;
        return;
      }
    }

    this.api.generatePdf(this.request).subscribe({
      next: (result: any) => {
        this.isGenerating = false;
        if (result instanceof Blob) {
          const blobUrl = URL.createObjectURL(result);
          this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
          this.statusMessage = 'PDF generated successfully!';
        } else if (result?.jobId) {
          this.statusMessage = `Job queued (${result.jobId}). The Worker must be running; open Jobs Monitor to follow it, then find the PDF in Documents.`;
        }
      },
      error: async (err: any) => {
        this.isGenerating = false;
        this.isError = true;
        let detail: string = err?.error?.message || err?.message || 'API connection error';
        try {
          if (err?.error instanceof Blob) {
            const body = JSON.parse(await err.error.text());
            if (body?.message) {
              detail = body.message;
            }
          }
        } catch {
          // keep the generic message
        }
        this.statusMessage = `Generation failed: ${detail}`;
      }
    });
  }

  resetForm(): void {
    this.previewUrl = null;
    this.statusMessage = '';
  }
}

