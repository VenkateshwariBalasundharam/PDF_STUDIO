import { Injectable } from '@angular/core';
import { BILL_TEMPLATE } from '../../components/bill-generator/bill-template';
import { BILL_FORMATS } from '../../components/bill-generator/bill-formats';
import { Doc } from '../../components/design-editor/design-model';

export interface BillTemplate {
  id: string;
  name: string;
  description: string;
  htmlContent: string;
  defaultPageSize: string;
  defaultOrientation: string;
  builtIn?: boolean;
  /** 'design' = made in the Editor and saved with "Save to Templates" (htmlContent is empty, design holds the layout). */
  kind?: 'html' | 'design';
  design?: Doc;
}

export const BUILTIN_INVOICE_ID = 'builtin-invoice';
const KEY = 'pdfstudio.billTemplates.v1';

/** Templates the user creates in the Templates page. Kept in this browser (localStorage). */
@Injectable({ providedIn: 'root' })
export class BillTemplateStore {
  private builtIn(): BillTemplate {
    return {
      id: BUILTIN_INVOICE_ID,
      name: 'Standard Invoice (built-in)',
      description: 'Invoices with items table, tax and totals, plus a consolidated invoice section.',
      htmlContent: BILL_TEMPLATE,
      defaultPageSize: 'A4',
      defaultOrientation: 'Portrait',
      builtIn: true
    };
  }

  private readSaved(): BillTemplate[] {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private writeSaved(list: BillTemplate[]): boolean {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; /* storage full or blocked */ }
  }

  /** Ready-made formats (they cannot be changed; "Save as my template" makes an editable copy). */
  private formats(): BillTemplate[] {
    return BILL_FORMATS.map(f => ({
      id: f.id, name: f.name, description: f.description, htmlContent: f.html,
      defaultPageSize: f.pageSize, defaultOrientation: f.orientation, builtIn: true
    }));
  }

  isBuiltIn(id: string): boolean { return id === BUILTIN_INVOICE_ID || BILL_FORMATS.some(f => f.id === id); }

  /** Built-in formats first, then the user's own. */
  list(): BillTemplate[] { return [this.builtIn(), ...this.formats(), ...this.readSaved()]; }

  /** The user's own templates only (for export). */
  mine(): BillTemplate[] { return this.readSaved(); }

  /** Adds templates from an exported file. Returns how many were added, or -1 if the browser storage is full. */
  importMany(items: BillTemplate[]): number {
    const saved = this.readSaved();
    let added = 0;
    for (const t of items) {
      if (!t || typeof t.name !== 'string' || (t.kind !== 'design' && typeof t.htmlContent !== 'string')) continue;
      saved.push({ ...t, id: this.newId(), builtIn: false });
      added++;
    }
    return this.writeSaved(saved) ? added : -1;
  }

  get(id: string): BillTemplate | undefined { return this.list().find(t => t.id === id); }

  newId(): string { return 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /** Returns the saved template, or null when the browser storage is full or blocked. */
  save(t: BillTemplate): BillTemplate | null {
    const saved = this.readSaved();
    const copy: BillTemplate = { ...t, builtIn: false };
    const i = saved.findIndex(x => x.id === copy.id);
    if (i >= 0) saved[i] = copy; else saved.push(copy);
    return this.writeSaved(saved) ? copy : null;
  }

  remove(id: string): void { this.writeSaved(this.readSaved().filter(t => t.id !== id)); }
}
