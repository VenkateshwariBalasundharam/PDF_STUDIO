import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { TemplateDto } from '../../core/models/api.models';
import { BillTemplateStore, BillTemplate, BUILTIN_INVOICE_ID } from '../../core/services/bill-template.store';
import { BILL_TEMPLATE, BILL_TAG_HELP, sampleBillData, prepareBillHtml, keepAddressBreaks, billTemplateProblem } from '../bill-generator/bill-template';
import { Doc } from '../design-editor/design-model';
import { designCss, designPagesHtml, designItemRows } from '../design-editor/design-render';
import { getDesignForTemplate } from '../design-editor/builtin-designs';

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="templates-container">
      <div class="header">
        <div>
          <h2>Template Management</h2>
          <p style="color: var(--text-muted); font-size: 0.875rem;">
            Create invoice / bill templates here, or design one visually in the <b>Editor</b> and click <b>Save to Templates</b>. Use them in <b>PDF Generator &rarr; Bills &amp; Invoices</b> with a single invoice or an uploaded file.
          </p>
        </div>
        <div class="header-actions">
          <button class="btn-secondary" (click)="exportMine()" title="Download your own templates as a file you can back up or move to another browser">Export mine</button>
          <label class="btn-secondary">Import<input type="file" accept=".json,application/json" (change)="importFile($event)" hidden></label>
          <button class="btn-secondary" (click)="editTemplateInEditor()" title="Open and edit template in visual Editor">Edit template in editor</button>
          <button class="btn-primary" (click)="newTemplate()">+ New Template</button>
        </div>
      </div>

      <div class="split-view">
        <!-- List Pane -->
        <div class="card list-pane">
          <div class="list-pane-header">
            <h3>My Templates</h3>
            <span class="count-badge">{{ filteredTemplates.length }}</span>
          </div>

          <!-- Search Bar with Search Button -->
          <div class="search-bar">
            <div class="search-input-wrap">
              <input type="text"
                     [(ngModel)]="searchQuery"
                     (input)="onSearchChange()"
                     (keyup.enter)="applySearch()"
                     placeholder="Search templates..."
                     class="search-input" />
              <button type="button" class="btn-clear" *ngIf="searchQuery" (click)="clearSearch()" title="Clear search">✕</button>
            </div>
            <button type="button" class="btn-search" (click)="applySearch()">Search</button>
          </div>

          <!-- Templates List (Small / Compact size, 10 per page) -->
          <div class="templates-list">
            <div *ngFor="let t of pagedTemplates"
                 class="template-item compact"
                 [class.active]="selectedTemplate?.id === t.id"
                 (click)="selectTemplate(t)">
              <div class="template-item-top">
                <strong class="template-title" [title]="t.name">{{ t.name }}</strong>
                <span class="badge badge-info badge-sm">{{ t.kind === 'design' ? 'design' : (t.builtIn ? 'built-in' : 'mine') }}</span>
              </div>
              <p class="template-desc" [title]="t.description || ''">
                {{ t.description || 'No description provided' }}
              </p>
              <div class="template-meta">
                <span>{{ t.defaultPageSize }} &bull; {{ t.defaultOrientation }}</span>
              </div>
            </div>

            <div *ngIf="filteredTemplates.length === 0" class="empty-state">
              No templates found matching "{{ activeSearch || searchQuery }}"
            </div>
          </div>

          <!-- Pagination Bar (10 per page) -->
          <div class="pagination-bar" *ngIf="filteredTemplates.length > pageSize">
            <button type="button" class="btn-page" (click)="prevPage()" [disabled]="currentPage === 1">‹ Prev</button>
            <span class="page-info">Page {{ currentPage }} / {{ totalPages }}</span>
            <button type="button" class="btn-page" (click)="nextPage()" [disabled]="currentPage >= totalPages">Next ›</button>
          </div>

          <ng-container *ngIf="serverTemplates.length">
            <h4 style="margin: 1rem 0 0.4rem; font-size: 0.85rem; color: var(--text-muted);">Other templates</h4>
            <div *ngFor="let t of serverTemplates"
                 class="template-item compact"
                 [class.active]="selectedTemplate?.id === t.id"
                 (click)="selectTemplate(t)">
              <div class="template-item-top">
                <strong class="template-title" [title]="t.name">{{ t.name }}</strong>
                <span class="badge badge-info badge-sm">v{{ t.currentVersion }}</span>
              </div>
              <p class="template-desc" [title]="t.description || ''">
                {{ t.description || 'No description provided' }}
              </p>
            </div>
          </ng-container>
        </div>

        <!-- Designer / Editor Pane -->
        <div class="card editor-pane">
          <div *ngIf="selectedTemplate" class="editor-content">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap;">
              <h3>{{ isMine(selectedTemplate) ? 'Editing' : 'Viewing' }}: {{ selectedTemplate.name }}</h3>
              <div style="display:flex; gap:.5rem; align-items:center; flex-shrink: 0;">
                <button class="btn-secondary" (click)="previewSample()" [disabled]="previewing">{{ previewing ? 'Rendering...' : 'Preview with sample data' }}</button>
                <button class="btn-secondary" *ngIf="isMine(selectedTemplate)" (click)="deleteTemplate()">Delete</button>
                <button class="btn-primary" (click)="saveTemplate()">{{ isMine(selectedTemplate) ? 'Save template' : 'Save as my template' }}</button>
              </div>
            </div>
            <p *ngIf="!isMine(selectedTemplate)" class="hint">This one can't be changed directly. Edit it and click <b>Save as my template</b> to keep your own copy.</p>

            <div class="form-group">
              <label>Template Name</label>
              <input type="text" [(ngModel)]="selectedTemplate.name">
            </div>

            <div class="form-group">
              <label>Description</label>
              <input type="text" [(ngModel)]="selectedTemplate.description">
            </div>

            <div *ngIf="selectedDesign" class="design-box">
              <b>Designed in the Editor</b> · {{ selectedDesign.size }} {{ selectedDesign.orientation }} · {{ selectedDesign.pages.length }} page(s) ·
              {{ selectedDesign.fields?.length || 0 }} data field(s) · {{ itemRows }} line-item row(s)
              <p class="hint" style="margin-top:.35rem">In Bills &amp; Invoices each invoice fills this design on its own page. Fields named <code>invoiceNo</code>, <code>invoiceDate</code>, <code>billName</code>, <code>billAddress</code>, <code>subtotal</code>, <code>tax</code>, <code>taxRate</code>, <code>total</code> and <code>item1Description</code>, <code>item1Quantity</code>, <code>item1Price</code>, <code>item1Amount</code> (then item2…) are filled from your data.</p>
              <button type="button" class="btn-secondary" (click)="openInEditor()">Open in Editor to change the layout</button>
            </div>

            <div class="grid-2" *ngIf="!selectedDesign">
              <div class="form-group">
                <label>Page Size</label>
                <select [(ngModel)]="selectedTemplate.defaultPageSize">
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                </select>
              </div>
              <div class="form-group">
                <label>Orientation</label>
                <select [(ngModel)]="selectedTemplate.defaultOrientation">
                  <option value="Portrait">Portrait</option>
                  <option value="Landscape">Landscape</option>
                </select>
              </div>
            </div>

            <div class="form-group" *ngIf="!selectedDesign">
              <label>HTML / Mustache Template Content</label>
              <textarea [(ngModel)]="selectedTemplate.htmlContent" rows="14" class="mono"></textarea>
            </div>

            <details class="tags" *ngIf="!selectedDesign">
              <summary>Tags you can use in an invoice template</summary>
              <div *ngFor="let h of tagHelp" class="tag-row"><code>{{ h.tag }}</code><span>{{ h.text }}</span></div>
              <button type="button" class="btn-secondary" style="margin-top:.5rem" (click)="resetToStarter()">Replace content with the starter invoice</button>
            </details>

            <div *ngIf="saveNotice" class="badge badge-success" style="padding: 0.5rem; text-align: center;">
              {{ saveNotice }}
            </div>
            <div *ngIf="errorNotice" class="err">{{ errorNotice }}</div>

            <iframe *ngIf="previewUrl" [src]="previewUrl" class="preview-iframe"></iframe>
          </div>

          <div *ngIf="!selectedTemplate" class="placeholder">
            Select a template from the left or create a new one to begin editing.
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .split-view {
      display: grid;
      grid-template-columns: minmax(260px, 350px) minmax(0, 1fr);
      gap: 1.5rem;
    }
    @media (max-width: 1000px) {
      .split-view { grid-template-columns: minmax(0, 1fr); }
    }
    .list-pane-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.65rem;
    }
    .list-pane-header h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }
    .count-badge {
      font-size: 0.72rem;
      background: var(--bg-hover);
      color: var(--text-muted);
      padding: 0.12rem 0.45rem;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      font-weight: 600;
    }
    .search-bar {
      display: flex;
      gap: 0.35rem;
      margin-bottom: 0.65rem;
    }
    .search-input-wrap {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
    }
    .search-input {
      width: 100%;
      font-size: 0.78rem;
      padding: 0.3rem 1.4rem 0.3rem 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-color, #fff);
      color: var(--text-color);
      outline: none;
    }
    .search-input:focus {
      border-color: var(--primary);
    }
    .btn-clear {
      position: absolute;
      right: 5px;
      background: none;
      border: none;
      font-size: 0.7rem;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px 4px;
      line-height: 1;
    }
    .btn-search {
      padding: 0.3rem 0.65rem;
      font-size: 0.76rem;
      font-weight: 500;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-search:hover {
      opacity: 0.9;
    }
    .template-item.compact {
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--border-color);
      border-radius: 5px;
      margin-bottom: 0.35rem;
      cursor: pointer;
      transition: all 0.12s ease-in-out;
    }
    .template-item.compact:hover, .template-item.compact.active {
      border-color: var(--primary);
      background: var(--bg-hover);
    }
    .template-item-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.4rem;
    }
    .template-title {
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-color);
    }
    .badge-sm {
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .template-desc {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin: 0.15rem 0 0.25rem 0;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .template-meta {
      font-size: 0.68rem;
      color: var(--text-muted);
    }
    .empty-state {
      padding: 1rem;
      text-align: center;
      font-size: 0.78rem;
      color: var(--text-muted);
      border: 1px dashed var(--border-color);
      border-radius: 5px;
      margin-top: 0.5rem;
    }
    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.5rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-color);
      font-size: 0.74rem;
    }
    .btn-page {
      padding: 0.2rem 0.55rem;
      font-size: 0.72rem;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      background: var(--bg-card, #fff);
      color: var(--text-color);
      cursor: pointer;
    }
    .btn-page:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .btn-page:not(:disabled):hover {
      border-color: var(--primary);
      color: var(--primary);
    }
    .page-info {
      color: var(--text-muted);
      font-size: 0.72rem;
    }
    .editor-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .form-group label {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
    }
    .placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 400px;
      color: var(--text-muted);
    }
    .hint { font-size: .8rem; color: var(--text-muted); margin: 0; }
    .design-box { border: 1px solid var(--border-color); border-radius: 6px; padding: .75rem; font-size: .85rem; }
    .err { color: #dc2626; font-size: .85rem; }
    .tags { font-size: .8rem; border: 1px solid var(--border-color); border-radius: 6px; padding: .5rem .75rem; }
    .tags summary { cursor: pointer; font-weight: 500; }
    .tag-row { display: flex; flex-direction: column; margin-top: .5rem; }
    .tag-row code { word-break: break-all; }
    .tag-row span { color: var(--text-muted); }
    .preview-iframe { width: 100%; height: 520px; border: 1px solid var(--border-color); border-radius: 6px; }
  `]
})
export class TemplatesComponent implements OnInit {
  builtinId = BUILTIN_INVOICE_ID;
  tagHelp = BILL_TAG_HELP;
  myTemplates: BillTemplate[] = [];
  serverTemplates: TemplateDto[] = [];
  selectedTemplate: TemplateDto | null = null;
  selectedDesign: Doc | null = null;
  itemRows = 0;
  saveNotice = '';
  errorNotice = '';
  previewing = false;
  previewUrl: SafeResourceUrl | null = null;
  private lastBlobUrl: string | null = null;

  // Search & Pagination (10 per page)
  searchQuery = '';
  activeSearch = '';
  currentPage = 1;
  pageSize = 10;

  get filteredTemplates(): BillTemplate[] {
    const q = this.activeSearch.trim().toLowerCase();
    if (!q) return this.myTemplates;
    return this.myTemplates.filter(t =>
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredTemplates.length / this.pageSize));
  }

  get pagedTemplates(): BillTemplate[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTemplates.slice(start, start + this.pageSize);
  }

  applySearch(): void {
    this.activeSearch = this.searchQuery;
    this.currentPage = 1;
  }

  onSearchChange(): void {
    if (!this.searchQuery.trim() && this.activeSearch) {
      this.activeSearch = '';
      this.currentPage = 1;
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.activeSearch = '';
    this.currentPage = 1;
  }

  prevPage(): void {
    if (this.currentPage > 1) this.currentPage--;
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) this.currentPage++;
  }

  constructor(private api: ApiService, private store: BillTemplateStore, private sanitizer: DomSanitizer, private router: Router) {}

  ngOnInit(): void {
    this.refreshMine();
    this.selectTemplate(this.myTemplates[0]);
    this.api.getTemplates().subscribe({
      next: t => { this.serverTemplates = Array.isArray(t) ? t : []; },
      error: () => { this.serverTemplates = []; }
    });
  }

  exportMine(): void {
    const mine = this.store.mine();
    if (!mine.length) { this.errorNotice = 'You have no templates of your own to export yet. Use "Save as my template" first.'; return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'PDFStudio', templates: mine }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'pdfstudio-templates.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data?.templates;
      if (!Array.isArray(list)) throw new Error('bad');
      const n = this.store.importMany(list);
      if (n < 0) { this.errorNotice = 'Could not import: this browser has no room left. Delete a template and try again.'; return; }
      if (n === 0) { this.errorNotice = 'No usable templates were found in that file.'; return; }
      this.refreshMine();
      this.saveNotice = `${n} template(s) imported. They appear in Bills & Invoices too.`;
      setTimeout(() => this.saveNotice = '', 4000);
    } catch { this.errorNotice = 'That file is not a PDFStudio templates export.'; }
  }

  private refreshMine(): void { this.myTemplates = this.store.list(); }

  private toDto(t: BillTemplate): TemplateDto {
    return {
      id: t.id, tenantId: 'local', name: t.name, description: t.description, engine: 'Mustache',
      htmlContent: t.htmlContent, defaultOrientation: t.defaultOrientation, defaultPageSize: t.defaultPageSize,
      currentVersion: 1, isActive: true
    };
  }

  isMine(t: TemplateDto): boolean { return !this.store.isBuiltIn(t.id) && this.myTemplates.some(m => m.id === t.id); }

  selectTemplate(t: BillTemplate | TemplateDto): void {
    this.selectedTemplate = 'engine' in t ? { ...t } : this.toDto(t);
    const design = !('engine' in t) && t.kind === 'design' && t.design ? (JSON.parse(JSON.stringify(t.design)) as Doc) : null;
    this.selectedDesign = design;
    this.itemRows = design ? designItemRows(design) : 0;
    this.saveNotice = ''; this.errorNotice = ''; this.clearPreview();
  }

  editTemplateInEditor(): void {
    let designToOpen = this.selectedDesign;
    if (!designToOpen && this.selectedTemplate) {
      designToOpen = getDesignForTemplate({
        id: this.selectedTemplate.id,
        name: this.selectedTemplate.name,
        defaultPageSize: this.selectedTemplate.defaultPageSize,
        defaultOrientation: this.selectedTemplate.defaultOrientation
      });
    }
    if (designToOpen) {
      try {
        localStorage.setItem('pdfstudio-design-v1', JSON.stringify(designToOpen));
        // Remember the template's own HTML so the Editor's "HTML code editor" button opens exactly this template's code.
        const t = this.selectedTemplate;
        const isHtml = !this.selectedDesign && !!t && !!t.htmlContent;
        localStorage.setItem('pdfstudio-code-handoff', JSON.stringify({
          title: designToOpen.title,
          html: isHtml ? keepAddressBreaks(prepareBillHtml(t!.htmlContent)) : '',
          dataJson: isHtml ? JSON.stringify(sampleBillData(), null, 2) : '',
          pageSize: t?.defaultPageSize || designToOpen.size, orientation: t?.defaultOrientation || designToOpen.orientation
        }));
      } catch {
        this.errorNotice = 'Could not hand the design to the Editor (browser storage is full).';
        return;
      }
      void this.router.navigate(['/editor']);
    } else {
      void this.router.navigate(['/editor']);
    }
  }

  newTemplate(): void {
    this.selectedTemplate = {
      id: '', tenantId: 'local', name: 'My Invoice Template', description: 'Custom invoice template',
      engine: 'Mustache', htmlContent: BILL_TEMPLATE, defaultOrientation: 'Portrait', defaultPageSize: 'A4',
      currentVersion: 1, isActive: true
    };
    this.selectedDesign = null; this.itemRows = 0;
    this.saveNotice = ''; this.errorNotice = ''; this.clearPreview();
  }

  resetToStarter(): void { if (this.selectedTemplate) this.selectedTemplate.htmlContent = BILL_TEMPLATE; }

  saveTemplate(): void {
    const t = this.selectedTemplate;
    if (!t) return;
    this.errorNotice = '';
    if (!t.name.trim()) { this.errorNotice = 'Give the template a name.'; return; }
    if (!this.selectedDesign) {
      const problem = billTemplateProblem(t.htmlContent);
      if (problem) { this.errorNotice = problem; return; }
    }
    const keepId = this.isMine(t) ? t.id : this.store.newId();
    const saved = this.store.save(this.selectedDesign
      ? { id: keepId, name: t.name.trim(), description: t.description ?? '', htmlContent: '', kind: 'design', design: this.selectedDesign,
          defaultPageSize: this.selectedDesign.size, defaultOrientation: this.selectedDesign.orientation }
      : { id: keepId, name: t.name.trim(), description: t.description ?? '', htmlContent: t.htmlContent,
          defaultPageSize: t.defaultPageSize, defaultOrientation: t.defaultOrientation });
    if (!saved) { this.errorNotice = 'Could not save: this browser has no room left. Delete a template and try again.'; return; }
    this.refreshMine();
    this.selectTemplate(saved);
    this.saveNotice = 'Saved. It now appears in Generate → Bills & Invoices.';
    setTimeout(() => this.saveNotice = '', 4000);
  }

  openInEditor(): void {
    if (!this.selectedDesign) return;
    try { localStorage.setItem('pdfstudio-design-v1', JSON.stringify(this.selectedDesign)); } catch { this.errorNotice = 'Could not hand the design to the Editor (browser storage is full).'; return; }
    void this.router.navigate(['/editor']);
  }

  deleteTemplate(): void {
    const t = this.selectedTemplate;
    if (!t || !this.isMine(t)) return;
    if (!confirm(`Delete "${t.name}"?`)) return;
    this.store.remove(t.id);
    this.refreshMine();
    this.selectTemplate(this.myTemplates[0]);
  }

  async previewSample(): Promise<void> {
    const t = this.selectedTemplate;
    if (!t) return;
    this.errorNotice = ''; this.previewing = true;
    try {
      const d = this.selectedDesign;
      const blob = await firstValueFrom(this.api.generatePdf(d
        ? { title: 'Template preview', htmlContent: designCss(d) + designPagesHtml(d, d.fields ?? []).replace(/\{\{/g, '&#123;&#123;'),
            pageSize: d.size, orientation: d.orientation, marginTopMm: 0, marginBottomMm: 0, marginLeftMm: 0, marginRightMm: 0, printBackground: true, doNotSave: true }
        : { title: 'Template preview', htmlContent: prepareBillHtml(t.htmlContent), templateData: sampleBillData(),
            pageSize: t.defaultPageSize, orientation: t.defaultOrientation, printBackground: true, doNotSave: true })) as Blob;
      this.clearPreview();
      this.lastBlobUrl = URL.createObjectURL(blob);
      this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.lastBlobUrl);
    } catch (e: any) {
      this.errorNotice = e?.error?.message || 'Could not render the preview. Is the Public API running on port 5000?';
    }
    this.previewing = false;
  }

  private clearPreview(): void {
    if (this.lastBlobUrl) URL.revokeObjectURL(this.lastBlobUrl);
    this.lastBlobUrl = null; this.previewUrl = null;
  }
}
