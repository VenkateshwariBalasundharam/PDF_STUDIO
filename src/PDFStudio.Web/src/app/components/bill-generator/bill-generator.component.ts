import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { parseCsv, readXlsxRows } from '../design-editor/file-import';
import { RouterLink } from '@angular/router';
import { BillTemplateStore, BillTemplate, BUILTIN_INVOICE_ID } from '../../core/services/bill-template.store';
import { BILL_TEMPLATE, prepareBillHtml, billTemplateProblem, keepAddressBreaks } from './bill-template';
import { Field } from '../design-editor/design-model';
import { designCss, designPagesHtml, designItemRows, expandDesignRows, expandDesignFields } from '../design-editor/design-render';
import { lockPdf } from '../design-editor/pdf-lock';
import { maskValue } from '../design-editor/field-crypto';
interface Line { description: string; quantity: number; price: number; }
interface Invoice { invoiceNo: string; invoiceDate: string; customerName: string; customerAddress: string; secure?: string; lines: Line[]; }
interface Printed {
  invoiceNo: string; invoiceDate: string; customerName: string; customerAddress: string;
  items: { sno: number; description: string; quantity: string; price: string; lineTotal: string }[];
  subtotal: string; tax: string; total: string;
  nSubtotal: number; nTax: number; nTotal: number;
  hasSecure: boolean; secureValue: string;   // protected value: real text only when the PDF is locked with a password, otherwise masked
  invoiceClass: string;   // 'long' when the invoice has more rows than fit in its slot, so rows continue on the next page
  hasInvoiceChart?: boolean;
  invoiceChartSvg?: string;
  invoiceChartTitle?: string;
  invoiceChartBoxStyle?: string;
  invoiceChartFooterStyle?: string;
}
interface Result {
  label: string; rawUrl: string; fileName: string;
  /** Set only for PDFs that were really generated (not previews): the user can name and save these to Documents. */
  blob?: Blob; saveName?: string; saving?: boolean; saved?: boolean; saveError?: string;
}

/** Rough number of item rows that fit in one invoice slot, per "invoices on each page" setting. Tune if your template is taller/shorter. */
const ROWS_PER_SLOT: Record<string, number> = { flow: 18, '1': 18, '2': 9, '3': 5, '4': 3 };
/** How many invoices the Preview button renders (the longest invoice is always added so overflow is visible). */
const PREVIEW_COUNT = 3;

const ALIASES: Record<string, string[]> = {
  invoiceNo: ['invoiceno', 'invoicenumber', 'invoice', 'billno', 'billnumber', 'bill', 'invno'],
  customerName: ['customername', 'customer', 'client', 'clientname', 'billto', 'name'],
  invoiceDate: ['invoicedate', 'billdate', 'date'],
  customerAddress: ['customeraddress', 'address'],
  secure: ['securevalue', 'protectedvalue', 'secret', 'taxid', 'pan', 'aadhaar', 'accountno', 'accountnumber'],
  description: ['description', 'item', 'itemname', 'product', 'particulars'],
  quantity: ['quantity', 'qty'],
  price: ['price', 'rate', 'unitprice']
};

@Component({
  selector: 'app-bill-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="bill-container">
      <p class="sub">Pick an invoice template, then create one invoice or upload a file of bills to get many invoices on each page plus a final consolidated invoice.</p>

      <div class="tabs">
        <button type="button" [class.active]="mode === 'single'" (click)="mode = 'single'">Single invoice</button>
        <button type="button" [class.active]="mode === 'bulk'" (click)="mode = 'bulk'">Bulk from file</button>
      </div>

      <div class="split-view">
        <div class="card form-pane">
          <div class="form-group">
            <label>Template <span class="hint">(grouped by document type)</span></label>
            <select [(ngModel)]="templateId">
              <optgroup *ngFor="let g of templateGroups" [label]="g.label">
                <option *ngFor="let t of g.items" [value]="t.id">{{ t.name }}{{ t.kind === 'design' ? ' (design)' : '' }}</option>
              </optgroup>
            </select>
            <span class="hint" *ngIf="currentTypeLabel()">Document type: <b>{{ currentTypeLabel() }}</b></span>
            <a routerLink="/templates" class="link">Create or edit templates</a>
            <span *ngIf="isDesign" class="hint">Designed in the Editor: every invoice fills the design and prints on its own page. The consolidated invoice is a separate PDF. Currency and formats come from the design's Data tab.</span>
            <span *ngIf="designWarning" class="warn">{{ designWarning }}</span>
          </div>
          <div class="grid-2">
            <div class="form-group"><label>Your company</label><input type="text" [(ngModel)]="company"></div>
            <div class="form-group"><label>Company address (optional)</label><textarea class="autogrow" rows="1" placeholder="Street, city, PIN…" [(ngModel)]="companyAddress" (input)="grow($event)" (focus)="grow($event)"></textarea></div>
            <div class="form-group"><label>Currency symbol</label><input type="text" [(ngModel)]="currency"></div>
            <div class="form-group"><label>Tax % (GST/VAT, 0 for none)</label><input type="number" min="0" [(ngModel)]="taxPercent"></div>
            <div class="form-group"><label>Protected value label</label><input type="text" [(ngModel)]="secureLabel" placeholder="e.g. Tax ID, PAN, Account no."></div>
          </div>

          <div class="form-group protect">
            <label class="check"><input type="checkbox" [(ngModel)]="protect"> Protect the generated PDFs with a password</label>
            <ng-container *ngIf="protect">
              <input [type]="showPw ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="pdfPassword" placeholder="Password needed to open the PDFs">
              <label class="check small"><input type="checkbox" [(ngModel)]="showPw"> Show password</label>
              <span class="hint">The PDF asks for this password when opened, and then shows each invoice's protected value in full. Without a password, only the last 4 characters of a protected value are printed.</span>
              <span class="hint">One password locks every generated PDF (AES-256). Locking happens in your browser, so the password is never sent to the server, and locked PDFs can still be saved to Documents after you choose a name. If you forget the password it cannot be recovered.</span>
            </ng-container>
          </div>

          <div class="form-group watermark-box">
            <label class="check"><input type="checkbox" [(ngModel)]="watermarkEnabled"> Watermark pages with company name & logo</label>
            <ng-container *ngIf="watermarkEnabled">
              <div class="grid-2">
                <div class="form-group">
                  <label>Watermark text</label>
                  <input type="text" [(ngModel)]="watermarkText" [placeholder]="company || 'Company name'">
                </div>
                <div class="form-group">
                  <label>Company logo (image file)</label>
                  <input type="file" accept="image/*" (change)="onLogoSelected($event)">
                </div>
              </div>
              <div class="grid-2 watermark-controls">
                <div class="form-group">
                  <label>Watermark opacity: {{ watermarkOpacity }}%</label>
                  <input type="range" min="3" max="35" [(ngModel)]="watermarkOpacity">
                </div>
                <div class="form-group" *ngIf="watermarkLogo">
                  <label>Logo preview</label>
                  <div class="logo-preview-row">
                    <img [src]="watermarkLogo" alt="Logo preview" class="logo-thumb">
                    <button type="button" class="btn-secondary small" (click)="clearLogo()">✕ Remove logo</button>
                  </div>
                </div>
              </div>
            </ng-container>
          </div>

          <div class="form-group chart-box">
            <label class="check"><input type="checkbox" [(ngModel)]="chartEnabled"> Include day-to-day update graph on invoice</label>
            <ng-container *ngIf="chartEnabled">
              <div class="grid-2">
                <div class="form-group">
                  <label>Graph type</label>
                  <select [(ngModel)]="chartType">
                    <option value="stacked-bar">Stacked Bar (Day-to-Day Updates)</option>
                    <option value="stacked-area">Stacked Area (Volume Trend)</option>
                    <option value="multi-line">Multi-Line (Trajectory)</option>
                    <option value="cumulative">Running Total (Cumulative)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Stack breakdown</label>
                  <select [(ngModel)]="chartGrouping">
                    <option value="customer">Stack by Customer</option>
                    <option value="product">Stack by Product</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Chart inside each invoice</label>
                <select [(ngModel)]="invoiceChartStyle">
                  <option value="stacked-bar">Stacked Bar (single strip)</option>
                  <option value="column">Column Chart (vertical bars)</option>
                  <option value="hbar">Horizontal Bars (ranked)</option>
                  <option value="pie">Pie Chart</option>
                  <option value="donut">Donut Chart</option>
                </select>
              </div>
              <span class="hint">Embeds a live day-to-day vector stacked graph showing updates and volume across billing dates.</span>
            </ng-container>
          </div>

          <!-- ================= SINGLE ================= -->
          <ng-container *ngIf="mode === 'single'">
            <div class="grid-2">
              <div class="form-group"><label>Invoice number</label><input type="text" [(ngModel)]="single.invoiceNo"></div>
              <div class="form-group"><label>Invoice date</label><input type="date" [(ngModel)]="single.invoiceDate"></div>
              <div class="form-group"><label>Customer name</label><input type="text" [(ngModel)]="single.customerName"></div>
              <div class="form-group"><label>Customer address (optional)</label><textarea class="autogrow" rows="1" placeholder="Street, city, PIN…" [(ngModel)]="single.customerAddress" (input)="grow($event)" (focus)="grow($event)"></textarea></div>
              <div class="form-group"><label>Protected value (optional)</label><input type="text" autocomplete="off" [(ngModel)]="single.secure" placeholder="Shown in full only after the PDF password"></div>
            </div>

            <label class="lbl">Items</label>
            <table class="items">
              <thead><tr><th>Description</th><th style="width:80px">Qty</th><th style="width:110px">Price</th><th style="width:100px" class="r">Amount</th><th style="width:34px"></th></tr></thead>
              <tbody>
                <tr *ngFor="let l of single.lines; let i = index">
                  <td><input type="text" [(ngModel)]="l.description"></td>
                  <td><input type="number" min="0" [(ngModel)]="l.quantity"></td>
                  <td><input type="number" min="0" [(ngModel)]="l.price"></td>
                  <td class="r">{{ money(lineAmount(l)) }}</td>
                  <td><button type="button" class="x" (click)="removeLine(i)" [disabled]="single.lines.length === 1">✕</button></td>
                </tr>
              </tbody>
            </table>
            <button type="button" class="btn-secondary" (click)="addLine()">+ Add item</button>

            <div class="totals-box">
              <div><span>Subtotal</span><b>{{ money(singleTotals.subtotal) }}</b></div>
              <div><span>{{ taxLabel() }}</span><b>{{ money(singleTotals.tax) }}</b></div>
              <div class="grand"><span>Total</span><b>{{ money(singleTotals.total) }}</b></div>
            </div>

            <div class="actions">
              <button class="btn-primary" (click)="generateSingle()" [disabled]="busy || previewing">{{ busy ? 'Generating...' : '⚡ Generate invoice' }}</button>
              <button class="btn-secondary" (click)="previewSample()" [disabled]="busy || previewing">{{ previewing ? 'Rendering…' : '👁 Preview' }}</button>
              <button class="btn-secondary" (click)="resetSingle()">Reset</button>
            </div>
          </ng-container>

          <!-- ================= BULK ================= -->
          <ng-container *ngIf="mode === 'bulk'">
            <div class="form-group">
              <label>Bills file (.csv, .tsv or .xlsx) — one row per line item</label>
              <input type="file" accept=".csv,.tsv,.xlsx,.xlsm" (change)="onFile($event)">
              <button type="button" class="link" (click)="downloadSample()">Download a sample CSV</button>
            </div>
            <p class="hint">Columns: <span class="mono">invoiceNo, customerName, invoiceDate, description, quantity, price</span> (+ optional <span class="mono">customerAddress</span> and <span class="mono">secureValue</span> — a value such as a tax ID that is shown in full only after the PDF password is entered). Rows with the same invoiceNo become one invoice.</p>

            <div *ngIf="fileName" class="file-info">
              <b>{{ fileName }}</b> — {{ rowCount }} rows → <b>{{ invoices.length }}</b> invoices,
              grand total <b>{{ money(grandTotal()) }}</b>
            </div>

            <div class="checkbox-row">
              <label><input type="checkbox" [(ngModel)]="includeSummary"> Add a consolidated invoice with analytics &amp; stack chart</label>
            </div>
            <div class="form-group" *ngIf="!isDesign">
              <label>Invoices on each page</label>
              <select [(ngModel)]="layout">
                <option value="flow">Continuous — fit as many as possible</option>
                <option value="1">1 invoice per page</option>
                <option value="2">2 invoices per page</option>
                <option value="3">3 invoices per page</option>
                <option value="4">4 invoices per page</option>
              </select>
            </div>
            <div class="form-group">
              <label>Invoices per PDF (large files are split into parts so rendering stays fast)</label>
              <input type="number" min="1" [(ngModel)]="chunkSize">
            </div>

            <div class="actions">
              <button class="btn-secondary" (click)="previewSample()" [disabled]="busy || previewing || !invoices.length">{{ previewing ? 'Rendering…' : '👁 Preview sample' }}</button>
              <button class="btn-secondary" (click)="previewAll()" [disabled]="busy || previewing || !invoices.length">{{ previewing ? 'Rendering…' : '👁 Preview all' }}</button>
              <button class="btn-primary" (click)="generateBulk()" [disabled]="busy || previewing || !invoices.length">{{ busy ? 'Generating...' : '⚡ Generate invoices' }}</button>
              <button class="btn-secondary" (click)="resetBulk()">Clear file</button>
            </div>

            <div *ngIf="errors.length" class="errors">
              <b>{{ errors.length }} problem{{ errors.length === 1 ? '' : 's' }} found (those rows were skipped):</b>
              <div *ngFor="let e of errors | slice:0:15">{{ e }}</div>
              <div *ngIf="errors.length > 15">…and {{ errors.length - 15 }} more</div>
            </div>
          </ng-container>

          <div *ngIf="statusMessage" class="status-msg" [ngClass]="{'error': isError}">{{ statusMessage }}</div>

          <!-- invoices found: under the form so the right side is all preview -->
          <ng-container *ngIf="mode === 'bulk' && invoices.length">
            <h3>Invoices found</h3>
            <div class="table-scroll">
              <table class="items">
                <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th class="r">Items</th><th class="r">Total</th></tr></thead>
                <tbody>
                  <tr *ngFor="let p of printedPreview">
                    <td>{{ p.invoiceNo }}</td><td>{{ p.customerName }}</td><td>{{ p.invoiceDate }}</td>
                    <td class="r">{{ p.items.length }}</td><td class="r">{{ p.total }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="hint" *ngIf="invoices.length > printedPreview.length">Showing first {{ printedPreview.length }} of {{ invoices.length }} invoices.</div>
          </ng-container>
        </div>

        <!-- ============ right pane ============ -->
        <div class="card preview-pane">

          <div *ngIf="results.length" class="results">
            <h3>Generated PDFs</h3>
            <div *ngFor="let r of results" class="result-block">
              <div class="result-row">
                <span>{{ r.label }}</span>
                <span>
                  <button type="button" class="btn-secondary small" (click)="preview(r)">Preview</button>
                  <a [href]="r.rawUrl" [attr.download]="downloadName(r)" class="btn-secondary small">⬇ Download</a>
                </span>
              </div>
              <div class="save-row" *ngIf="r.blob">
                <label>Save to Documents as</label>
                <input type="text" [(ngModel)]="r.saveName" [disabled]="!!(r.saved || r.saving)" maxlength="150" placeholder="File name">
                <button type="button" class="btn-primary small" (click)="saveToDocuments(r)" [disabled]="!!(r.saved || r.saving)">
                  {{ r.saved ? '✓ Saved' : (r.saving ? 'Saving…' : '💾 Save to Documents') }}
                </button>
                <span class="ok" *ngIf="r.saved">Saved. Open the Documents page to find it.</span>
                <span class="warn" *ngIf="r.saveError">{{ r.saveError }}</span>
              </div>
            </div>
            <div class="save-all" *ngIf="unsavedCount() > 1">
              <button type="button" class="btn-secondary" (click)="saveAll()" [disabled]="savingAll">{{ savingAll ? 'Saving…' : '💾 Save all ' + unsavedCount() + ' to Documents' }}</button>
            </div>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;" *ngIf="previewUrl">
            <h3>Preview</h3>
          </div>
          <iframe *ngIf="previewUrl" [src]="previewUrl" class="preview-iframe"></iframe>
          <div *ngIf="!previewUrl && !results.length" class="preview-placeholder">
            <span>{{ mode === 'single' ? "Fill in the invoice and click 'Generate invoice'" : (invoices.length ? "Click 'Preview all' or 'Generate invoices' to see the PDF here" : 'Upload a bills file to get started') }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .sub { color: var(--text-muted); font-size: .875rem; margin-bottom: 1rem; }
    .tabs { display: flex; gap: .5rem; margin-bottom: 1rem; }
    .tabs button { padding: .5rem 1rem; border: 1px solid var(--border-color); background: transparent; color: inherit; border-radius: 6px; cursor: pointer; }
    .tabs button.active { background: var(--accent-text, #4f46e5); color: #fff; border-color: transparent; }
    .split-view { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; }
    @media (max-width: 1100px) { .split-view { grid-template-columns: minmax(0, 1fr); } }
    textarea.autogrow { resize: none; overflow: hidden; min-height: 2.4rem; line-height: 1.4; field-sizing: content; }
    .form-group { margin-bottom: 1rem; display: flex; flex-direction: column; gap: .35rem; }
    .form-group label, .lbl { font-size: .8rem; font-weight: 500; color: var(--text-muted); }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 1rem; }
    table.items { width: 100%; border-collapse: collapse; margin: .5rem 0; font-size: .85rem; }
    table.items th { text-align: left; padding: .35rem; color: var(--text-muted); font-weight: 500; border-bottom: 1px solid var(--border-color); }
    table.items td { padding: .25rem; border-bottom: 1px solid var(--border-color); }
    table.items input { width: 100%; }
    .r { text-align: right; }
    .x { background: none; border: none; color: inherit; cursor: pointer; opacity: .6; }
    .totals-box { margin: 1rem 0 0 auto; width: 260px; font-size: .9rem; }
    .totals-box > div { display: flex; justify-content: space-between; padding: .2rem 0; }
    .totals-box .grand { border-top: 2px solid var(--border-color); font-size: 1rem; margin-top: .25rem; padding-top: .4rem; }
    .actions { margin-top: 1.25rem; display: flex; gap: 1rem; flex-wrap: wrap; }
    .hint { font-size: .78rem; color: var(--text-muted); }
    .link { background: none; border: none; color: var(--accent-text, #4f46e5); cursor: pointer; padding: 0; text-align: left; font-size: .8rem; }
    .file-info { margin: .75rem 0; font-size: .875rem; }
    .checkbox-row { margin: .75rem 0; font-size: .875rem; }
    .checkbox-row label { display: flex; gap: .5rem; align-items: center; cursor: pointer; }
    .warn { font-size: .78rem; color: #b45309; }
    .check { display: flex; gap: .5rem; align-items: center; cursor: pointer; font-size: .85rem; }
    .check.small { font-size: .78rem; color: var(--text-muted); }
    .errors { margin-top: 1rem; font-size: .78rem; color: #dc2626; }
    .preview-pane { display: flex; flex-direction: column; min-height: 550px; gap: .5rem; }
    .table-scroll { max-height: 280px; overflow: auto; }
    .preview-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; border: 2px dashed var(--border-color); border-radius: 6px; color: var(--text-muted); }
    .preview-iframe { flex: 1; min-height: 640px; width: 100%; border: 1px solid var(--border-color); border-radius: 6px; }
    .result-block { border-bottom: 1px solid var(--border-color); padding-bottom: .4rem; }
    .result-block .result-row { border-bottom: none; }
    .save-row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .25rem 0 .35rem; font-size: .8rem; }
    .save-row input { flex: 1; min-width: 160px; }
    .save-row .ok { color: #16a34a; }
    .save-all { padding: .5rem 0; }
    .result-row { display: flex; justify-content: space-between; align-items: center; padding: .4rem 0; border-bottom: 1px solid var(--border-color); font-size: .85rem; gap: .5rem; }
    .small { font-size: .75rem; padding: .25rem .6rem; margin-left: .4rem; text-decoration: none; }
    .watermark-box { border: 1px dashed var(--border-color); padding: .75rem 1rem; border-radius: 6px; background: rgba(0,0,0,.02); margin-bottom: 1rem; }
    .watermark-controls { margin-top: .35rem; align-items: center; }
    .logo-preview-row { display: flex; align-items: center; gap: .75rem; }
    .logo-thumb { max-height: 38px; max-width: 90px; object-fit: contain; border: 1px solid var(--border-color); border-radius: 4px; padding: 2px; background: #fff; }
    .qr-box { border: 1px dashed var(--border-color); padding: .75rem 1rem; border-radius: 6px; background: rgba(0,0,0,.02); margin-bottom: 1rem; }
    .chart-box { border: 1px dashed var(--border-color); padding: .65rem .85rem; border-radius: 6px; background: rgba(0,0,0,.02); margin: .5rem 0 .75rem 0; }
    .status-msg { margin-top: 1rem; font-size: .85rem; }
    .status-msg.error { color: #dc2626; }
  `]
})
export class BillGeneratorComponent {
  mode: 'single' | 'bulk' = 'single';

  // shared settings
  company = 'Your Company Name';
  companyAddress = '';
  currency = '₹';
  taxPercent = 0;

  // single
  single: Invoice = this.blankInvoice();

  // bulk
  fileName = '';
  rowCount = 0;
  invoices: Invoice[] = [];
  printedPreview: Printed[] = [];
  errors: string[] = [];
  includeSummary = true;
  chunkSize = 200;
  layout: 'flow' | '1' | '2' | '3' | '4' = '1';   // default: each invoice on its own page

  // password protection
  secureLabel = 'Tax ID';
  protect = false;
  pdfPassword = '';
  showPw = false;

  // watermark
  watermarkEnabled = false;
  watermarkText = '';
  watermarkLogo = '';
  watermarkOpacity = 8;

  // day-to-day update graph
  chartEnabled = true;
  chartType: 'stacked-bar' | 'stacked-area' | 'multi-line' | 'cumulative' = 'stacked-bar';
  chartGrouping: 'customer' | 'product' = 'customer';
  // chart drawn inside each invoice (line-item breakdown)
  invoiceChartStyle: 'stacked-bar' | 'column' | 'hbar' | 'pie' | 'donut' = 'stacked-bar';

  // output
  busy = false;
  previewing = false;
  private previewObjectUrl = '';
  statusMessage = '';
  isError = false;
  previewUrl: SafeResourceUrl | null = null;
  results: Result[] = [];

  templates: BillTemplate[] = [];
  templateId = BUILTIN_INVOICE_ID;

  constructor(private api: ApiService, private sanitizer: DomSanitizer, private store: BillTemplateStore) {
    this.templates = this.store.list();
  }

  /** Which kind of document a template makes, so the dropdown can group them. */
  private static readonly TYPE_OF: Record<string, string> = {
    'builtin-invoice': 'Invoices',
    'fmt-classic': 'Invoices', 'fmt-modern': 'Invoices', 'fmt-minimal': 'Invoices', 'fmt-tax': 'Invoices',
    'fmt-executive': 'Invoices', 'fmt-freelance': 'Invoices', 'fmt-saas': 'Invoices',
    'fmt-quote': 'Quotes & orders', 'fmt-po': 'Quotes & orders',
    'fmt-receipt': 'Bills & receipts', 'fmt-restaurant': 'Bills & receipts', 'fmt-medical': 'Bills & receipts',
    'fmt-hotel': 'Bills & receipts', 'fmt-rent': 'Bills & receipts', 'fmt-logistics': 'Bills & receipts',
    'fmt-auto': 'Bills & receipts',
    'fmt-payslip': 'Payroll & certificates', 'fmt-certificate': 'Payroll & certificates'
  };
  private typeOf(t: BillTemplate): string { return BillGeneratorComponent.TYPE_OF[t.id] ?? 'My templates'; }
  currentTypeLabel(): string { return this.typeOf(this.currentTemplate()); }
  get templateGroups(): { label: string; items: BillTemplate[] }[] {
    const order = ['Invoices', 'Bills & receipts', 'Quotes & orders', 'Payroll & certificates', 'My templates'];
    return order
      .map(label => ({ label, items: this.templates.filter(t => this.typeOf(t) === label) }))
      .filter(g => g.items.length);
  }

  savingAll = false;

  /** File name offered for download: the name the user typed, made safe for Windows. */
  downloadName(r: Result): string {
    const n = (r.saveName ?? '').trim().replace(/[\\/:*?"<>|]+/g, '-');
    return n ? `${n}.pdf` : r.fileName;
  }
  unsavedCount(): number { return this.results.filter(r => r.blob && !r.saved).length; }

  /** Saves one generated PDF (locked or not) to the Documents page under the name the user chose. */
  async saveToDocuments(r: Result): Promise<void> {
    const name = (r.saveName ?? '').trim();
    if (!name) { r.saveError = 'Enter a file name first.'; return; }
    if (!r.blob || r.saved || r.saving) return;
    r.saving = true; r.saveError = '';
    try {
      await firstValueFrom(this.api.saveDocument(name, r.blob));
      r.saved = true;
    } catch (e: any) {
      r.saveError = this.errText(e) || 'Could not save to Documents. Make sure the Public API is running and has been rebuilt.';
    }
    r.saving = false;
  }
  async saveAll(): Promise<void> {
    this.savingAll = true;
    for (const r of this.results) if (r.blob && !r.saved) await this.saveToDocuments(r);
    this.savingAll = false;
  }

  get isDesign(): boolean { return this.currentTemplate().kind === 'design'; }

  /** Warns when invoices have more line items than the design has rows. */
  get designWarning(): string {
    const t = this.currentTemplate();
    if (t.kind !== 'design' || !t.design) return '';
    const rows = designItemRows(t.design);
    const most = this.mode === 'single'
      ? this.single.lines.filter(l => l.description.trim()).length
      : this.invoices.reduce((m, i) => Math.max(m, i.lines.length), 0);
    if (rows === 0) return 'This design has no line-item rows ({{item1Description}} etc.), so item lines will not be printed. Add them in the Editor.';
    if (most > rows) return `This design has ${rows} item row(s) but some invoices have up to ${most} items. The table will grow automatically so every row prints on the same page (rows only continue on a new page if the page is full). Use Preview to check.`;
    return '';
  }

  private currentTemplate(): BillTemplate {
    return this.store.get(this.templateId) ?? this.store.get(BUILTIN_INVOICE_ID)!;
  }

  // ---------- helpers ----------
  private blankInvoice(): Invoice {
    return {
      invoiceNo: 'INV-001',
      invoiceDate: new Date().toISOString().slice(0, 10),
      customerName: '',
      customerAddress: '',
      lines: [{ description: '', quantity: 1, price: 0 }]
    };
  }

  private r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  lineAmount(l: Line): number { return this.r2((Number(l.quantity) || 0) * (Number(l.price) || 0)); }
  money(n: number): string {
    return this.currency + ' ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  taxLabel(): string { return Number(this.taxPercent) > 0 ? `Tax (${Number(this.taxPercent)}%)` : 'Tax'; }

  private totalsOf(inv: Invoice) {
    const subtotal = this.r2(inv.lines.reduce((s, l) => s + this.lineAmount(l), 0));
    const tax = this.r2(subtotal * (Number(this.taxPercent) || 0) / 100);
    return { subtotal, tax, total: this.r2(subtotal + tax) };
  }
  get singleTotals() { return this.totalsOf(this.single); }
  grandTotal(): number { return this.r2(this.invoices.reduce((s, i) => s + this.totalsOf(i).total, 0)); }

  private chartTitleFor(style: string): string {
    switch (style) {
      case 'column': return 'Line Items Column Chart';
      case 'hbar': return 'Line Items Ranked by Amount';
      case 'pie': return 'Line Items Pie Chart';
      case 'donut': return 'Line Items Donut Chart';
      default: return 'Line Items Stack Breakdown';
    }
  }

  private generateInvoiceItemChart(inv: Invoice): string {
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
    const validLines = inv.lines.filter(l => l.description.trim() && this.lineAmount(l) > 0);
    if (validLines.length === 0) return '';
    const total = validLines.reduce((s, l) => s + this.lineAmount(l), 0);
    if (total <= 0) return '';

    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const short = (t: string, n: number) => esc(t.length > n ? t.slice(0, n - 2) + '…' : t);
    const items = validLines.map((l, i) => {
      const amt = this.lineAmount(l);
      return { label: l.description, amt, pct: amt / total, col: colors[i % colors.length] };
    });
    const legend = () => items.map(it =>
      `<span style="display:inline-flex;align-items:center;margin-right:10px;font-size:7pt;color:#475569;"><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${it.col};margin-right:3px;"></span>${short(it.label, 18)} (${(it.pct * 100).toFixed(0)}%)</span>`).join('');
    const style = this.invoiceChartStyle;
    const W = 520;

    // All chart styles are drawn small (about 240px wide) so they sit in the footer corner exactly like the pie.
    const SW = 240;
    const rowsLegend = () => items.map(it =>
      `<div style="display:flex;align-items:center;font-size:6.5pt;color:#334155;margin:1px 0;white-space:nowrap;"><span style="display:inline-block;width:6px;height:6px;border-radius:1px;background:${it.col};margin-right:4px;flex:none;"></span><span style="flex:1;overflow:hidden;">${short(it.label, 18)}</span><span style="margin-left:8px;">${(it.pct * 100).toFixed(0)}%</span></div>`).join('');

    // ---- column chart (vertical bars) ----
    if (style === 'column') {
      const H = 70, top = 10, bottom = 12, plotH = H - top - bottom;
      const max = Math.max(...items.map(i => i.amt));
      const slot = SW / items.length, bw = Math.min(22, slot * 0.6);
      const fs = items.length > 6 ? 5 : 6;
      let g = `<line x1="0" y1="${top + plotH}" x2="${SW}" y2="${top + plotH}" stroke="#cbd5e1" stroke-width="0.6"/>`;
      items.forEach((it, i) => {
        const h = Math.max(1.5, (it.amt / max) * plotH);
        const x = slot * i + (slot - bw) / 2, y = top + plotH - h;
        g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${it.col}" rx="1"/>`
          + `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" font-size="${fs}" text-anchor="middle" fill="#334155">${esc(Math.round(it.amt).toLocaleString('en-IN'))}</text>`
          + `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 3}" font-size="${fs}" text-anchor="middle" fill="#475569">${short(it.label, Math.max(4, Math.floor(slot / 4.2)))}</text>`;
      });
      return `<svg viewBox="0 0 ${SW} ${H}" width="100%" style="display:block;">${g}</svg>`;
    }

    // ---- horizontal ranked bars ----
    if (style === 'hbar') {
      const ranked = [...items].sort((a, b) => b.amt - a.amt);
      const rowH = 11, labelW = 66, valW = 40, plotW = SW - labelW - valW;
      const max = ranked[0].amt;
      let g = '';
      ranked.forEach((it, i) => {
        const y = i * rowH + 1, w = Math.max(1.5, (it.amt / max) * plotW);
        g += `<text x="0" y="${y + 6.5}" font-size="6" fill="#475569">${short(it.label, 15)}</text>`
          + `<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="7" fill="${it.col}" rx="1"/>`
          + `<text x="${(labelW + w + 3).toFixed(1)}" y="${y + 6.5}" font-size="6" fill="#334155">${esc(Math.round(it.amt).toLocaleString('en-IN'))}</text>`;
      });
      const H = ranked.length * rowH + 2;
      return `<svg viewBox="0 0 ${SW} ${H}" width="100%" style="display:block;">${g}</svg>`;
    }

    // ---- pie / donut ----
    if (style === 'pie' || style === 'donut') {
      const R = 48, cx = 52, cy = 52, size = 104, shown = 64;   // drawn small: viewBox 104, displayed at 64px
      let ang = -Math.PI / 2, g = '';
      const pt = (a: number, r: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
      if (items.length === 1) {
        g = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${items[0].col}"/>`;
      } else {
        for (const it of items) {
          const a2 = ang + it.pct * Math.PI * 2, large = it.pct > 0.5 ? 1 : 0;
          g += `<path d="M ${cx},${cy} L ${pt(ang, R)} A ${R},${R} 0 ${large} 1 ${pt(a2, R)} Z" fill="${it.col}" stroke="#ffffff" stroke-width="1"/>`;
          ang = a2;
        }
      }
      if (style === 'donut') {
        const whole = this.currency + ' ' + Math.round(total).toLocaleString('en-IN');   // no decimals so it fits the hole
        g += `<circle cx="${cx}" cy="${cy}" r="${R * 0.6}" fill="#ffffff"/>`
          + `<text x="${cx}" y="${cy - 2}" font-size="9" text-anchor="middle" fill="#64748b">TOTAL</text>`
          + `<text x="${cx}" y="${cy + 11}" font-size="11" font-weight="bold" text-anchor="middle" fill="#0f172a">${esc(whole)}</text>`;
      }
      const rows = items.map(it =>
        `<div style="display:flex;align-items:center;font-size:6.5pt;color:#334155;margin:1px 0;white-space:nowrap;"><span style="display:inline-block;width:6px;height:6px;border-radius:1px;background:${it.col};margin-right:4px;flex:none;"></span><span style="flex:1;overflow:hidden;">${short(it.label, 14)}</span><span style="margin-left:8px;">${(it.pct * 100).toFixed(0)}%</span></div>`).join('');
      return `<div style="display:flex;align-items:center;gap:10px;"><svg viewBox="0 0 ${size} ${size}" width="${shown}" height="${shown}" style="display:block;flex:none;">${g}</svg><div style="flex:1;min-width:0;">${rows}</div></div>`;
    }

    // ---- stacked bar (default) ----
    const barH = 10;
    let curX = 0, rects = '';
    items.forEach(it => {
      const segW = Math.max(2, Math.round(it.pct * SW));
      rects += `<rect x="${curX}" y="1" width="${segW}" height="${barH}" fill="${it.col}" stroke="#ffffff" stroke-width="0.5"/>`;
      curX += segW;
    });
    return `<div><svg viewBox="0 0 ${SW} 12" width="100%" style="display:block;border-radius:2px;overflow:hidden;border:1px solid #cbd5e1;">${rects}</svg><div style="margin-top:3px;">${rowsLegend()}</div></div>`;
  }

  private toPrinted(inv: Invoice, reveal = false): Printed {
    const t = this.totalsOf(inv);
    const secure = (inv.secure ?? '').trim();
    const hasInvoiceChart = this.chartEnabled && inv.lines.length > 1;
    const invoiceChartSvg = hasInvoiceChart ? this.generateInvoiceItemChart(inv) : '';
    return {
      invoiceNo: inv.invoiceNo, invoiceDate: inv.invoiceDate, customerName: inv.customerName, customerAddress: inv.customerAddress,
      items: inv.lines.map((l, i) => ({
        sno: i + 1, description: l.description, quantity: String(Number(l.quantity) || 0),
        price: this.money(Number(l.price) || 0), lineTotal: this.money(this.lineAmount(l))
      })),
      subtotal: this.money(t.subtotal), tax: this.money(t.tax), total: this.money(t.total),
      nSubtotal: t.subtotal, nTax: t.tax, nTotal: t.total,
      hasSecure: !!secure, secureValue: reveal ? secure : maskValue(secure, 4),
      invoiceClass: inv.lines.length > (ROWS_PER_SLOT[this.layout] ?? 18) ? 'long' : '',
      hasInvoiceChart, invoiceChartSvg, invoiceChartTitle: this.chartTitleFor(this.invoiceChartStyle),
      invoiceChartFooterStyle: 'width:240px;',            // every chart style uses the same small footer box as the pie
      invoiceChartBoxStyle: 'width:200px;margin-left:auto;padding:4px 6px;'
    };
  }

  // Continuous: one sheet holding every invoice (they flow down the pages). Otherwise N invoices per sheet/page.
  // An invoice with more rows than fit in its slot ("long") gets a sheet of its own and its rows continue onto the next page(s).
  private toSheets(print: Printed[]): { invoices: Printed[]; sheetClass: string }[] {
    if (!print.length) return [];
    if (this.layout === 'flow') return [{ invoices: print, sheetClass: '' }];
    const n = Number(this.layout);
    const sheets: { invoices: Printed[]; sheetClass: string }[] = [];
    let group: Printed[] = [];
    const flush = () => { if (group.length) { sheets.push({ invoices: group, sheetClass: '' }); group = []; } };
    for (const p of print) {
      if (p.invoiceClass === 'long') { flush(); sheets.push({ invoices: [p], sheetClass: 'long-sheet' }); }
      else { group.push(p); if (group.length === n) flush(); }
    }
    flush();
    return sheets;
  }

  private payload(print: Printed[], summaryFrom: Printed[] | null): Record<string, any> {
    const data: Record<string, any> = {
      company: this.company, companyAddress: this.companyAddress,
      taxLabel: this.taxLabel(), secureLabel: this.secureLabel,
      sheets: this.toSheets(print),
      layoutClass: this.layout === 'flow' || this.layout === '1' ? '' : 'compact',
      slot: this.layout === 'flow' ? '' : `${Math.floor(277 / Number(this.layout)) - 6}mm`,
      showSummary: !!summaryFrom
    };
    if (summaryFrom) {
      const byCustomer = new Map<string, { count: number; total: number }>();
      let sub = 0, tax = 0;
      for (const p of summaryFrom) {
        sub += p.nSubtotal; tax += p.nTax;
        const c = byCustomer.get(p.customerName) ?? { count: 0, total: 0 };
        c.count++; c.total += p.nTotal;
        byCustomer.set(p.customerName, c);
      }
      const grandTotalNum = this.r2(sub + tax);
      data['generatedOn'] = new Date().toISOString().slice(0, 10);
      data['invoiceCount'] = summaryFrom.length;
      data['summaryRows'] = summaryFrom.map(p => ({
        invoiceNo: p.invoiceNo, customerName: p.customerName, invoiceDate: p.invoiceDate,
        subtotal: p.subtotal, tax: p.tax, total: p.total
      }));
      data['customerRows'] = [...byCustomer.entries()].map(([customerName, c]) => ({
        customerName, count: c.count, total: this.money(this.r2(c.total))
      }));
      data['grandSubtotal'] = this.money(this.r2(sub));
      data['grandTax'] = this.money(this.r2(tax));
      data['grandTotal'] = this.money(grandTotalNum);

      // Executive KPIs
      let topCustomerName = '—', topCustomerVal = 0;
      for (const [cust, c] of byCustomer.entries()) {
        if (c.total > topCustomerVal) { topCustomerVal = c.total; topCustomerName = cust; }
      }
      const byDate = new Map<string, number>();
      for (const p of summaryFrom) {
        const d = p.invoiceDate || 'N/A';
        byDate.set(d, (byDate.get(d) ?? 0) + p.nTotal);
      }
      let peakDate = '—', peakDateVal = 0;
      for (const [d, tot] of byDate.entries()) {
        if (tot > peakDateVal) { peakDateVal = tot; peakDate = d; }
      }

      data['hasSummaryKpis'] = true;
      data['avgOrderValue'] = this.money(this.r2(grandTotalNum / (summaryFrom.length || 1)));
      data['topCustomerName'] = topCustomerName;
      data['topCustomerTotal'] = this.money(this.r2(topCustomerVal));
      data['topCustomerShare'] = grandTotalNum > 0 ? ((topCustomerVal / grandTotalNum) * 100).toFixed(1) + '%' : '0%';
      data['peakDate'] = peakDate;
      data['peakDateTotal'] = this.money(this.r2(peakDateVal));

      // Day-to-Day Analytics Chart
      if (this.chartEnabled) {
        const chart = this.generateSummaryChart(summaryFrom);
        data['hasSummaryChart'] = true;
        data['chartGroupingLabel'] = this.chartGrouping === 'customer' ? 'by Customer' : 'by Product';
        data['summaryChartSvg'] = chart.svg;
        data['summaryChartLegendHtml'] = chart.legend;
      }
    }
    return data;
  }

  private async render(title: string, data: Record<string, any>, doNotSave = false): Promise<Blob> {
    const tpl = this.currentTemplate();
    const problem = billTemplateProblem(tpl.htmlContent);
    if (problem) throw new Error(problem);
    const html = this.injectWatermark(prepareBillHtml(tpl.htmlContent));
    const res = await firstValueFrom(this.api.generatePdf({
      title,
      htmlContent: html,
      templateData: data,
      pageSize: tpl.defaultPageSize,
      orientation: tpl.defaultOrientation,
      printBackground: true,
      doNotSave: true   // nothing is saved automatically: the user names the file and clicks Save to Documents
    }));
    return res as Blob;
  }

  /** Returns the open-password to lock with, '' when protection is off, or null (after showing an error) if it is on but empty. */
  private lockPassword(): string | null {
    if (!this.protect) return '';
    if (!this.pdfPassword.trim()) { this.fail('Enter a password, or untick "Protect the generated PDFs with a password".'); return null; }
    return this.pdfPassword;
  }

  private fail(msg: string) { this.statusMessage = msg; this.isError = true; this.busy = false; }
  private clearOutput() {
    for (const r of this.results) URL.revokeObjectURL(r.rawUrl);
    if (this.previewObjectUrl) { URL.revokeObjectURL(this.previewObjectUrl); this.previewObjectUrl = ''; }
    this.results = []; this.previewUrl = null; this.statusMessage = ''; this.isError = false;
  }
  private errText(e: any): string {
    return e?.error?.message || e?.message || 'Could not generate the PDF. Is the Public API running on port 5000?';
  }

  // ---------- editor designs ----------
  private isoDate(s: string): string {
    const t = (s ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(t);     // day-first, e.g. 01/10/2026
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t;
  }

  /** Fills the design's data fields from one invoice. Fields the design does not have are skipped. */
  private designFields(fieldsIn: Field[], inv: Invoice, rows = Infinity, chunk = 0, chunks = 1, reveal = false): Field[] {
    const t = this.totalsOf(inv);
    const lastChunk = chunk === chunks - 1;
    const date = this.isoDate(inv.invoiceDate);
    const values: Record<string, any> = {
      invoiceNo: inv.invoiceNo, orderNo: inv.invoiceNo, billNo: inv.invoiceNo, invoiceNumber: inv.invoiceNo, orderNumber: inv.invoiceNo,
      invoiceDate: date, date: date,
      billName: inv.customerName, customerName: inv.customerName, recipient: inv.customerName, customer: inv.customerName, clientName: inv.customerName,
      billAddress: inv.customerAddress, customerAddress: inv.customerAddress, clientAddress: inv.customerAddress, address: inv.customerAddress,
      company: this.company, companyAddress: this.companyAddress,
      subtotal: t.subtotal, tax: t.tax, total: t.total, amount: t.total, taxRate: Number(this.taxPercent) || 0,
      secureValue: (inv.secure ?? '').trim(), secureLabel: this.secureLabel
    };
    return fieldsIn.map(src => {
      const f: Field = { ...src };
      if (f.type === 'currency' && this.currency) {
        f.currency = this.currency === '₹' ? 'INR' : (this.currency === '$' ? 'USD' : (this.currency === '€' ? 'EUR' : (this.currency === '£' ? 'GBP' : f.currency)));
      }
      const item = /^item(\d+)(Description|Quantity|Price|Amount)$/.exec(f.key);
      if (item) {
        const l = inv.lines[chunk * (Number.isFinite(rows) ? rows : 0) + parseInt(item[1], 10) - 1];
        f.value = !l ? '' : item[2] === 'Description' ? l.description : item[2] === 'Quantity' ? l.quantity
          : item[2] === 'Price' ? l.price : this.lineAmount(l);
      } else if (f.key in values) {
        f.value = (!lastChunk && ['subtotal', 'tax', 'total'].includes(f.key)) ? '' : values[f.key];   // totals only on the last page of a long invoice
        if (f.key === 'secureValue' && f.type !== 'encrypted') f.type = 'encrypted';   // masked unless the PDF is locked
        if (f.key === 'invoiceDate' && f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(f.value))) f.type = 'text';
      }
      // Locked PDF: encrypted fields set to lock the PDF print their real value (the PDF asks for the password first).
      if (reveal && f.type === 'encrypted' && (f.lockPdf || f.key === 'secureValue')) f.type = 'text';
      return f;
    });
  }

  private async renderDesign(title: string, invs: Invoice[], doNotSave = false, reveal = false): Promise<Blob> {
    const baseDoc = this.currentTemplate().design!;
    const baseRows = designItemRows(baseDoc);
    const pagesFor = (i: Invoice) => {
      // Grow the item table so every row prints on the same page; only if the page truly cannot hold them do rows continue on a new page.
      const { doc: d, rowsPerPage } = expandDesignRows(baseDoc, i.lines.length);
      const rows = baseRows > 0 ? rowsPerPage : 0;
      const fields = rows > baseRows ? expandDesignFields(baseDoc.fields ?? [], baseRows, rows) : (baseDoc.fields ?? []);
      const chunks = rows > 0 ? Math.max(1, Math.ceil(i.lines.length / rows)) : 1;
      let out = '';
      for (let c = 0; c < chunks; c++) out += designPagesHtml(d, this.designFields(fields, i, rows || Infinity, c, chunks, reveal));
      return out;
    };
    const rawHtml = (designCss(baseDoc) + invs.map(pagesFor).join(''))
      .replace(/\{\{/g, '&#123;&#123;');   // keep any leftover {{text}} from being treated as a template tag
    const html = this.injectWatermark(rawHtml);
    const res = await firstValueFrom(this.api.generatePdf({
      title, htmlContent: html, pageSize: baseDoc.size, orientation: baseDoc.orientation,
      marginTopMm: 0, marginBottomMm: 0, marginLeftMm: 0, marginRightMm: 0, printBackground: true, doNotSave: true
    }));
    return res as Blob;
  }

  /** The consolidated invoice as its own PDF (used with designs, which print one design per page). */
  private async renderSummaryOnly(title: string, all: Printed[], doNotSave = false): Promise<Blob> {
    const html = this.injectWatermark(BILL_TEMPLATE);
    const res = await firstValueFrom(this.api.generatePdf({
      title, htmlContent: html, templateData: this.payload([], all),
      pageSize: 'A4', orientation: 'Portrait', printBackground: true, doNotSave: true
    }));
    return res as Blob;
  }

  onLogoSelected(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.fail('Please select a valid image file (PNG, JPG, SVG, etc.).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.watermarkLogo = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  clearLogo() {
    this.watermarkLogo = '';
  }

  private escapeHtml(s: string): string {
    return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Auto-grow a textarea to fit what is typed. */
  grow(ev: Event) {
    const el = ev.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  private injectWatermark(html: string): string {
    html = keepAddressBreaks(html);
    if (!this.watermarkEnabled) return html;
    const text = (this.watermarkText?.trim() || this.company?.trim() || '').trim();
    const hasLogo = !!this.watermarkLogo;
    if (!text && !hasLogo) return html;

    const op = Math.max(0.03, Math.min(0.5, (Number(this.watermarkOpacity) || 8) / 100));
    const rot = -30;

    // One mark only, drawn in the centre of each receipt (logo above the company name).
    // Font size shrinks for long names so the rotated mark always stays inside a normal receipt.
    const label = text.toUpperCase();
    const fs = Math.max(16, Math.min(40, Math.round(380 / Math.max(1, label.length * 0.72))));
    const textW = label.length * (fs * 0.7 + 2);
    const logoH = hasLogo ? 110 : 0, gap = hasLogo && text ? 14 : 0;
    const innerW = Math.max(textW, hasLogo ? logoH : 0), innerH = logoH + gap + (text ? fs * 1.2 : 0);
    const rad = Math.abs(rot) * Math.PI / 180;
    const W = Math.ceil(innerW * Math.cos(rad) + innerH * Math.sin(rad) + 40);
    const H = Math.ceil(innerW * Math.sin(rad) + innerH * Math.cos(rad) + 40);
    const logo = hasLogo
      ? `<image href="${this.watermarkLogo}" x="${-logoH / 2}" y="${-innerH / 2}" width="${logoH}" height="${logoH}" preserveAspectRatio="xMidYMid meet"/>`
      : '';
    const name = text
      ? `<text x="0" y="${innerH / 2 - fs * 0.25}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fs}" font-weight="800" letter-spacing="2" fill="#111827">${this.escapeHtml(label)}</text>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g opacity="${op}" transform="translate(${W / 2} ${H / 2}) rotate(${rot})">${logo}${name}</g></svg>`;
    const mark = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

    // Background of each invoice / consolidated block: behind the content, centred, not repeated.
    const watermarkCss = `
<style>
  .invoice, .consolidated {
    background-image: ${mark} !important;
    background-repeat: no-repeat !important;
    background-position: center center !important;
    background-size: ${W}px ${H}px !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style>
`;
    return watermarkCss + html;
  }

  private generateSummaryChart(summaryFrom: Printed[]): { svg: string; legend: string } {
    const rawDates = [...new Set(summaryFrom.map(p => p.invoiceDate).filter(Boolean))].sort();
    const dates = rawDates.length > 0 ? rawDates : [new Date().toISOString().slice(0, 10)];
    const displayDates = dates.length > 12 ? dates.slice(-12) : dates;

    const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];
    let categories: string[] = [];
    const catTotals = new Map<string, number>();

    if (this.chartGrouping === 'product') {
      for (const p of summaryFrom) {
        for (const it of p.items) {
          const desc = it.description.trim() || 'Item';
          const lineVal = parseFloat(it.lineTotal.replace(/[^0-9.-]/g, '')) || 0;
          catTotals.set(desc, (catTotals.get(desc) ?? 0) + lineVal);
        }
      }
    } else {
      for (const p of summaryFrom) {
        const cust = p.customerName.trim() || 'Customer';
        catTotals.set(cust, (catTotals.get(cust) ?? 0) + p.nTotal);
      }
    }

    const sortedCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]);
    const topCount = Math.min(4, sortedCats.length);
    categories = sortedCats.slice(0, topCount).map(c => c[0]);
    const hasOthers = sortedCats.length > topCount;
    if (hasOthers) categories.push('Others');

    const series: number[][] = categories.map(() => new Array(displayDates.length).fill(0));
    const dailyTotals: number[] = new Array(displayDates.length).fill(0);

    for (const p of summaryFrom) {
      const dIdx = displayDates.indexOf(p.invoiceDate);
      if (dIdx < 0) continue;

      if (this.chartGrouping === 'product') {
        for (const it of p.items) {
          const desc = it.description.trim() || 'Item';
          const lineVal = parseFloat(it.lineTotal.replace(/[^0-9.-]/g, '')) || 0;
          let cIdx = categories.indexOf(desc);
          if (cIdx < 0 && hasOthers) cIdx = categories.indexOf('Others');
          if (cIdx >= 0) {
            series[cIdx][dIdx] += lineVal;
            dailyTotals[dIdx] += lineVal;
          }
        }
      } else {
        const cust = p.customerName.trim() || 'Customer';
        let cIdx = categories.indexOf(cust);
        if (cIdx < 0 && hasOthers) cIdx = categories.indexOf('Others');
        if (cIdx >= 0) {
          series[cIdx][dIdx] += p.nTotal;
          dailyTotals[dIdx] += p.nTotal;
        }
      }
    }

    const W = 750, H = 160;
    const padL = 45, padR = 15, padT = 18, padB = 28;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const maxVal = Math.max(...dailyTotals, 100);
    const maxY = Math.ceil((maxVal * 1.15) / 1000) * 1000 || 1000;

    let svgInner = '';

    const ySteps = 3;
    for (let i = 0; i <= ySteps; i++) {
      const v = (maxY / ySteps) * i;
      const y = padT + plotH - (i / ySteps) * plotH;
      svgInner += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="${i === 0 ? 'none' : '3,3'}"/>`;
      const label = v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v.toFixed(0)}`;
      svgInner += `<text x="${padL - 6}" y="${y + 3}" font-family="Arial,sans-serif" font-size="8" fill="#64748b" text-anchor="end">${label}</text>`;
    }

    const colW = plotW / displayDates.length;

    for (let d = 0; d < displayDates.length; d++) {
      const x = padL + d * colW + colW / 2;
      const dateStr = displayDates[d].length > 5 ? displayDates[d].slice(5) : displayDates[d];
      svgInner += `<text x="${x}" y="${H - 10}" font-family="Arial,sans-serif" font-size="8" fill="#64748b" text-anchor="middle">${dateStr}</text>`;
    }

    if (this.chartType === 'stacked-area') {
      const baseline = new Array(displayDates.length).fill(0);
      for (let s = 0; s < series.length; s++) {
        const topPts: string[] = [];
        const botPts: string[] = [];
        for (let d = 0; d < displayDates.length; d++) {
          const x = padL + d * colW + colW / 2;
          const bVal = baseline[d];
          const tVal = bVal + series[s][d];
          const yBot = padT + plotH - (bVal / maxY) * plotH;
          const yTop = padT + plotH - (tVal / maxY) * plotH;
          topPts.push(`${x.toFixed(1)},${yTop.toFixed(1)}`);
          botPts.unshift(`${x.toFixed(1)},${yBot.toFixed(1)}`);
          baseline[d] = tVal;
        }
        const dStr = `M ${topPts.join(' L ')} L ${botPts.join(' L ')} Z`;
        svgInner += `<path d="${dStr}" fill="${colors[s % colors.length]}" fill-opacity="0.8" stroke="${colors[s % colors.length]}" stroke-width="1.2"/>`;
      }
    } else if (this.chartType === 'multi-line') {
      for (let s = 0; s < series.length; s++) {
        const pts: string[] = [];
        const circles: string[] = [];
        for (let d = 0; d < displayDates.length; d++) {
          const x = padL + d * colW + colW / 2;
          const val = series[s][d];
          const y = padT + plotH - (val / maxY) * plotH;
          pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          circles.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${colors[s % colors.length]}" stroke="#ffffff" stroke-width="1.5"/>`);
        }
        svgInner += `<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[s % colors.length]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        svgInner += circles.join('');
      }
    } else if (this.chartType === 'cumulative') {
      let runTot = 0;
      const cumVals: number[] = [];
      for (let d = 0; d < displayDates.length; d++) {
        runTot += dailyTotals[d];
        cumVals.push(runTot);
      }
      const maxCum = Math.max(...cumVals, 100);
      const cumMaxY = Math.ceil((maxCum * 1.15) / 1000) * 1000 || 1000;
      const pts: string[] = [];
      const areaPts: string[] = [`${padL},${padT + plotH}`];
      for (let d = 0; d < displayDates.length; d++) {
        const x = padL + d * colW + colW / 2;
        const y = padT + plotH - (cumVals[d] / cumMaxY) * plotH;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        areaPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      const lastX = padL + (displayDates.length - 1) * colW + colW / 2;
      areaPts.push(`${lastX.toFixed(1)},${padT + plotH}`);
      svgInner += `<polygon points="${areaPts.join(' ')}" fill="#2563eb" fill-opacity="0.18"/>`;
      svgInner += `<polyline points="${pts.join(' ')}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/>`;
      for (let d = 0; d < displayDates.length; d++) {
        const x = padL + d * colW + colW / 2;
        const y = padT + plotH - (cumVals[d] / cumMaxY) * plotH;
        svgInner += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>`;
        const cTot = cumVals[d];
        const lbl = cTot >= 1000 ? `${(cTot / 1000).toFixed(1)}k` : `${cTot.toFixed(0)}`;
        svgInner += `<text x="${x.toFixed(1)}" y="${(y - 7).toFixed(1)}" font-family="Arial,sans-serif" font-size="7.5" font-weight="bold" fill="#1e293b" text-anchor="middle">${lbl}</text>`;
      }
    } else {
      const barW = Math.min(32, Math.max(8, colW * 0.6));
      for (let d = 0; d < displayDates.length; d++) {
        const x = padL + d * colW + (colW - barW) / 2;
        let currentY = padT + plotH;
        for (let s = 0; s < series.length; s++) {
          const val = series[s][d];
          if (val <= 0) continue;
          const segH = (val / maxY) * plotH;
          currentY -= segH;
          svgInner += `<rect x="${x}" y="${currentY}" width="${barW}" height="${segH}" fill="${colors[s % colors.length]}" rx="1"/>`;
        }
        if (dailyTotals[d] > 0) {
          const tot = dailyTotals[d];
          const totTxt = tot >= 1000 ? `${(tot / 1000).toFixed(1)}k` : `${tot.toFixed(0)}`;
          svgInner += `<text x="${x + barW / 2}" y="${currentY - 3}" font-family="Arial,sans-serif" font-size="7" font-weight="bold" fill="#334155" text-anchor="middle">${totTxt}</text>`;
        }
      }
    }

    const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" style="display:block">${svgInner}</svg>`;

    const legend = this.chartType === 'cumulative'
      ? `<span class="summary-chart-legend-item"><span class="summary-chart-legend-dot" style="background:#2563eb"></span><span>Cumulative Total Volume</span></span>`
      : categories.map((cat, i) =>
          `<span class="summary-chart-legend-item"><span class="summary-chart-legend-dot" style="background:${colors[i % colors.length]}"></span><span>${cat}</span></span>`
        ).join('');

    return { svg, legend };
  }

  // ---------- single ----------
  addLine() { this.single.lines.push({ description: '', quantity: 1, price: 0 }); }
  removeLine(i: number) { if (this.single.lines.length > 1) this.single.lines.splice(i, 1); }
  resetSingle() { this.single = this.blankInvoice(); this.clearOutput(); }

  async generateSingle() {
    if (!this.single.customerName.trim()) return this.fail('Enter the customer name.');
    if (!this.single.lines.some(l => l.description.trim())) return this.fail('Add at least one item with a description.');
    const pw = this.lockPassword();
    if (pw === null) return;
    this.clearOutput(); this.busy = true;
    try {
      const inv: Invoice = { ...this.single, lines: this.single.lines.filter(l => l.description.trim()) };
      let blob = this.isDesign
        ? await this.renderDesign(`Invoice ${inv.invoiceNo}`, [inv], !!pw, !!pw)
        : await this.render(`Invoice ${inv.invoiceNo}`, this.payload([this.toPrinted(inv, !!pw)], null), !!pw);
      if (pw) blob = await lockPdf(blob, pw);
      const url = URL.createObjectURL(blob);
      this.results = [{ label: `Invoice ${inv.invoiceNo}`, rawUrl: url, fileName: `${inv.invoiceNo}.pdf`, blob, saveName: `Invoice ${inv.invoiceNo}` }];
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.statusMessage = (pw ? 'Invoice generated and locked with your password.' : 'Invoice generated.') + ' Choose a file name below and click “Save to Documents” to keep it.';
    } catch (e: any) { return this.fail(this.errText(e)); }
    this.busy = false;
  }

  // ---------- bulk ----------
  async onFile(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.clearOutput();
    this.invoices = []; this.printedPreview = []; this.errors = []; this.rowCount = 0; this.fileName = file.name;
    try {
      let rows: string[][];
      if (/\.(xlsx|xlsm)$/i.test(file.name)) rows = await readXlsxRows(new Uint8Array(await file.arrayBuffer()));
      else rows = parseCsv(await file.text());
      this.buildInvoices(rows);
    } catch (e: any) {
      this.fileName = '';
      this.fail(e?.message || 'Could not read that file.');
    }
  }

  private buildInvoices(rows: string[][]) {
    if (rows.length < 2) throw new Error('The file needs a header row and at least one data row.');
    if (rows.length > 100001) throw new Error('That file has more than 100,000 rows. Please split it first.');
    const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const header = rows[0].map(norm);
    const col: Record<string, number> = {};
    for (const [key, names] of Object.entries(ALIASES)) {
      const i = header.findIndex(h => names.includes(h));
      if (i >= 0) col[key] = i;
    }
    const missing = ['invoiceNo', 'customerName', 'description', 'quantity', 'price'].filter(k => !(k in col));
    if (missing.length) {
      throw new Error(`Missing column(s): ${missing.join(', ')}. The first row must be a header such as: invoiceNo, customerName, invoiceDate, description, quantity, price.`);
    }

    const num = (s: string) => {
      const n = parseFloat((s ?? '').replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : NaN;
    };
    const fixDate = (s: string) => {
      const t = (s ?? '').trim();
      if (/^\d{5}(\.\d+)?$/.test(t)) {            // Excel serial date
        return new Date(Date.UTC(1899, 11, 30) + Math.floor(parseFloat(t)) * 86400000).toISOString().slice(0, 10);
      }
      return t;
    };

    const map = new Map<string, Invoice>();
    const errors: string[] = [];
    let count = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (k: string) => (k in col ? (row[col[k]] ?? '').trim() : '');
      const no = get('invoiceNo');
      const rowNo = r + 1;
      if (!no) { errors.push(`Row ${rowNo}: invoiceNo is empty.`); continue; }
      const qty = num(get('quantity')), price = num(get('price'));
      if (!get('description')) { errors.push(`Row ${rowNo} (${no}): description is empty.`); continue; }
      if (Number.isNaN(qty) || Number.isNaN(price)) { errors.push(`Row ${rowNo} (${no}): quantity or price is not a number.`); continue; }
      let inv = map.get(no);
      if (!inv) {
        inv = { invoiceNo: no, invoiceDate: fixDate(get('invoiceDate')), customerName: get('customerName') || '(no customer)', customerAddress: get('customerAddress'), secure: get('secure'), lines: [] };
        map.set(no, inv);
      }
      inv.lines.push({ description: get('description'), quantity: qty, price });
      count++;
    }
    this.rowCount = count;
    this.errors = errors;
    this.invoices = [...map.values()];
    this.printedPreview = this.invoices.slice(0, 50).map(i => this.toPrinted(i));
    if (!this.invoices.length) throw new Error('No valid invoice rows were found in the file.');
    this.statusMessage = ''; this.isError = false;
  }

  async generateBulk() {
    if (!this.invoices.length) return;
    const pw = this.lockPassword();
    if (pw === null) return;
    this.clearOutput(); this.busy = true;
    try {
      const designMode = this.isDesign;
      const all = this.invoices.map(i => this.toPrinted(i, !!pw));
      const size = Math.max(1, Math.floor(Number(this.chunkSize) || 200));
      const parts: Printed[][] = [];
      const partsInv: Invoice[][] = [];
      for (let i = 0; i < all.length; i += size) { parts.push(all.slice(i, i + size)); partsInv.push(this.invoices.slice(i, i + size)); }
      const wantSummary = this.includeSummary;
      const separateSummary = wantSummary && (parts.length > 1 || designMode);
      const total = parts.length + (separateSummary ? 1 : 0);
      let done = 0;
      const base = this.fileName.replace(/\.[^.]+$/, '') || 'invoices';

      for (let i = 0; i < parts.length; i++) {
        this.statusMessage = `Rendering PDF ${++done} of ${total}…`;
        const withSummary = wantSummary && !separateSummary;
        const title = parts.length === 1 ? `${base} invoices` : `${base} invoices (part ${i + 1} of ${parts.length})`;
        let blob = designMode
          ? await this.renderDesign(title, partsInv[i], !!pw, !!pw)
          : await this.render(title, this.payload(parts[i], withSummary ? all : null), !!pw);
        if (pw) { this.statusMessage = `Locking PDF ${done} of ${total}…`; blob = await lockPdf(blob, pw); }
        const first = partsInv[i][0].invoiceNo, last = partsInv[i][partsInv[i].length - 1].invoiceNo;
        this.results.push({
          label: parts.length === 1
            ? `${parts[i].length} invoices${withSummary ? ' + consolidated invoice' : ''}`
            : `Part ${i + 1} of ${parts.length}: ${first} → ${last} (${parts[i].length} invoices)`,
          rawUrl: URL.createObjectURL(blob),
          fileName: parts.length === 1 ? `${base}-invoices.pdf` : `${base}-part-${i + 1}.pdf`,
          blob, saveName: parts.length === 1 ? `${base} invoices` : `${base} invoices (part ${i + 1} of ${parts.length})`
        });
      }
      if (separateSummary) {
        this.statusMessage = `Rendering PDF ${++done} of ${total}…`;
        let blob = await this.renderSummaryOnly(`${base} consolidated invoice`, all, !!pw);
        if (pw) blob = await lockPdf(blob, pw);
        this.results.push({ label: `Consolidated invoice (${all.length} invoices)`, rawUrl: URL.createObjectURL(blob), fileName: `${base}-consolidated.pdf`, blob, saveName: `${base} consolidated invoice` });
      }
      this.preview(this.results[0]);
      this.statusMessage = `Done — ${this.results.length} PDF${this.results.length === 1 ? '' : 's'} generated` + (pw ? ' and locked with your password (the viewer will ask for it).' : '.') + ' Choose a file name for each PDF below and click “Save to Documents” to keep it.';
    } catch (e: any) { return this.fail(this.errText(e)); }
    this.busy = false;
  }

  /** Renders a few invoices (the first ones plus the longest) without saving, so you can check overflow before generating everything. */
  async previewSample() {
    this.previewing = true; this.statusMessage = ''; this.isError = false;
    try {
      let sample: Invoice[];
      if (this.mode === 'single') {
        if (!this.single.lines.some(l => l.description.trim())) { this.previewing = false; return this.fail('Add at least one item with a description.'); }
        sample = [{ ...this.single, lines: this.single.lines.filter(l => l.description.trim()) }];
      } else {
        if (!this.invoices.length) { this.previewing = false; return; }
        const longest = this.invoices.reduce((m, i) => (i.lines.length > m.lines.length ? i : m), this.invoices[0]);
        sample = this.invoices.slice(0, PREVIEW_COUNT);
        if (!sample.includes(longest)) sample.push(longest);
      }
      const title = 'Preview';
      const blob = this.isDesign
        ? await this.renderDesign(title, sample, true)
        : await this.render(title, this.payload(sample.map(i => this.toPrinted(i)), null), true);
      if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = URL.createObjectURL(blob);
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewObjectUrl);
      this.statusMessage = this.mode === 'bulk'
        ? `Preview shows ${sample.length} invoice(s), including the longest (${sample.reduce((m, i) => Math.max(m, i.lines.length), 0)} items). Nothing was saved.`
        : 'Preview only — nothing was saved.';
    } catch (e: any) { this.fail(this.errText(e)); }
    this.previewing = false;
  }

  /** Renders EVERY invoice (in parts of "Invoices per PDF") without saving, so the whole file can be checked before generating. */
  async previewAll() {
    if (!this.invoices.length) return;
    const pw = this.lockPassword();
    if (pw === null) return;
    this.clearOutput(); this.previewing = true;
    try {
      const size = Math.max(1, Math.floor(Number(this.chunkSize) || 200));
      const total = Math.ceil(this.invoices.length / size);
      for (let i = 0; i < total; i++) {
        this.statusMessage = `Rendering preview ${i + 1} of ${total}…`;
        const part = this.invoices.slice(i * size, (i + 1) * size);
        let blob = this.isDesign
          ? await this.renderDesign('Preview', part, true, !!pw)
          : await this.render('Preview', this.payload(part.map(x => this.toPrinted(x, !!pw)), null), true);
        if (pw) { this.statusMessage = `Locking preview ${i + 1} of ${total}…`; blob = await lockPdf(blob, pw); }
        this.results.push({
          label: `Preview part ${i + 1} of ${total}: ${part[0].invoiceNo} → ${part[part.length - 1].invoiceNo} (${part.length} invoices)`,
          rawUrl: URL.createObjectURL(blob),
          fileName: `preview-part-${i + 1}.pdf`
        });
        if (i === 0) this.preview(this.results[0]);
      }
      this.statusMessage = `Preview ready: all ${this.invoices.length} invoices in ${total} part(s). Nothing was saved.` + (pw ? ' Locked with your password.' : '');
    } catch (e: any) { this.fail(this.errText(e)); }
    this.previewing = false;
  }

  preview(r: Result) { this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(r.rawUrl); }

  resetBulk() {
    this.clearOutput();
    this.fileName = ''; this.rowCount = 0; this.invoices = []; this.printedPreview = []; this.errors = [];
  }

  downloadSample() {
    const csv = [
      'invoiceNo,customerName,customerAddress,invoiceDate,description,quantity,price',
      'INV-001,Ravi Stores,"12 Main Road, Salem",2026-10-01,Rice 25kg,2,1450',
      'INV-001,Ravi Stores,"12 Main Road, Salem",2026-10-01,Oil 5L,1,780',
      'INV-002,Lakshmi Traders,"4 Market St, Trichy",2026-10-02,Sugar 50kg,1,2100',
      'INV-003,Ravi Stores,"12 Main Road, Salem",2026-10-03,Dal 10kg,3,950'
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'sample-bills.csv'; a.click();
    URL.revokeObjectURL(url);
  }
}