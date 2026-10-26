import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { describeSeal, ensureUserKey, findSealed, open, KeyPair } from '../design-editor/field-crypto';

interface Item { sealed: string; info: ReturnType<typeof describeSeal>; value?: string; error?: string; busy?: boolean; }

@Component({
  selector: 'app-unlock',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="wrap">
      <h2>Unlock protected values</h2>
      <p class="sub">Open a PDF made in the Editor, or paste sealed text. Without the right passphrase or key you only see the masked value on the page.</p>

      <div class="card">
        <h3>1. Load the sealed values</h3>
        <input type="file" accept="application/pdf,.pdf" (change)="onFile($any($event.target).files?.[0])">
        <textarea rows="3" [(ngModel)]="pasted" (ngModelChange)="onPaste()" placeholder="...or paste sealed text (PSENC2.…)"></textarea>
        <p class="msg" *ngIf="status">{{ status }}</p>
      </div>

      <div class="card">
        <h3>2. Who are you?</h3>
        <label>Passphrase</label>
        <input type="password" autocomplete="off" [(ngModel)]="pass" placeholder="If the value was sealed with a passphrase">
        <label>Signed in as</label>
        <div class="me">{{ email }} <span class="muted">(your account key is used automatically)</span></div>
        <label>Another private key (optional)</label>
        <textarea rows="2" [(ngModel)]="extraKey" placeholder="PSKEY1.…"></textarea>
        <details>
          <summary>My keys</summary>
          <p class="muted">Share your public key so others can seal values for you. Keep the private key safe: it only exists in this browser, and clearing site data loses it.</p>
          <label>My public key</label>
          <textarea rows="2" readonly [value]="mine?.pub ?? ''"></textarea>
          <label>My private key (backup)</label>
          <textarea rows="2" readonly [value]="mine?.priv ?? ''"></textarea>
        </details>
      </div>

      <div class="card" *ngFor="let it of items; let i = index">
        <div class="who">
          <b>Sealed value {{ i + 1 }}</b>
          <span class="muted">Opens with: {{ opensWith(it) }}</span>
        </div>
        <button class="go" (click)="unlock(it)" [disabled]="it.busy">{{ it.busy ? 'Unlocking…' : 'Unlock' }}</button>
        <div class="ok" *ngIf="it.value !== undefined">{{ it.value }}</div>
        <div class="bad" *ngIf="it.error">{{ it.error }}</div>
      </div>
    </div>
  `,
  styles: [`
    .wrap { max-width: 720px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
    h2 { margin: 0; } .sub, .muted { color: var(--text-muted); font-size: 0.85rem; margin: 0; }
    .card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .card h3 { margin: 0; font-size: 1rem; }
    label { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); margin-top: 0.3rem; }
    input[type=password], textarea { width: 100%; padding: 0.5rem 0.6rem; font: inherit; font-size: 0.85rem; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 8px; }
    textarea { font-family: var(--font-mono); font-size: 0.72rem; resize: vertical; }
    .me { font-size: 0.9rem; } .msg { margin: 0; font-size: 0.85rem; }
    .who { display: flex; flex-direction: column; gap: 0.15rem; }
    .go { align-self: flex-start; padding: 0.5rem 1.1rem; border-radius: 8px; border: 0; background: var(--primary); color: #fff; font-weight: 600; }
    .ok { padding: 0.7rem; border-radius: 8px; background: #dcfce7; color: #14532d; font-weight: 700; font-size: 1.05rem; word-break: break-all; }
    .bad { padding: 0.6rem; border-radius: 8px; background: #fee2e2; color: #7f1d1d; font-size: 0.85rem; }
    summary { cursor: pointer; font-size: 0.85rem; font-weight: 600; }
  `]
})
export class UnlockComponent implements OnInit {
  items: Item[] = [];
  pasted = ''; pass = ''; extraKey = ''; status = '';
  mine: KeyPair | null = null;

  constructor(private auth: AuthService) {}

  get email(): string { return this.auth.getSession()?.email ?? 'not signed in'; }
  private get userId(): string { return this.auth.getSession()?.userId ?? 'anon'; }

  async ngOnInit(): Promise<void> { try { this.mine = await ensureUserKey(this.userId); } catch { /* insecure page */ } }

  opensWith(it: Item): string {
    const parts: string[] = [];
    if (it.info.pass) parts.push('a passphrase');
    if (it.info.recipients.length) parts.push(it.info.recipients.map(r => r.label).join(', '));
    return parts.join(' or ') || 'unknown';
  }

  private setSealed(list: string[]): void {
    this.items = list.map(s => ({ sealed: s, info: describeSeal(s) }));
    this.status = list.length ? list.length + ' sealed value(s) found.' : 'No sealed values found.';
  }

  onPaste(): void {
    const t = this.pasted.replace(/\s+/g, '');
    const list = findSealed(t.includes('PSSEAL[') ? t : 'PSSEAL[' + t + ']');
    this.setSealed(list);
  }

  async onFile(file?: File): Promise<void> {
    if (!file) return;
    this.status = 'Reading PDF…';
    try {
      const pdfjs: any = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.js';
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      let text = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const c = await (await pdf.getPage(p)).getTextContent();
        text += c.items.map((i: any) => i.str).join('') + ' ';
      }
      this.setSealed(findSealed(text));
      if (!this.items.length) this.status = 'This PDF has no sealed values (they are embedded only when a page uses the field).';
    } catch { this.status = 'Could not read this PDF.'; }
  }

  async unlock(it: Item): Promise<void> {
    it.busy = true; it.error = ''; it.value = undefined;
    try {
      const keys = [this.mine?.priv, this.extraKey.trim()].filter((k): k is string => !!k);
      it.value = await open(it.sealed, { pass: this.pass, privateKeys: keys });
    } catch (e: any) { it.error = e?.message || 'Access denied.'; }
    finally { it.busy = false; }
  }
}
