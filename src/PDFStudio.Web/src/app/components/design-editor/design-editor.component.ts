import { Component, ElementRef, HostListener, OnDestroy, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { designCss, designPagesHtml } from './design-render';
import { prettyHtml } from '../editor/pretty-html';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ApiService } from '../../core/services/api.service';
import { El, ElType, Page, Field, FieldType, Doc, PAGE_PX, uid, esc } from './design-model';
import { barcodeSvg, qrSvg } from './design-codes';
import { boxCss, extraHtml, EXTRA_TYPES } from './design-extras';
import { TEMPLATES, TplDef, TplOpts, TplResult, TPL_CATEGORIES, logoEls } from './design-templates';
import { ocrImage, OCR_LANGS } from './image-ocr';
import { lockPdf } from './pdf-lock';
import { seal, open as openSeal, describeSeal, maskValue, ensureUserKey, keyId, SEAL_OPEN, SEAL_CLOSE } from './field-crypto';
import { AuthService } from '../../core/services/auth.service';
import { BillTemplateStore } from '../../core/services/bill-template.store';
import { importFile, isPdf, isDesignJson, OPEN_ACCEPT, SUPPORTED_LABEL, PdfMode } from './file-import';

const FIELD_TYPES: { v: FieldType; label: string }[] = [
  { v: 'text', label: 'Text' }, { v: 'number', label: 'Number' }, { v: 'currency', label: 'Currency' },
  { v: 'percent', label: 'Percentage' }, { v: 'date', label: 'Date' }, { v: 'boolean', label: 'Yes / No' },
  { v: 'encrypted', label: 'Encrypted' }
];
const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'AED', 'SGD'];
const LOCALES = [
  { v: 'en-US', label: 'English (US) 1,234.50' }, { v: 'en-IN', label: 'English (India) 1,23,456.50' },
  { v: 'en-GB', label: 'English (UK) 1,234.50' }, { v: 'de-DE', label: 'German 1.234,50' }, { v: 'fr-FR', label: 'French 1 234,50' }
];
const DATE_FORMATS = ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd MMM yyyy', 'MMMM d, yyyy'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const FONTS: { name: string; stack: string }[] = [
  { name: 'Arial', stack: "Arial, Helvetica, sans-serif" },
  { name: 'Verdana', stack: "Verdana, Geneva, sans-serif" },
  { name: 'Tahoma', stack: "Tahoma, Geneva, sans-serif" },
  { name: 'Trebuchet MS', stack: "'Trebuchet MS', Helvetica, sans-serif" },
  { name: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { name: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { name: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { name: 'Impact', stack: "Impact, Haettenschweiler, sans-serif" }
];

const HANDLES = [
  { k: 'nw', l: 0, t: 0, c: 'nwse-resize' }, { k: 'n', l: 50, t: 0, c: 'ns-resize' }, { k: 'ne', l: 100, t: 0, c: 'nesw-resize' },
  { k: 'e', l: 100, t: 50, c: 'ew-resize' }, { k: 'se', l: 100, t: 100, c: 'nwse-resize' }, { k: 's', l: 50, t: 100, c: 'ns-resize' },
  { k: 'sw', l: 0, t: 100, c: 'nesw-resize' }, { k: 'w', l: 0, t: 50, c: 'ew-resize' }
];

@Component({
  selector: 'app-design-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
  <div class="studio" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
    <!-- Top toolbar -->
    <header class="bar">
      <input class="title-input" [(ngModel)]="doc.title" (ngModelChange)="changed()" aria-label="Design title" placeholder="Untitled design">
      <div class="grp">
        <button type="button" class="ib" (click)="undo()" [disabled]="!canUndo" title="Undo (Ctrl+Z)" aria-label="Undo">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>
        </button>
        <button type="button" class="ib" (click)="redo()" [disabled]="!canRedo" title="Redo (Ctrl+Y)" aria-label="Redo">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>
        </button>
      </div>
      <div class="grp zoom" title="Scroll mouse wheel over canvas to zoom. Space+drag or middle-click to pan.">
        <button type="button" class="ib" (click)="zoomBy(-0.1)" aria-label="Zoom out">−</button>
        <span>{{ zoom * 100 | number:'1.0-0' }}%</span>
        <button type="button" class="ib" (click)="zoomBy(0.1)" aria-label="Zoom in">+</button>
        <button type="button" class="txt" (click)="fit()" title="Fit canvas to view">Fit</button>
        <button type="button" class="txt" (click)="resetZoom()" title="Reset to 100%">1:1</button>
      </div>
      <div class="spacer"></div>
      <button type="button" class="btn-secondary lnk" (click)="openCodeEditor()">&lt;/&gt; HTML code editor</button>
      <button type="button" class="btn-secondary" (click)="exportJson()">Save file</button>
      <button type="button" class="btn-secondary" (click)="saveToTemplates()" title="Keep this design on the Templates page so Bills &amp; Invoices can use it">Save to Templates</button>
      <label class="btn-secondary lbl" [title]="supportedLabel" [class.disabled]="openBusy">{{ openBusy ? 'Opening...' : 'Open file' }}<input type="file" [accept]="openAccept" hidden [disabled]="openBusy" (change)="openFile($event)"></label>
      <button type="button" class="btn-primary dl" (click)="downloadPdf()" [disabled]="busy">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16"/></svg>
        {{ busy ? 'Generating...' : 'Download PDF' }}
      </button>
    </header>

    <div class="msg" *ngIf="message" [class.error]="isError">{{ message }}</div>

    <div class="body" [style.--lw]="leftW + 'px'" [style.--rw]="rightW + 'px'">
      <!-- Left: elements -->
      <aside class="side left">
        <div class="side-tabs">
          <button type="button" [class.active]="leftTab === 'elements'" (click)="leftTab = 'elements'">Elements</button>
          <button type="button" [class.active]="leftTab === 'data'" (click)="leftTab = 'data'">Data</button>
          <button type="button" [class.active]="leftTab === 'templates'" (click)="leftTab = 'templates'">Templates</button>
        </div>

        <div class="side-scroll" *ngIf="leftTab === 'elements'">
          <h4>Text</h4>
          <button type="button" class="tool big" (click)="addText('heading')">Add a heading</button>
          <button type="button" class="tool mid" (click)="addText('sub')">Add a subheading</button>
          <button type="button" class="tool" (click)="addText('body')">Add body text</button>

          <h4>Image</h4>
          <label class="tool upload">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>
            Upload image
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden (change)="uploadImage($event)">
          </label>
          <h4>Codes</h4>
          <div class="grid2">
            <button type="button" class="tool" (click)="addCode('barcode')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5v14M8 5v14M12 5v14M16 5v14M20 5v14" stroke-width="1.6"/></svg>
              Barcode
            </button>
            <button type="button" class="tool" (click)="addCode('qr')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7M14 21h3"/></svg>
              QR code
            </button>
          </div>

          <h4>Shapes &amp; lines</h4>
          <div class="shape-grid">
            <button type="button" class="shape" (click)="addShape('rect')" title="Rectangle" aria-label="Rectangle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="1"/></svg></button>
            <button type="button" class="shape" (click)="addShape('ellipse')" title="Circle" aria-label="Circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg></button>
            <button type="button" class="shape" (click)="addShape('triangle')" title="Triangle" aria-label="Triangle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 4 21 20H3z"/></svg></button>
            <button type="button" class="shape" (click)="addShape('line')" title="Line / underline / divider" aria-label="Line"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12h16"/></svg></button>
          </div>
          <button type="button" class="tool" (click)="addFrame()" title="An empty rectangle with only a border">Border box (outline only)</button>

          <h4>Table</h4>
          <div class="grid2">
            <div class="field"><label>Rows</label><input type="number" min="1" max="30" [(ngModel)]="tblRows"></div>
            <div class="field"><label>Columns</label><input type="number" min="1" max="12" [(ngModel)]="tblCols"></div>
          </div>
          <button type="button" class="tool" (click)="addTable()">Add table</button>

        </div>

        <div class="side-scroll" *ngIf="leftTab === 'data'">
          <p class="hint">Create a field, pick its data type, then type <b>{{ '{{' }}fieldName{{ '}}' }}</b> inside any text on the page. The PDF shows the value formatted for its type.</p>
          <div class="field"><label>Numbers &amp; dates style</label>
            <select [ngModel]="doc.locale" (ngModelChange)="doc.locale = $event; changed(true)">
              <option *ngFor="let l of locales" [value]="l.v">{{ l.label }}</option>
            </select></div>
          <label class="check"><input type="checkbox" [(ngModel)]="showTokens"> Show field names on the page</label>

          <div class="fcard" *ngFor="let f of fields; trackBy: trackF">
            <div class="fhead">
              <code>{{ '{{' }}{{ f.key }}{{ '}}' }}</code>
              <span class="grow"></span>
              <button type="button" class="mini-b" (click)="insertField(f.key)" [disabled]="!canInsert" title="Add to the selected text box">Insert</button>
              <button type="button" class="mini-b dangerb" (click)="removeField(f)" title="Delete field">✕</button>
            </div>
            <div class="grid2">
              <div class="field"><label>Name</label>
                <input type="text" [value]="f.key" (change)="renameKey(f, $any($event.target))"></div>
              <div class="field"><label>Data type</label>
                <select [ngModel]="f.type" (ngModelChange)="setFieldType(f, $event)">
                  <option *ngFor="let ty of fieldTypes" [value]="ty.v">{{ ty.label }}</option>
                </select></div>
            </div>

            <div class="field"><label>Value</label>
              <ng-container [ngSwitch]="f.type">
                <input *ngSwitchCase="'number'" type="number" step="any" [(ngModel)]="f.value" (ngModelChange)="changed()">
                <input *ngSwitchCase="'currency'" type="number" step="any" [(ngModel)]="f.value" (ngModelChange)="changed()">
                <input *ngSwitchCase="'percent'" type="number" step="any" [(ngModel)]="f.value" (ngModelChange)="changed()" placeholder="e.g. 18 for 18%">
                <input *ngSwitchCase="'date'" type="date" [(ngModel)]="f.value" (ngModelChange)="changed()">
                <input *ngSwitchCase="'encrypted'" type="text" autocomplete="off" [(ngModel)]="f.value" (ngModelChange)="onSecretChange(f)" placeholder="The value to protect">
                <select *ngSwitchCase="'boolean'" [(ngModel)]="f.value" (ngModelChange)="changed()">
                  <option value="true">{{ f.trueLabel || 'Yes' }}</option><option value="false">{{ f.falseLabel || 'No' }}</option>
                </select>
                <input *ngSwitchDefault type="text" [(ngModel)]="f.value" (ngModelChange)="changed()">
              </ng-container>
            </div>

            <div class="grid2" *ngIf="f.type === 'number' || f.type === 'currency' || f.type === 'percent'">
              <div class="field"><label>Decimals</label>
                <input type="number" min="0" max="8" [ngModel]="f.decimals" (ngModelChange)="setFieldNum(f, 'decimals', $event)"></div>
              <div class="field" *ngIf="f.type === 'currency'"><label>Currency</label>
                <select [(ngModel)]="f.currency" (ngModelChange)="changed()">
                  <option *ngFor="let c of currencies" [value]="c">{{ c }}</option>
                </select></div>
            </div>
            <div class="field" *ngIf="f.type === 'date'"><label>Date format</label>
              <select [(ngModel)]="f.dateFormat" (ngModelChange)="changed()">
                <option *ngFor="let d of dateFormats" [value]="d">{{ d }}</option>
              </select></div>
            <div class="grid2" *ngIf="f.type === 'boolean'">
              <div class="field"><label>When yes</label><input type="text" [(ngModel)]="f.trueLabel" (ngModelChange)="changed()"></div>
              <div class="field"><label>When no</label><input type="text" [(ngModel)]="f.falseLabel" (ngModelChange)="changed()"></div>
            </div>

            <ng-container *ngIf="f.type === 'encrypted'">
              <div class="field"><label>Unknown viewers see</label>
                <div class="grid2">
                  <input type="number" min="0" max="12" [ngModel]="f.maskLast ?? 4" (ngModelChange)="setMaskLast(f, $event)" title="Characters left visible at the end">
                  <span class="hint" style="align-self:center">last characters visible</span>
                </div>
                <div class="preview-val">PDF shows: <b>{{ formatField(f) || '(empty)' }}</b></div></div>

              <div class="field"><label>Who can unlock the full value</label>
                <div class="passrow">
                  <input [type]="showPass.has(f.id) ? 'text' : 'password'" autocomplete="new-password" [ngModel]="pass(f)" (ngModelChange)="setPass(f, $event)" placeholder="Passphrase (optional, kept in memory only)">
                  <button type="button" class="mini-b" (click)="togglePass(f)" [title]="showPass.has(f.id) ? 'Hide passphrase' : 'Show passphrase'">{{ showPass.has(f.id) ? 'Hide' : 'Show' }}</button>
                </div>
              </div>
              <div class="rlist" *ngFor="let r of f.recipients; let i = index">
                <span class="rname">{{ r.label }}</span>
                <button type="button" class="mini-b dangerb" (click)="removeRecipient(f, i)" title="Remove">✕</button>
              </div>
              <div class="seg">
                <button type="button" (click)="addMeAsRecipient(f)">Add me ({{ me.email }})</button>
              </div>
              <textarea class="pubin" rows="2" placeholder="Or paste a user's public key (PSPUB1...)" [(ngModel)]="newPub"></textarea>
              <div class="grid2">
                <input type="text" [(ngModel)]="newPubLabel" placeholder="Name for this key">
                <button type="button" class="mini-b" (click)="addRecipient(f)" [disabled]="!newPub.trim()">Add key</button>
              </div>

              <div class="seg">
                <button type="button" (click)="encryptField(f)" [disabled]="encBusy.has(f.id)">{{ f.cipher ? 'Re-seal' : 'Seal' }}</button>
                <button type="button" (click)="decryptField(f)" [disabled]="!f.cipher || encBusy.has(f.id)">Test unlock</button>
              </div>
              <label class="check"><input type="checkbox" [ngModel]="f.lockPdf === true" (ngModelChange)="f.lockPdf = $event; changed()"> Ask for the passphrase when the PDF is opened, then show the real value</label>
              <label class="check"><input type="checkbox" [ngModel]="f.embed !== false" (ngModelChange)="f.embed = $event; changed()"> Embed the sealed value in the PDF (hidden)</label>
              <div class="cipher" *ngIf="f.cipher">{{ f.cipher }}</div>
              <div class="preview-val" *ngIf="decResults.has(f.id)">{{ decResults.get(f.id) }}</div>
              <p class="hint">AES-256-GCM. Everyone sees the masked text. Only a person with the passphrase or a listed key can unlock the real value in <b>Unlock</b> (left menu). <b>{{ '{{' }}{{ f.key }}.cipher{{ '}}' }}</b> prints the sealed text. The original value is saved with your design on this device.</p>
            </ng-container>

            <div class="err" *ngIf="fieldError(f) as e">{{ e }}</div>
            <div class="preview-val" *ngIf="!fieldError(f) && f.type !== 'encrypted'">PDF shows: <b>{{ formatField(f) || '(empty)' }}</b></div>
          </div>

          <button type="button" class="tool" (click)="addField()">+ Add field</button>
        </div>

        <div class="side-scroll" *ngIf="leftTab === 'templates'">
          <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:0.75rem;">
            <button type="button" class="btn-primary" (click)="openGallery('blank')" style="display:flex; align-items:center; justify-content:center; gap:6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
              + Create Blank Template
            </button>
            <button type="button" class="btn-secondary browse" (click)="openGallery()">Browse all templates</button>
          </div>
          <p class="hint">Start from a blank canvas with your own custom attributes, or pick a ready-made design.</p>
          <div class="starter-grid">
            <button type="button" class="starter" *ngFor="let tp of templates" (click)="openGallery(tp.id)" [title]="tp.name">
              <span class="sw" [style.background]="'linear-gradient(135deg, ' + tpColor(tp.id) + ')'"></span>
              <span class="sname">{{ tp.name }}</span>
            </button>
          </div>
        </div>
      </aside>
      <div class="rz" title="Drag to resize. Double-click to reset." role="separator" aria-orientation="vertical" (mousedown)="startPanelResize($event, 'left')" (dblclick)="resetPanels()"></div>

      <!-- Center: canvas -->
      <section class="center">
        <div class="stage-area" #stageArea
             (mousedown)="onStageDown($event)"
             (dblclick)="onStageDblClick($event)"
             (contextmenu)="onStageContextMenu($event)">
          <div class="page-holder" [style.width.px]="W * zoom" [style.height.px]="H * zoom">
            <div class="page" #page [style.width.px]="W" [style.height.px]="H" [style.background]="cur.bg"
                 [style.transform]="'scale(' + zoom + ')'">
              <ng-container *ngFor="let el of cur.els; trackBy: trackId">
                <div class="el" *ngIf="!el.hidden" [class.hollow]="isHollow(el)" [class.locked]="el.locked" [class.sel-on]="el.id === selectedId"
                     [style.left.px]="el.x" [style.top.px]="el.y" [style.width.px]="el.w" [style.height.px]="el.h"
                     [style.transform]="'rotate(' + el.rot + 'deg)'" [style.opacity]="el.opacity"
                     (mousedown)="onElDown($event, el)" (dblclick)="startEdit(el)">
                  <div *ngIf="editingId !== el.id" class="vis" [innerHTML]="vis(el)"></div>
                  <div *ngIf="editingId === el.id" class="vis edit" contenteditable="true" spellcheck="false"
                       [id]="'edit-' + el.id" [attr.style]="textCss(el)" [textContent]="el.text"
                       (mousedown)="$event.stopPropagation()" (blur)="endEdit(el, $event)"></div>

                  <div class="sel" *ngIf="el.id === selectedId && editingId !== el.id && !el.locked"
                       [style.border-width.px]="1.5 / zoom">
                    <span class="h" *ngFor="let hd of handles" [style.left.%]="hd.l" [style.top.%]="hd.t"
                          [style.width.px]="10 / zoom" [style.height.px]="10 / zoom" [style.cursor]="hd.c"
                          [style.border-width.px]="1.5 / zoom"
                          (mousedown)="onHandleDown($event, el, hd.k)"></span>
                    <span class="rot-line" [style.height.px]="26 / zoom" [style.width.px]="1.5 / zoom"></span>
                    <span class="rot" [style.width.px]="14 / zoom" [style.height.px]="14 / zoom" [style.top.px]="-34 / zoom"
                          [style.border-width.px]="1.5 / zoom" (mousedown)="onRotDown($event, el)"></span>
                  </div>
                </div>
              </ng-container>
              <div class="guide v" *ngFor="let g of guides.v" [style.left.px]="g"></div>
              <div class="guide h" *ngFor="let g of guides.h" [style.top.px]="g"></div>
            </div>
          </div>
        </div>

        <div class="pages-bar">
          <button type="button" *ngFor="let p of doc.pages; let i = index" class="pchip" [class.active]="i === pageIdx" (click)="goPage(i)">
            Page {{ i + 1 }}
          </button>
          <button type="button" class="pchip add" (click)="addPage()" title="Add page">+ Add page</button>
          <button type="button" class="pchip" (click)="duplicatePage()" title="Duplicate this page">Duplicate</button>
          <button type="button" class="pchip danger" (click)="deletePage()" [disabled]="doc.pages.length < 2" title="Delete this page">Delete page</button>
        </div>
      </section>

      <div class="rz" title="Drag to resize. Double-click to reset." role="separator" aria-orientation="vertical" (mousedown)="startPanelResize($event, 'right')" (dblclick)="resetPanels()"></div>

      <!-- Right: properties -->
      <aside class="side right">
        <div class="side-scroll">
          <ng-container *ngIf="sel as s; else pageProps">
            <div class="row-head">
              <h4>{{ typeLabel(s) }}</h4>
              <div class="mini">
                <button type="button" (click)="duplicate()" title="Duplicate (Ctrl+D)">Duplicate</button>
                <button type="button" class="dangerb" (click)="remove()" title="Delete (Del)">Delete</button>
              </div>
            </div>

            <ng-container *ngIf="s.type === 'text'">
              <div class="field">
                <label>Font</label>
                <select [ngModel]="s.fontFamily" (ngModelChange)="set('fontFamily', $event)">
                  <option *ngFor="let f of fonts" [value]="f.name">{{ f.name }}</option>
                </select>
              </div>
              <div class="grid2">
                <div class="field"><label>Size</label>
                  <input type="number" min="6" max="400" [ngModel]="s.fontSize" (ngModelChange)="set('fontSize', $event)"></div>
                <div class="field"><label>Color</label>
                  <input type="color" class="color" [ngModel]="s.color" (ngModelChange)="set('color', $event)"></div>
              </div>
              <div class="seg">
                <button type="button" [class.on]="s.bold" (click)="toggle('bold')" title="Bold"><b>B</b></button>
                <button type="button" [class.on]="s.italic" (click)="toggle('italic')" title="Italic"><i>I</i></button>
                <button type="button" [class.on]="s.underline" (click)="toggle('underline')" title="Underline"><u>U</u></button>
                <span class="sep"></span>
                <button type="button" [class.on]="s.align === 'left'" (click)="set('align', 'left')" title="Align left">L</button>
                <button type="button" [class.on]="s.align === 'center'" (click)="set('align', 'center')" title="Align center">C</button>
                <button type="button" [class.on]="s.align === 'right'" (click)="set('align', 'right')" title="Align right">R</button>
                <button type="button" [class.on]="s.align === 'justify'" (click)="set('align', 'justify')" title="Justify">J</button>
              </div>
              <div class="grid2">
                <div class="field"><label>Line height</label>
                  <input type="number" min="0.8" max="4" step="0.05" [ngModel]="s.lineHeight" (ngModelChange)="set('lineHeight', $event)"></div>
                <div class="field"><label>Letter spacing</label>
                  <input type="number" min="-5" max="50" step="0.5" [ngModel]="s.letterSpacing" (ngModelChange)="set('letterSpacing', $event)"></div>
              </div>
              <div class="field" *ngIf="fields.length">
                <label>Insert data field</label>
                <select (change)="insertField($any($event.target).value); $any($event.target).value = ''">
                  <option value="">Choose a field...</option>
                  <option *ngFor="let f of fields" [value]="f.key">{{ f.key }} ({{ typeName(f.type) }})</option>
                </select>
              </div>
              <h4>Border &amp; background</h4>
              <div class="grid2">
                <div class="field"><label>Background</label>
                  <div class="color-row">
                    <input type="color" class="color" [ngModel]="s.boxFill || '#ffffff'" (ngModelChange)="set('boxFill', $event)">
                    <button type="button" class="none" [class.on]="!s.boxFill" (click)="set('boxFill', '')">None</button>
                  </div></div>
                <div class="field"><label>Border color</label>
                  <input type="color" class="color" [ngModel]="s.boxColor || '#0f172a'" (ngModelChange)="set('boxColor', $event)"></div>
              </div>
              <div class="grid2">
                <div class="field"><label>Border width</label>
                  <input type="number" min="0" max="20" [ngModel]="s.boxBorder || 0" (ngModelChange)="set('boxBorder', $event)"></div>
                <div class="field"><label>Border style</label>
                  <select [ngModel]="s.boxStyle || 'solid'" (ngModelChange)="set('boxStyle', $event)">
                    <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="double">Double</option>
                  </select></div>
              </div>
              <div class="grid2">
                <div class="field"><label>Corner radius</label>
                  <input type="number" min="0" max="200" [ngModel]="s.boxRadius || 0" (ngModelChange)="set('boxRadius', $event)"></div>
                <div class="field"><label>Padding</label>
                  <input type="number" min="0" max="80" [ngModel]="s.pad || 0" (ngModelChange)="set('pad', $event)"></div>
              </div>
              <p class="hint">Double-click the text on the page to edit it. Use {{ '{{' }}fieldName{{ '}}' }} to show data.</p>
            </ng-container>

            <ng-container *ngIf="s.type !== 'text' && s.type !== 'image' && s.type !== 'barcode' && s.type !== 'qr' && !isExtra(s)">
              <div class="grid2">
                <div class="field" *ngIf="s.type !== 'line'"><label>Fill</label>
                  <div class="color-row">
                    <input type="color" class="color" [ngModel]="s.fill || '#ffffff'" (ngModelChange)="set('fill', $event)">
                    <button type="button" class="none" [class.on]="!s.fill" (click)="set('fill', '')">None</button>
                  </div></div>
                <div class="field"><label>{{ s.type === 'line' ? 'Line color' : 'Outline' }}</label>
                  <input type="color" class="color" [ngModel]="s.stroke" (ngModelChange)="set('stroke', $event)"></div>
              </div>
              <div class="grid2">
                <div class="field"><label>{{ s.type === 'line' ? 'Thickness' : 'Outline width' }}</label>
                  <input type="number" min="0" max="60" [ngModel]="s.strokeWidth" (ngModelChange)="set('strokeWidth', $event)"></div>
                <div class="field" *ngIf="s.type === 'rect'"><label>Corner radius</label>
                  <input type="number" min="0" max="500" [ngModel]="s.radius" (ngModelChange)="set('radius', $event)"></div>
              </div>
            </ng-container>

            <ng-container *ngIf="s.type === 'table'">
              <div class="grid2">
                <button type="button" class="mini-b" (click)="tableResize(1, 0)">+ Row</button>
                <button type="button" class="mini-b" (click)="tableResize(-1, 0)" [disabled]="(s.cells?.length || 0) < 2">− Row</button>
                <button type="button" class="mini-b" (click)="tableResize(0, 1)">+ Column</button>
                <button type="button" class="mini-b" (click)="tableResize(0, -1)" [disabled]="(s.cells?.[0]?.length || 0) < 2">− Column</button>
              </div>
              <div class="field"><label>Font</label>
                <select [ngModel]="s.fontFamily" (ngModelChange)="set('fontFamily', $event)">
                  <option *ngFor="let f of fonts" [value]="f.name">{{ f.name }}</option>
                </select></div>
              <div class="grid2">
                <div class="field"><label>Text size</label>
                  <input type="number" min="6" max="100" [ngModel]="s.fontSize" (ngModelChange)="set('fontSize', $event)"></div>
                <div class="field"><label>Text color</label>
                  <input type="color" class="color" [ngModel]="s.color" (ngModelChange)="set('color', $event)"></div>
              </div>
              <div class="seg">
                <button type="button" [class.on]="s.align === 'left'" (click)="set('align', 'left')" title="Align left">L</button>
                <button type="button" [class.on]="s.align === 'center'" (click)="set('align', 'center')" title="Align center">C</button>
                <button type="button" [class.on]="s.align === 'right'" (click)="set('align', 'right')" title="Align right">R</button>
              </div>
              <div class="grid2">
                <div class="field"><label>Border color</label>
                  <input type="color" class="color" [ngModel]="s.stroke || '#94a3b8'" (ngModelChange)="set('stroke', $event)"></div>
                <div class="field"><label>Border width</label>
                  <input type="number" min="0" max="10" [ngModel]="s.strokeWidth ?? 1" (ngModelChange)="set('strokeWidth', $event)"></div>
              </div>
              <div class="grid2">
                <div class="field"><label>Row height</label>
                  <input type="number" min="14" max="300" [ngModel]="tableRowH(s)" (ngModelChange)="setRowH($event)"></div>
                <div class="field"><label>Cell background</label>
                  <div class="color-row">
                    <input type="color" class="color" [ngModel]="s.fill || '#ffffff'" (ngModelChange)="set('fill', $event)">
                    <button type="button" class="none" [class.on]="!s.fill" (click)="set('fill', '')">None</button>
                  </div></div>
              </div>
              <label class="check big"><input type="checkbox" [ngModel]="s.header" (ngModelChange)="set('header', $event)"> First row is a header</label>
              <div class="grid2" *ngIf="s.header">
                <div class="field"><label>Header background</label>
                  <input type="color" class="color" [ngModel]="s.headFill || '#e2e8f0'" (ngModelChange)="set('headFill', $event)"></div>
                <div class="field"><label>Header text</label>
                  <input type="color" class="color" [ngModel]="s.headColor || '#0f172a'" (ngModelChange)="set('headColor', $event)"></div>
              </div>
              <label class="check big"><input type="checkbox" [ngModel]="s.zebra" (ngModelChange)="set('zebra', $event)"> Striped rows</label>
              <h4>Cells</h4>
              <div class="tcells" *ngFor="let row of s.cells; let ri = index; trackBy: trackIdx">
                <input type="text" *ngFor="let c of row; let ci = index; trackBy: trackIdx" [ngModel]="s.cells![ri][ci]"
                       (ngModelChange)="setCell(ri, ci, $event)" [placeholder]="'R' + (ri + 1) + ' C' + (ci + 1)">
              </div>
              <p class="hint">Columns share the width equally. Drag the table handles on the page to resize. Use {{ '{{' }}fieldName{{ '}}' }} in a cell to show data.</p>
            </ng-container>

            <ng-container *ngIf="s.type === 'button' || s.type === 'checkbox' || s.type === 'input'">
              <div class="field" *ngIf="s.type === 'input'"><label>Label (above the box)</label>
                <input type="text" [ngModel]="s.label" (ngModelChange)="set('label', $event)"></div>
              <div class="field"><label>{{ s.type === 'button' ? 'Button text' : s.type === 'checkbox' ? 'Checkbox label' : 'Value shown in the box' }}</label>
                <input type="text" [ngModel]="s.text" (ngModelChange)="set('text', $event)"></div>
              <label class="check big" *ngIf="s.type === 'checkbox'"><input type="checkbox" [ngModel]="s.checked" (ngModelChange)="set('checked', $event)"> Ticked</label>
              <label class="check big" *ngIf="s.type === 'checkbox'"><input type="checkbox" [ngModel]="s.round" (ngModelChange)="set('round', $event)"> Round (radio button)</label>
              <label class="check big" *ngIf="s.type === 'button'"><input type="checkbox" [ngModel]="s.bold !== false" (ngModelChange)="set('bold', $event)"> Bold text</label>
              <div class="field"><label>Font</label>
                <select [ngModel]="s.fontFamily" (ngModelChange)="set('fontFamily', $event)">
                  <option *ngFor="let f of fonts" [value]="f.name">{{ f.name }}</option>
                </select></div>
              <div class="grid2">
                <div class="field"><label>Text size</label>
                  <input type="number" min="6" max="100" [ngModel]="s.fontSize" (ngModelChange)="set('fontSize', $event)"></div>
                <div class="field"><label>Text color</label>
                  <input type="color" class="color" [ngModel]="s.color" (ngModelChange)="set('color', $event)"></div>
              </div>
              <div class="grid2">
                <div class="field"><label>Fill</label>
                  <div class="color-row">
                    <input type="color" class="color" [ngModel]="s.fill || '#ffffff'" (ngModelChange)="set('fill', $event)">
                    <button type="button" class="none" [class.on]="!s.fill" (click)="set('fill', '')">None</button>
                  </div></div>
                <div class="field"><label>{{ s.type === 'checkbox' ? 'Box / tick color' : 'Border color' }}</label>
                  <input type="color" class="color" [ngModel]="s.stroke || '#0f172a'" (ngModelChange)="set('stroke', $event)"></div>
              </div>
              <div class="grid2">
                <div class="field"><label>Border width</label>
                  <input type="number" min="0" max="20" [ngModel]="s.strokeWidth ?? 0" (ngModelChange)="set('strokeWidth', $event)"></div>
                <div class="field"><label>Corner radius</label>
                  <input type="number" min="0" max="200" [ngModel]="s.radius ?? 0" (ngModelChange)="set('radius', $event)"></div>
              </div>
              <p class="hint">Printed as a drawn control (not a clickable PDF form field). The text can use {{ '{{' }}fieldName{{ '}}' }}.</p>
            </ng-container>

            <ng-container *ngIf="s.type === 'barcode' || s.type === 'qr'">
              <div class="field"><label>{{ s.type === 'barcode' ? 'Barcode value' : 'QR code content' }}</label>
                <textarea rows="3" spellcheck="false" [ngModel]="s.data" (ngModelChange)="set('data', $event)"
                          [placeholder]="s.type === 'barcode' ? 'e.g. 123456789012' : 'Text or link'"></textarea></div>
              <div class="field" *ngIf="fields.length">
                <label>Insert data field</label>
                <select (change)="insertField($any($event.target).value); $any($event.target).value = ''">
                  <option value="">Choose a field...</option>
                  <option *ngFor="let f of fields" [value]="f.key">{{ f.key }} ({{ typeName(f.type) }})</option>
                </select>
              </div>
              <div class="grid2">
                <div class="field"><label>{{ s.type === 'barcode' ? 'Bar color' : 'Code color' }}</label>
                  <input type="color" class="color" [ngModel]="s.color || '#000000'" (ngModelChange)="set('color', $event)"></div>
                <div class="field"><label>Background</label>
                  <div class="color-row">
                    <input type="color" class="color" [ngModel]="s.fill || '#ffffff'" (ngModelChange)="set('fill', $event)">
                    <button type="button" class="none" [class.on]="!s.fill" (click)="set('fill', '')">None</button>
                  </div></div>
              </div>
              <label class="check big" *ngIf="s.type === 'barcode'"><input type="checkbox" [ngModel]="s.showText" (ngModelChange)="set('showText', $event)"> Show the value under the bars</label>
              <p class="hint" *ngIf="s.type === 'barcode'">Code 128: letters, numbers and common symbols. Keep the barcode wide and leave empty space on both sides so scanners can read it.</p>
              <p class="hint" *ngIf="s.type === 'qr'">QR codes hold up to 412 characters. Keep the contrast high for reliable scanning.</p>
            </ng-container>

            <ng-container *ngIf="s.type === 'image'">
              <div class="grid2">
                <div class="field"><label>Fit</label>
                  <select [ngModel]="s.fit" (ngModelChange)="set('fit', $event)">
                    <option value="cover">Fill (crop)</option>
                    <option value="contain">Fit inside</option>
                  </select></div>
                <div class="field"><label>Corner radius</label>
                  <input type="number" min="0" max="500" [ngModel]="s.radius" (ngModelChange)="set('radius', $event)"></div>
              </div>
              <h4>Edit text in picture</h4>
              <div class="field"><label>Language of the text</label>
                <select [(ngModel)]="ocrLang" [disabled]="ocrBusy">
                  <option *ngFor="let l of ocrLangs" [value]="l.code">{{ l.label }}</option>
                </select></div>
              <button type="button" class="btn-secondary" (click)="makeTextEditable()" [disabled]="ocrBusy">{{ ocrBusy ? ocrStatus : 'Make text editable' }}</button>
              <p class="hint">Reads the text in this picture and places editable boxes over it, hiding the original words. Check the result, since fonts and spacing may differ. The first use downloads the language data and needs internet.</p>
            </ng-container>

            <h4>Position &amp; size</h4>
            <div class="grid2">
              <div class="field"><label>X</label><input type="number" [ngModel]="round(s.x)" (ngModelChange)="set('x', $event)"></div>
              <div class="field"><label>Y</label><input type="number" [ngModel]="round(s.y)" (ngModelChange)="set('y', $event)"></div>
              <div class="field"><label>Width</label><input type="number" min="10" [ngModel]="round(s.w)" (ngModelChange)="set('w', $event)"></div>
              <div class="field"><label>Height</label><input type="number" min="4" [ngModel]="round(s.h)" (ngModelChange)="set('h', $event)"></div>
              <div class="field"><label>Rotate (°)</label><input type="number" [ngModel]="round(s.rot)" (ngModelChange)="set('rot', $event)"></div>
              <div class="field"><label>Opacity</label>
                <input type="range" min="0.05" max="1" step="0.05" [ngModel]="s.opacity" (ngModelChange)="set('opacity', $event)"></div>
            </div>
            <div class="seg wrap">
              <button type="button" (click)="alignTo('left')" title="Align to page left">⇤</button>
              <button type="button" (click)="alignTo('hcenter')" title="Center horizontally">↔</button>
              <button type="button" (click)="alignTo('right')" title="Align to page right">⇥</button>
              <button type="button" (click)="alignTo('top')" title="Align to page top">⤒</button>
              <button type="button" (click)="alignTo('vcenter')" title="Center vertically">↕</button>
              <button type="button" (click)="alignTo('bottom')" title="Align to page bottom">⤓</button>
            </div>
            <div class="seg wrap">
              <button type="button" (click)="order('front')">To front</button>
              <button type="button" (click)="order('up')">Forward</button>
              <button type="button" (click)="order('down')">Backward</button>
              <button type="button" (click)="order('back')">To back</button>
              <button type="button" [class.on]="s.locked" (click)="toggle('locked')">{{ s.locked ? 'Unlock' : 'Lock' }}</button>
            </div>
          </ng-container>

          <ng-template #pageProps>
            <h4>Page</h4>
            <div class="field"><label>Background</label>
              <input type="color" class="color" [ngModel]="cur.bg" (ngModelChange)="setBg($event)"></div>
            <div class="grid2">
              <div class="field"><label>Page size</label>
                <select [ngModel]="doc.size" (ngModelChange)="setPageSetup('size', $event)">
                  <option value="A4">A4</option><option value="Letter">Letter</option><option value="Legal">Legal</option>
                </select></div>
              <div class="field"><label>Orientation</label>
                <select [ngModel]="doc.orientation" (ngModelChange)="setPageSetup('orientation', $event)">
                  <option value="Portrait">Portrait</option><option value="Landscape">Landscape</option>
                </select></div>
            </div>
            <p class="hint">Click any item on the page to edit it. Shortcuts: Del delete, Ctrl+Z / Ctrl+Y undo / redo, Ctrl+D duplicate, Ctrl+C / Ctrl+V copy / paste, arrow keys nudge (Shift = 10 px).</p>
          </ng-template>

          <h4>Layers</h4>
          <div class="layers">
            <div class="layer" *ngFor="let l of layers" [class.on]="l.id === selectedId" (click)="selectedId = l.id">
              <span class="ltype">{{ typeLabel(l) }}</span>
              <span class="lname">{{ l.type === 'text' ? (l.text || 'Text') : (l.type === 'button' || l.type === 'checkbox' || l.type === 'input') ? (l.text || l.label || '') : '' }}</span>
              <button type="button" (click)="toggleLayer(l, 'hidden', $event)" [title]="l.hidden ? 'Show' : 'Hide'">{{ l.hidden ? '🚫' : '👁' }}</button>
              <button type="button" (click)="toggleLayer(l, 'locked', $event)" [title]="l.locked ? 'Unlock' : 'Lock'">{{ l.locked ? '🔒' : '🔓' }}</button>
            </div>
            <p class="hint" *ngIf="layers.length === 0">Nothing on this page yet.</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- PDF open options -->
    <div class="overlay" *ngIf="pdfPending" (mousedown)="pdfPending = null">
      <div class="pdfbox" (mousedown)="$event.stopPropagation()" role="dialog" aria-label="How to open this PDF">
        <h3>Open "{{ pdfPending.name }}"</h3>
        <p>Choose how the PDF should open in the Editor.</p>
        <button type="button" class="pdfopt rec" (click)="choosePdf('overlay')">
          <strong>Exact look + editable text (recommended)</strong>
          <span>Keeps the page looking identical and lets you click and edit the real text where it is. Needs a PDF with real text, not a scan.</span>
        </button>
        <button type="button" class="pdfopt" (click)="choosePdf('image')">
          <strong>Pages as pictures (exact look)</strong>
          <span>Keeps the original layout. Each page is a locked background; add text, shapes, stamps and codes on top.</span>
        </button>
        <button type="button" class="pdfopt" (click)="choosePdf('text')">
          <strong>Extract text (editable)</strong>
          <span>Turns the PDF text into editable boxes. Pictures and colours of the original are not kept.</span>
        </button>
        <button type="button" class="btn-secondary" (click)="pdfPending = null">Cancel</button>
      </div>
    </div>

    <!-- Save to Templates: ask for the template name -->
    <div class="overlay" *ngIf="saveOpen" (mousedown)="saveOpen = false">
      <div class="pdfbox" (mousedown)="$event.stopPropagation()" role="dialog" aria-label="Save to Templates">
        <h3>Save to Templates</h3>
        <p>Give this template a name. It will be stored on the Templates page and can be picked in Bills &amp; Invoices.</p>
        <input id="saveNameInput" class="savename" type="text" maxlength="80" autocomplete="off" placeholder="Template name"
               [(ngModel)]="saveName" (keydown.enter)="confirmSave()">
        <span class="savenote" *ngIf="saveName.trim() && saveExists()">A template named "{{ saveName.trim() }}" already exists. Saving will replace it.</span>
        <span class="savenote err" *ngIf="saveError">{{ saveError }}</span>
        <div class="saverow">
          <button type="button" class="btn-secondary" (click)="saveOpen = false">Cancel</button>
          <button type="button" class="btn-primary" (click)="confirmSave()" [disabled]="!saveName.trim()">{{ saveName.trim() && saveExists() ? 'Replace' : 'Save' }}</button>
        </div>
      </div>
    </div>

    <!-- Template gallery -->
    <div class="overlay" *ngIf="galleryOpen" (mousedown)="galleryOpen = false">
      <div class="modal" (mousedown)="$event.stopPropagation()" role="dialog" aria-label="Choose a template">
        <div class="mset">
          <h3>Template Settings</h3>
          <div class="field"><label>Document title</label>
            <input type="text" [(ngModel)]="gTitle" (ngModelChange)="gTitleTouched = true; onSettingChanged()" placeholder="My document"></div>
          <div class="field"><label>Select format</label>
            <select [(ngModel)]="gSize" (ngModelChange)="onSettingChanged()">
              <option value="A4">A4</option><option value="Letter">Letter</option><option value="Legal">Legal</option><option value="A5">A5</option><option value="A3">A3</option>
            </select></div>
          <div class="field"><label>Orientation</label>
            <select [(ngModel)]="gOrientation" (ngModelChange)="onSettingChanged()">
              <option value="Portrait">Portrait</option>
              <option value="Landscape">Landscape</option>
            </select></div>
          <div class="field" *ngIf="gSel !== 'blank'"><label>Theme color</label>
            <div class="color-pick">
              <input type="color" class="color" [(ngModel)]="gColor" (ngModelChange)="onSettingChanged()" aria-label="Theme color">
              <input type="text" [(ngModel)]="gColor" (ngModelChange)="onSettingChanged()" maxlength="7" spellcheck="false">
            </div>
            <div class="swatches">
              <button type="button" *ngFor="let c of swatches" class="swatch" [style.background]="c" [class.on]="c === gColor"
                      (click)="gColor = c; onSettingChanged()" [attr.aria-label]="'Use ' + c"></button>
            </div></div>
          <label class="check big" *ngIf="gSel !== 'blank'"><input type="checkbox" [(ngModel)]="gLogo" (ngModelChange)="onSettingChanged()"> Include logo placeholder</label>

          <!-- Custom attributes section (prominent for Blank Page) -->
          <div class="field attr-section" *ngIf="gSel === 'blank'">
            <label>Template Attributes (Fields)</label>
            <p class="hint" style="margin-bottom:6px; font-size:0.75rem;">Define custom data fields (variables) to use as <code>{{ '{{variable}}' }}</code> tags on your page.</p>
            <div class="attr-input-row">
              <input type="text" [(ngModel)]="newAttrKey" (keyup.enter)="addBlankAttr()" placeholder="e.g. customerName, amount" class="attr-input">
              <button type="button" class="btn-attr-add" (click)="addBlankAttr()" [disabled]="!newAttrKey.trim()">+ Add</button>
            </div>
            <div class="attr-chips">
              <span class="attr-chip" *ngFor="let k of blankAttrs; let i = index">
                {{ '{{' + k + '}}' }}
                <button type="button" (click)="removeBlankAttr(i)" class="btn-chip-del" title="Remove attribute">✕</button>
              </span>
              <span class="hint" *ngIf="blankAttrs.length === 0" style="font-size:0.75rem;">No attributes yet. Add some above.</span>
            </div>
          </div>

          <p class="hint" *ngIf="gSel !== 'blank'">Everything in the template can be edited afterwards: text, colors, shapes, images and data fields.</p>
          <p class="hint" *ngIf="gSel === 'blank'">Starts with a clean canvas. Use the left toolbar to draw shapes, place text, barcodes, QR codes, tables, and bind attributes.</p>
          <div class="spacer"></div>
          <button type="button" class="btn-primary use" (click)="useTemplate()">{{ gSel === 'blank' ? 'Create Blank Template' : 'Use this template' }}</button>
          <button type="button" class="btn-secondary" (click)="galleryOpen = false">Cancel</button>
        </div>

        <div class="mmain">
          <div class="mtop">
            <h3>Choose a Template</h3>
            <input type="search" class="tsearch" [(ngModel)]="gSearch" placeholder="Search templates">
          </div>
          <div class="chips">
            <button type="button" *ngFor="let c of tplCats" class="chip" [class.on]="gCat === c" (click)="gCat = c">{{ c }}</button>
          </div>
          <div class="tgrid">
            <button type="button" class="tcard" *ngFor="let tp of gTemplates" [class.on]="tp.id === gSel"
                    (click)="selectTpl(tp)" (dblclick)="selectTpl(tp); useTemplate()">
              <div class="tbox">
                <div class="tscale" *ngIf="thumb(tp) as ti" [style.width.px]="ti.w * fitK(ti, 150, 190)" [style.height.px]="ti.h * fitK(ti, 150, 190)">
                  <div class="tinner" [style.width.px]="ti.w" [style.height.px]="ti.h"
                       [style.transform]="'scale(' + fitK(ti, 150, 190) + ')'" [innerHTML]="ti.html"></div>
                </div>
              </div>
              <span class="tname">{{ tp.name }}</span>
            </button>
            <p class="hint" *ngIf="gTemplates.length === 0">No templates match your search.</p>
          </div>
        </div>

        <div class="mprev">
          <h3>Live Preview</h3>
          <div class="pframe" *ngIf="thumb(gCurrent) as pi">
            <div class="tscale" [style.width.px]="pi.w * fitK(pi, 290, 440)" [style.height.px]="pi.h * fitK(pi, 290, 440)">
              <div class="tinner" [style.width.px]="pi.w" [style.height.px]="pi.h"
                   [style.transform]="'scale(' + fitK(pi, 290, 440) + ')'" [innerHTML]="pi.html"></div>
            </div>
          </div>
          <p class="hint">{{ gCurrent.name }} · {{ gSize }} · {{ gCurrent.id === 'blank' ? gOrientation : gCurrent.orientation }}</p>
        </div>
      </div>
    </div>
  </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .studio { display: flex; flex-direction: column; gap: 0.6rem;
      height: calc(100vh - 56px - 2 * clamp(1rem, 2.5vw, 2.25rem)); min-height: 600px; }

    .bar { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.5rem 0.7rem;
      background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: var(--shadow-card); }
    .title-input { width: 220px; font-weight: 600; font-size: 0.95rem; border-color: transparent; background: transparent; }
    .title-input:hover { border-color: var(--border-color); }
    .grp { display: inline-flex; align-items: center; gap: 0.25rem; }
    .grp.zoom { gap: 0.4rem; font-size: 0.78rem; color: var(--text-muted); }
    .spacer { flex: 1; }
    .ib { width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
      background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 8px; font-size: 1rem; }
    .ib:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
    .ib:disabled { opacity: 0.4; cursor: default; }
    .txt { background: transparent; border: none; color: var(--primary); font-weight: 600; padding: 0.2rem 0.4rem; }
    .lnk, .lbl { display: inline-flex; align-items: center; border-radius: 8px; text-decoration: none; cursor: pointer; font-size: 0.8rem; padding: 0.45rem 0.8rem; }
    .lnk:hover { text-decoration: none; }
    .btn-secondary { border-radius: 8px; font-size: 0.8rem; padding: 0.45rem 0.8rem; }
    .dl { display: inline-flex; align-items: center; gap: 0.45rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }
    .dl:disabled { opacity: 0.6; cursor: wait; }

    .msg { padding: 0.5rem 0.8rem; border-radius: 8px; font-size: 0.85rem; background: rgba(16,185,129,0.15); color: var(--success-text); }
    .msg.error { background: rgba(239,68,68,0.15); color: var(--danger-text); }

    .body { flex: 1; min-height: 0; display: grid; grid-template-columns: var(--lw, 256px) 10px minmax(0, 1fr) 10px var(--rw, 280px); gap: 0; }
    .rz { cursor: col-resize; position: relative; user-select: none; }
    .rz::after { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 3px; margin-left: -1.5px; border-radius: 2px; background: transparent; transition: background 0.12s; }
    .rz:hover::after, .rz.on::after { background: var(--primary); }
    .side { display: flex; flex-direction: column; min-height: 0; background: var(--bg-card); border: 1px solid var(--border-color);
      border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-card); }
    .side-tabs { display: flex; border-bottom: 1px solid var(--border-color); background: var(--bg-th); }
    .side-tabs button { flex: 1; background: transparent; border: none; border-radius: 0; padding: 0.65rem; color: var(--text-muted); font-weight: 600; }
    .side-tabs button.active { color: var(--primary); box-shadow: inset 0 -2px 0 var(--primary); }
    .side-scroll { flex: 1; overflow-y: auto; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.5rem; }
    h4 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-top: 0.4rem; }
    .hint { font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; }

    .tool { display: flex; align-items: center; justify-content: center; gap: 0.5rem; width: 100%; padding: 0.6rem; text-align: center;
      background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-main); cursor: pointer; }
    .tool:hover { border-color: var(--primary); background: var(--bg-hover); }
    .tool.big { font-size: 1.25rem; font-weight: 700; } .tool.mid { font-size: 1rem; font-weight: 600; }
    .tcells { display: flex; gap: 4px; }
    .tcells input { flex: 1 1 0; min-width: 0; padding: 0.3rem 0.35rem; font-size: 0.74rem; }
    .shape-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.4rem; }
    .shape { aspect-ratio: 1; padding: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted);
      background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 8px; }
    .shape:hover { color: var(--primary); border-color: var(--primary); }
    .starter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
    .starter { display: flex; align-items: center; gap: 0.55rem; padding: 0.5rem 0.55rem; width: 100%; min-width: 0; text-align: left;
      font-size: 0.82rem; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-main); }
    .starter .sw { width: 24px; height: 32px; flex-shrink: 0; border-radius: 4px; }
    .starter .sname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .starter:hover { border-color: var(--primary); }
    .sw { width: 34px; height: 44px; border-radius: 4px; flex-shrink: 0; }

    .center { display: flex; flex-direction: column; min-height: 0; min-width: 0; gap: 0.5rem; }
    .stage-area { flex: 1; min-height: 0; overflow: auto; display: flex; padding: 28px; border-radius: 12px;
      background: var(--bg-elevated); border: 1px solid var(--border-color); }
    .page-holder { margin: auto; flex-shrink: 0; }
    .page { position: relative; transform-origin: top left; overflow: hidden; box-shadow: 0 2px 8px rgba(15,23,42,0.18), 0 14px 36px rgba(15,23,42,0.18); user-select: none; }
    .el { position: absolute; cursor: move; }
    .el.locked { cursor: default; }
    .el:hover:not(.sel-on)::after { content: ''; position: absolute; inset: 0; outline: 2px solid rgba(37,99,235,0.55); pointer-events: none; }
    .vis { width: 100%; height: 100%; pointer-events: none; }
    /* an outline-only shape: clicks go through its empty inside to the text underneath; only the border line is clickable */
    .el.hollow { pointer-events: none; }
    .el.hollow .vis svg * { pointer-events: visibleStroke; }
    .vis.edit { pointer-events: auto; outline: 2px solid var(--primary); cursor: text; user-select: text; background: rgba(255,255,255,0.0); }
    .sel { position: absolute; inset: 0; border: solid var(--primary); pointer-events: none; }
    .h { position: absolute; background: #fff; border: solid var(--primary); border-radius: 2px; transform: translate(-50%, -50%); pointer-events: auto; }
    .rot-line { position: absolute; left: 50%; top: 0; background: var(--primary); transform: translate(-50%, -100%); pointer-events: none; }
    .rot { position: absolute; left: 50%; background: #fff; border: solid var(--primary); border-radius: 50%; transform: translateX(-50%); cursor: grab; pointer-events: auto; }
    .guide { position: absolute; background: #ec4899; pointer-events: none; z-index: 5; }
    .guide.v { top: 0; bottom: 0; width: 1px; } .guide.h { left: 0; right: 0; height: 1px; }

    .pages-bar { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
    .pchip { padding: 0.3rem 0.75rem; font-size: 0.78rem; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 999px; }
    .pchip.active { background: var(--primary); border-color: var(--primary); color: #fff; }
    .pchip.add { color: var(--primary); border-style: dashed; }
    .pchip.danger:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); }
    .pchip:disabled { opacity: 0.4; cursor: default; }

    .row-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .row-head h4 { margin: 0; font-size: 0.8rem; color: var(--text-main); }
    .mini { display: flex; gap: 0.3rem; }
    .mini button, .layer button { font-size: 0.72rem; padding: 0.2rem 0.5rem; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; }
    .mini .dangerb:hover { border-color: var(--danger); color: var(--danger); }
    .field { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
    .field label { font-size: 0.68rem; color: var(--text-muted); }
    .field input, .field select { padding: 0.35rem 0.5rem; font-size: 0.8rem; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
    input.color { padding: 2px; height: 32px; cursor: pointer; }
    .color-row { display: flex; gap: 0.3rem; align-items: center; }
    .none { font-size: 0.7rem; padding: 0.3rem 0.45rem; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; }
    .none.on { border-color: var(--primary); color: var(--primary); }
    input[type="range"] { padding: 0; height: 28px; accent-color: var(--primary); }
    .rlist { display: flex; align-items: center; gap: 0.4rem; padding: 0.25rem 0.5rem; font-size: 0.78rem; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-input); }
    .rname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pubin { width: 100%; font-family: var(--font-mono); font-size: 0.68rem; resize: vertical; }
    .seg { display: flex; gap: 0.25rem; align-items: center; }
    .seg.wrap { flex-wrap: wrap; }
    .seg button { flex: 1; min-width: 30px; padding: 0.3rem 0.4rem; font-size: 0.75rem; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; }
    .seg button:hover { border-color: var(--primary); }
    .seg button.on { background: var(--primary); border-color: var(--primary); color: #fff; }
    .sep { width: 1px; height: 18px; background: var(--border-color); margin: 0 0.15rem; }

    .check { display: flex; align-items: center; gap: 0.45rem; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; }
    .fcard { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.65rem; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-input); }
    .fhead { display: flex; align-items: center; gap: 0.35rem; }
    .fhead code { font-family: var(--font-mono); font-size: 0.75rem; color: var(--primary); background: var(--tile-bg); padding: 0.1rem 0.4rem; border-radius: 6px; }
    .grow { flex: 1; }
    .mini-b { font-size: 0.7rem; padding: 0.15rem 0.45rem; background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; }
    .mini-b:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
    .mini-b.dangerb:hover { border-color: var(--danger); color: var(--danger); }
    .mini-b:disabled { opacity: 0.4; cursor: default; }
    .passrow { display: flex; gap: 0.4rem; align-items: center; } .passrow input { flex: 1; min-width: 0; }
    .cipher { font-family: var(--font-mono); font-size: 0.68rem; word-break: break-all; padding: 0.4rem 0.5rem; border-radius: 6px; background: var(--bg-th); border: 1px dashed var(--border-color); color: var(--text-main); max-height: 90px; overflow-y: auto; }
    .err { font-size: 0.72rem; color: var(--danger-text); }
    .preview-val { font-size: 0.72rem; color: var(--text-muted); }
    .preview-val b { color: var(--text-main); }
    .browse { width: 100%; border-radius: 8px; }
    .tplbtn { display: inline-flex; align-items: center; gap: 0.4rem; border-radius: 8px; font-size: 0.8rem; padding: 0.45rem 0.8rem; }
    .lbl.disabled { opacity: 0.6; pointer-events: none; }
    .pdfbox { width: min(460px, 100%); background: var(--bg-card); border-radius: 16px; padding: 1.3rem; display: flex; flex-direction: column; gap: 0.7rem; }
    .pdfbox h3 { font-size: 1.05rem; font-weight: 700; word-break: break-word; }
    .pdfbox p { font-size: 0.85rem; color: var(--text-muted); margin: 0; }
    .pdfopt { text-align: left; display: flex; flex-direction: column; gap: 0.25rem; padding: 0.8rem 0.9rem; border-radius: 10px;
      border: 1px solid var(--border-color); background: var(--bg-th); color: var(--text-main); cursor: pointer; }
    .pdfopt:hover { border-color: var(--primary); }
    .pdfopt.rec { border-color: var(--primary); }
    .savename { width: 100%; padding: 0.6rem 0.75rem; font: inherit; font-size: 0.9rem; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 8px; }
    .savenote { font-size: 0.78rem; color: #b45309; }
    .savenote.err { color: #dc2626; }
    .saverow { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.3rem; }
    .pdfopt span { font-size: 0.78rem; color: var(--text-muted); }
    .overlay { position: fixed; inset: 0; z-index: 100; background: rgba(15, 23, 42, 0.55); display: flex; align-items: center; justify-content: center; padding: 1rem; }
    .modal { width: min(1200px, 100%); height: min(780px, 94vh); background: var(--bg-card); border-radius: 16px; overflow: hidden;
      display: grid; grid-template-columns: 250px minmax(0, 1fr) 330px; box-shadow: 0 24px 80px rgba(0,0,0,0.35); border: 1px solid var(--border-color); }
    .modal h3 { font-size: 1.05rem; font-weight: 700; }
    .mset { padding: 1.1rem; display: flex; flex-direction: column; gap: 0.8rem; border-right: 1px solid var(--border-color); background: var(--bg-th); overflow-y: auto; }
    .mset .spacer { flex: 1; }
    .mset .use { border-radius: 8px; padding: 0.7rem; }
    .mset .btn-secondary { border-radius: 8px; }
    .color-pick { display: flex; gap: 0.4rem; }
    .color-pick input.color { width: 44px; flex-shrink: 0; }
    .swatches { display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.35rem; }
    .swatch { width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 2px solid var(--bg-card); box-shadow: 0 0 0 1px var(--border-color); }
    .swatch.on { box-shadow: 0 0 0 2px var(--primary); }
    .check.big { font-size: 0.82rem; color: var(--text-main); }
    .attr-section { border-top: 1px solid var(--border-color); padding-top: 0.6rem; }
    .attr-input-row { display: flex; gap: 0.4rem; margin-bottom: 0.5rem; }
    .attr-input { flex: 1; min-width: 0; padding: 0.35rem 0.5rem; font-size: 0.8rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-main); }
    .btn-attr-add { padding: 0.35rem 0.65rem; font-size: 0.78rem; font-weight: 600; border-radius: 6px; background: var(--primary); color: #fff; border: none; cursor: pointer; flex-shrink: 0; }
    .btn-attr-add:disabled { opacity: 0.5; cursor: not-allowed; }
    .attr-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; max-height: 120px; overflow-y: auto; padding: 2px; }
    .attr-chip { display: inline-flex; align-items: center; gap: 4px; padding: 0.2rem 0.5rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; font-size: 0.75rem; font-family: monospace; color: var(--text-main); }
    .btn-chip-del { background: none; border: none; padding: 0; font-size: 0.75rem; color: var(--text-muted); cursor: pointer; line-height: 1; }
    .btn-chip-del:hover { color: #dc2626; }
    .mmain { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 1.1rem; gap: 0.7rem; }
    .mtop { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .tsearch { width: 220px; padding: 0.4rem 0.7rem; font-size: 0.82rem; }
    .chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .chip { padding: 0.25rem 0.8rem; font-size: 0.78rem; border-radius: 999px; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); }
    .chip.on { background: var(--primary); border-color: var(--primary); color: #fff; }
    .tgrid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 0.8rem; align-content: start; padding: 0.2rem; }
    .tcard { display: flex; flex-direction: column; align-items: stretch; padding: 0; overflow: hidden; background: var(--bg-card);
      border: 2px solid var(--border-color); border-radius: 12px; text-align: center; }
    .tcard:hover { border-color: var(--tile-fg); }
    .tcard.on { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2); }
    .tbox { height: 214px; display: flex; align-items: center; justify-content: center; background: var(--bg-primary); }
    .tscale { position: relative; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18); background: #fff; flex-shrink: 0; }
    .tinner { transform-origin: top left; pointer-events: none; user-select: none; }
    .tname { padding: 0.55rem; font-weight: 600; font-size: 0.85rem; background: var(--bg-th); border-top: 1px solid var(--border-color); color: var(--text-main); }
    .tcard.on .tname { background: var(--primary); color: #fff; }
    .mprev { padding: 1.1rem; display: flex; flex-direction: column; gap: 0.7rem; border-left: 1px solid var(--border-color); background: var(--bg-th); min-height: 0; overflow-y: auto; }
    .pframe { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding-top: 0.4rem; }
    .pframe .tscale { box-shadow: 0 4px 18px rgba(15, 23, 42, 0.22); }
    @media (max-width: 1000px) {
      .modal { grid-template-columns: 1fr; height: 94vh; overflow-y: auto; }
      .mprev { display: none; }
      .mset { border-right: none; border-bottom: 1px solid var(--border-color); }
    }
    .layers { display: flex; flex-direction: column; gap: 0.25rem; }
    .layer { display: flex; align-items: center; gap: 0.4rem; padding: 0.3rem 0.4rem; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-size: 0.75rem; }
    .layer.on { border-color: var(--primary); background: var(--bg-hover); }
    .ltype { font-weight: 600; flex-shrink: 0; }
    .lname { flex: 1; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .layer .ltype + button { margin-left: auto; }

    @media (max-width: 1100px) {
      .body { grid-template-columns: var(--lw, 220px) 10px minmax(0, 1fr) 10px var(--rw, 240px); }
    }
    @media (max-width: 900px) {
      .studio { height: auto; }
      .body { grid-template-columns: 1fr; gap: 0.6rem; }
      .rz { display: none; }
      .stage-area { min-height: 520px; }
      .side { max-height: 420px; }
    }
  `]
})
export class DesignEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('stageArea') stageArea!: ElementRef<HTMLDivElement>;
  @ViewChild('page') pageEl!: ElementRef<HTMLDivElement>;

  private readonly STORE = 'pdfstudio-design-v1';
  private readonly PANELS = 'pdfstudio-panels-v1';
  fonts = FONTS;
  fieldTypes = FIELD_TYPES;
  currencies = CURRENCIES;
  locales = LOCALES;
  dateFormats = DATE_FORMATS;
  showTokens = false;

  // template gallery
  templates = TEMPLATES;
  tplCats = TPL_CATEGORIES;
  swatches = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706', '#059669', '#0d9488', '#0f172a'];
  galleryOpen = false;
  openAccept = OPEN_ACCEPT;
  supportedLabel = 'Open: ' + SUPPORTED_LABEL;
  openBusy = false;
  leftW = 256;
  rightW = 280;
  private panelDrag: { side: 'left' | 'right'; sx: number; w: number } | null = null;
  ocrLang = 'eng';
  ocrLangs = OCR_LANGS;
  ocrBusy = false;
  ocrStatus = '';
  pdfPending: File | null = null;
  saveOpen = false;      // "Save to Templates" name dialog
  saveName = '';
  saveError = '';
  gCat = 'All';
  gSearch = '';
  gSel = 'blank';
  gTitle = '';
  gTitleTouched = false;
  gSize = 'A4';
  gOrientation: 'Portrait' | 'Landscape' = 'Portrait';
  gColor = '#2563eb';
  gLogo = false;
  blankAttrs: string[] = ['title', 'date', 'recipient', 'amount'];
  newAttrKey = '';
  /** True only while building the HTML for a password-protected PDF: such fields print their real value. */
  private revealing = false;
  private tplCache = new Map<string, { html: SafeHtml; w: number; h: number }>();
  handles = HANDLES;

  doc: Doc = { title: 'Untitled design', size: 'A4', orientation: 'Portrait', pages: [this.newPage()], fields: [], locale: 'en-US' };
  pageIdx = 0;
  selectedId: string | null = null;
  editingId: string | null = null;
  leftTab: 'elements' | 'data' | 'templates' = 'elements';
  zoom = 0.6;
  guides: { v: number[]; h: number[] } = { v: [], h: [] };
  message = '';
  isError = false;
  busy = false;

  private panDrag: { sx: number; sy: number; sl: number; st: number } | null = null;
  spacePressed = false;
  private wheelListener = (ev: WheelEvent) => this.onStageWheel(ev);

  private hist: string[] = [];
  private hIdx = -1;
  private commitTimer: any;
  private msgTimer: any;
  private clip: El | null = null;
  private drag: { mode: 'move' | 'resize' | 'rotate'; id: string; sx: number; sy: number; o: El; handle?: string; moved: boolean } | null = null;
  private cache = new Map<string, { key: string; html: SafeHtml }>();

  constructor(private api: ApiService, private sanitizer: DomSanitizer, private auth: AuthService, private billStore: BillTemplateStore, private route: ActivatedRoute, private router: Router) {}

  // ---------- lifecycle ----------
  startPanelResize(ev: MouseEvent, side: 'left' | 'right'): void {
    ev.preventDefault();
    this.panelDrag = { side, sx: ev.clientX, w: side === 'left' ? this.leftW : this.rightW };
    document.body.style.cursor = 'col-resize';
  }

  resetPanels(): void {
    this.leftW = 256; this.rightW = 280;
    try { localStorage.removeItem(this.PANELS); } catch { /* ignore */ }
  }

  ngOnInit(): void {
    try {
      const p = JSON.parse(localStorage.getItem(this.PANELS) ?? 'null');
      if (p && Number.isFinite(p.l) && Number.isFinite(p.r)) {
        this.leftW = Math.min(520, Math.max(200, p.l)); this.rightW = Math.min(560, Math.max(220, p.r));
      }
    } catch { /* ignore */ }
    let hadSaved = false;
    try {
      const raw = localStorage.getItem(this.STORE);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.pages) && d.pages.length && PAGE_PX[d.size]) { this.doc = this.normalize(d); hadSaved = true; }
      }
    } catch { /* ignore corrupt or unavailable storage */ }
    this.pushHistory();
    if (!hadSaved) this.openGallery();
    this.route.queryParams.subscribe(params => {
      if (params['blank'] || params['newBlank']) {
        this.openGallery('blank');
      }
    });
  }

  /** Opens the HTML code editor with the code of the template that is open here. */
  openCodeEditor(): void {
    let code: { html: string; dataJson: string; pageSize: string; orientation: string } | null = null;
    try {
      // Untouched template opened from Templates: use its original HTML (with its {{tags}}) and sample data.
      const h = JSON.parse(localStorage.getItem('pdfstudio-code-handoff') ?? 'null');
      if (h && this.hIdx === 0 && !this.commitTimer && h.title === this.doc.title && h.html) {
        code = { html: h.html, dataJson: h.dataJson ?? '', pageSize: h.pageSize || this.doc.size, orientation: h.orientation || this.doc.orientation };
      }
    } catch { /* ignore */ }
    if (!code) {
      // A design (or one that has been edited here): turn the current page(s) into HTML.
      code = { html: prettyHtml(designCss(this.doc) + designPagesHtml(this.doc, this.doc.fields ?? [])), dataJson: '',
               pageSize: this.doc.size, orientation: this.doc.orientation };
    }
    try { localStorage.setItem('pdfstudio-editor-v1', JSON.stringify(code)); } catch { /* storage full: editor opens with its last code */ }
    void this.router.navigate(['/code-editor']);
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.fit(), 0);
    const stage = this.stageArea?.nativeElement;
    if (stage) {
      stage.addEventListener('wheel', this.wheelListener, { passive: false });
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.commitTimer);
    clearTimeout(this.msgTimer);
    const stage = this.stageArea?.nativeElement;
    if (stage) {
      stage.removeEventListener('wheel', this.wheelListener);
    }
  }

  // ---------- getters ----------
  get cur(): Page { return this.doc.pages[this.pageIdx]; }
  get sel(): El | null { return this.cur.els.find(e => e.id === this.selectedId) ?? null; }
  get layers(): El[] { return [...this.cur.els].reverse(); }
  get W(): number { const [w, h] = PAGE_PX[this.doc.size]; return this.doc.orientation === 'Landscape' ? h : w; }
  get H(): number { const [w, h] = PAGE_PX[this.doc.size]; return this.doc.orientation === 'Landscape' ? w : h; }
  get canUndo(): boolean { return this.hIdx > 0 || !!this.commitTimer; }
  get canRedo(): boolean { return this.hIdx < this.hist.length - 1; }

  trackId = (_: number, e: El) => e.id;
  round = (n: number | undefined) => Math.round((n ?? 0) * 10) / 10;
  typeLabel(e: El): string {
    return ({ text: 'Text', rect: 'Rectangle', ellipse: 'Circle', triangle: 'Triangle', line: 'Line', image: 'Image', barcode: 'Barcode', qr: 'QR code', table: 'Table', button: 'Button', checkbox: 'Checkbox', input: 'Input field' } as Record<string, string>)[e.type];
  }

  // ---------- factories ----------
  private newPage(): Page { return { id: uid(), bg: '#ffffff', els: [] }; }
  private base(type: ElType, o: Partial<El>): El {
    return { id: uid(), type, x: 100, y: 100, w: 200, h: 120, rot: 0, opacity: 1, ...o };
  }
  private mkText(o: Partial<El>): El {
    return this.base('text', { text: 'Text', fontFamily: 'Arial', fontSize: 24, bold: false, italic: false, underline: false,
      align: 'left', color: '#0f172a', lineHeight: 1.25, letterSpacing: 0, w: 300, h: 50, ...o });
  }
  private mkShape(type: ElType, o: Partial<El>): El {
    return this.base(type, { fill: '#2563eb', stroke: '#1e3a8a', strokeWidth: 0, radius: 0, ...o });
  }

  // ---------- add elements ----------
  addText(kind: 'heading' | 'sub' | 'body'): void {
    const cfg = {
      heading: { text: 'Your heading', fontSize: 48, bold: true, w: 460, h: 64 },
      sub: { text: 'Your subheading', fontSize: 28, bold: true, w: 400, h: 40 },
      body: { text: 'Write your text here. Double-click to edit.', fontSize: 16, bold: false, w: 360, h: 60 }
    }[kind];
    const n = this.cur.els.length;
    this.insertEl(this.mkText({ ...cfg, x: Math.max(20, (this.W - cfg.w) / 2), y: 120 + (n % 8) * 40 }), true);
  }

  addCode(kind: 'barcode' | 'qr'): void {
    const n = this.cur.els.length % 8;
    const o: Partial<El> = kind === 'barcode'
      ? { w: 320, h: 110, data: '123456789012', color: '#000000', fill: '#ffffff', showText: true, x: (this.W - 320) / 2, y: 300 + n * 30 }
      : { w: 170, h: 170, data: 'https://example.com', color: '#000000', fill: '#ffffff', x: (this.W - 170) / 2, y: 300 + n * 30 };
    this.insertEl(this.base(kind, o), false);
  }

  addShape(type: ElType): void {
    const n = this.cur.els.length % 8;
    const o: Partial<El> = type === 'line'
      ? { w: 300, h: 12, strokeWidth: 4, stroke: '#0f172a', x: (this.W - 300) / 2, y: 300 + n * 30 }
      : { w: 200, h: type === 'triangle' ? 180 : 200, x: (this.W - 200) / 2, y: 260 + n * 30 };
    this.insertEl(this.mkShape(type, o), false);
  }

  isHollow(el: El): boolean { return (el.type === 'rect' || el.type === 'ellipse' || el.type === 'triangle') && !el.fill; }

  addFrame(): void {
    const n = this.cur.els.length % 8;
    this.insertEl(this.mkShape('rect', { w: 300, h: 160, fill: '', stroke: '#0f172a', strokeWidth: 2, x: (this.W - 300) / 2, y: 260 + n * 30 }), false);
  }

  // ---------- table ----------
  tblRows = 4;
  tblCols = 3;
  trackIdx = (i: number) => i;
  isExtra(e: El): boolean { return EXTRA_TYPES.includes(e.type); }

  addTable(): void {
    const clamp = (v: any, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || lo));
    const rows = clamp(this.tblRows, 1, 30), cols = clamp(this.tblCols, 1, 12);
    this.tblRows = rows; this.tblCols = cols;
    const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => r === 0 ? 'Header ' + (c + 1) : ''));
    const rowH = 34, w = Math.min(this.W - 40, Math.max(160, cols * 130)), n = this.cur.els.length % 8;
    this.insertEl(this.base('table', { cells, header: true, zebra: false, headFill: '#e2e8f0', headColor: '#0f172a', rowH, w, h: rows * rowH,
      x: Math.max(0, (this.W - w) / 2), y: 200 + n * 30, fontFamily: 'Arial', fontSize: 14, color: '#0f172a', align: 'left',
      stroke: '#94a3b8', strokeWidth: 1, fill: '' }), false);
  }

  tableRowH(s: El): number { return Math.round(s.h / Math.max(1, s.cells?.length ?? 1)); }

  tableResize(dr: number, dc: number): void {
    const s = this.sel; if (!s || s.type !== 'table') return;
    const old = s.cells?.length ? s.cells : [['']];
    const rowH = s.h / old.length;
    const cells = old.map(r => [...r]);
    if (dr > 0 && cells.length < 30) cells.push(new Array(cells[0].length).fill(''));
    if (dr < 0 && cells.length > 1) cells.pop();
    if (dc > 0 && cells[0].length < 12) cells.forEach(r => r.push(''));
    if (dc < 0 && cells[0].length > 1) cells.forEach(r => r.pop());
    s.cells = cells;
    s.h = Math.round(rowH * cells.length);
    this.changed(true);
  }

  setRowH(v: any): void {
    const s = this.sel; if (!s || s.type !== 'table') return;
    const n = Number(v); if (!n || n < 14) return;
    s.h = Math.round(n * (s.cells?.length ?? 1)); s.rowH = n;
    this.changed();
  }

  setCell(r: number, c: number, v: string): void {
    const s = this.sel; if (!s?.cells?.[r]) return;
    s.cells[r][c] = v;
    this.changed();
  }

  // ---------- form controls ----------
  addForm(kind: 'button' | 'checkbox' | 'input'): void {
    const presets: Record<string, Partial<El>> = {
      button: { text: 'Submit', w: 160, h: 44, fill: '#2563eb', color: '#ffffff', stroke: '#1e3a8a', strokeWidth: 0, radius: 8, fontSize: 16, bold: true },
      checkbox: { text: 'I agree to the terms', w: 260, h: 30, fill: '#ffffff', stroke: '#0f172a', strokeWidth: 2, radius: 3, fontSize: 16, checked: false, round: false },
      input: { label: 'Full name', text: '', w: 300, h: 64, fill: '#ffffff', stroke: '#94a3b8', strokeWidth: 1, radius: 4, fontSize: 15 }
    };
    const d = presets[kind], n = this.cur.els.length % 8;
    this.insertEl(this.base(kind, { fontFamily: 'Arial', color: '#0f172a', ...d, x: Math.max(0, (this.W - (d.w as number)) / 2), y: 260 + n * 30 }), false);
  }

  uploadImage(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      if (!url.startsWith('data:image/')) { this.flash('That file is not a supported image.', true); return; }
      const img = new Image();
      img.onload = () => {
        let src = url, nw = img.naturalWidth, nh = img.naturalHeight;
        const max = 1600;
        if (Math.max(nw, nh) > max && file.type !== 'image/svg+xml') {
          const k = max / Math.max(nw, nh);
          const c = document.createElement('canvas');
          c.width = Math.round(nw * k); c.height = Math.round(nh * k);
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
          src = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9);
        }
        const k2 = Math.min(1, 420 / Math.max(nw, nh, 1));
        const w = Math.max(40, Math.round(nw * k2)), h = Math.max(40, Math.round(nh * k2));
        this.insertEl(this.base('image', { src, w, h, x: Math.max(0, (this.W - w) / 2), y: Math.max(0, (this.H - h) / 2),
          fit: 'cover', radius: 0 }), false);
      };
      img.onerror = () => this.flash('Could not read that image.', true);
      img.src = url;
    };
    reader.readAsDataURL(file);
  }

  private insertEl(el: El, edit: boolean): void {
    this.cur.els.push(el);
    this.selectedId = el.id;
    this.changed(true);
    if (edit) setTimeout(() => this.startEdit(el), 0);
  }

  // ---------- rendering helpers ----------
  private stack(name: string | undefined): string { return (FONTS.find(f => f.name === name) ?? FONTS[0]).stack; }

  textCss(el: El): string {
    return 'width:100%;height:100%;margin:0;box-sizing:border-box;white-space:pre-wrap;word-break:break-word;overflow:visible;'
      + `font-family:${this.stack(el.fontFamily)};font-size:${el.fontSize}px;font-weight:${el.bold ? 700 : 400};`
      + `font-style:${el.italic ? 'italic' : 'normal'};text-decoration:${el.underline ? 'underline' : 'none'};`
      + `text-align:${el.align};color:${el.color};line-height:${el.lineHeight};letter-spacing:${el.letterSpacing}px;` + boxCss(el);
  }

  private inner(el: El, forExport = false, fields?: Field[]): string {
    const extra = extraHtml(el, t => (!forExport && !fields && this.showTokens) ? t : this.resolve(t, fields ?? this.fields));
    if (extra !== null) return extra;
    if (el.type === 'text') return `<div style="${this.textCss(el)}">${esc(this.displayText(el, forExport, fields))}</div>`;
    if (el.type === 'barcode' || el.type === 'qr') {
      const data = this.resolve(el.data ?? '', fields ?? this.fields);
      const color = esc(el.color || '#000000'), bg = el.fill ? esc(el.fill) : '';
      return el.type === 'barcode'
        ? barcodeSvg(data, { w: el.w, h: el.h, color, bg, showText: !!el.showText, text: esc(data) })
        : qrSvg(data, { w: el.w, h: el.h, color, bg });
    }
    if (el.type === 'image') {
      const src = (el.src ?? '').startsWith('data:image/') ? el.src : '';
      return `<img src="${src}" alt="" draggable="false" style="display:block;width:100%;height:100%;object-fit:${el.fit ?? 'cover'};border-radius:${el.radius ?? 0}px">`;
    }
    const w = el.w, h = el.h, sw = el.strokeWidth ?? 0, i = sw / 2;
    const fill = el.fill ? esc(el.fill) : 'none';
    const stroke = sw > 0 ? esc(el.stroke ?? '#000') : 'none';
    let s = '';
    if (el.type === 'rect') s = `<rect x="${i}" y="${i}" width="${Math.max(0, w - sw)}" height="${Math.max(0, h - sw)}" rx="${el.radius ?? 0}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    else if (el.type === 'ellipse') s = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - i)}" ry="${Math.max(0, h / 2 - i)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    else if (el.type === 'triangle') s = `<polygon points="${w / 2},${i} ${w - i},${h - i} ${i},${h - i}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    else if (el.type === 'line') s = `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${esc(el.stroke ?? '#000')}" stroke-width="${Math.max(1, sw)}" stroke-linecap="round"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible">${s}</svg>`;
  }

  /** Cached SafeHtml so the canvas does not re-render every change-detection pass. */
  vis(el: El): SafeHtml {
    const src = el.src ?? '';
    const key = [el.type, el.w, el.h, this.displayText(el, false), el.data === undefined ? '' : this.resolve(el.data), el.showText, el.color, el.fontFamily, el.fontSize, el.bold, el.italic, el.underline, el.align, el.color,
      el.lineHeight, el.letterSpacing, el.fill, el.stroke, el.strokeWidth, el.radius, el.fit,
      el.boxFill, el.boxBorder, el.boxColor, el.boxStyle, el.boxRadius, el.pad, el.header, el.zebra, el.headFill, el.headColor, el.checked, el.round, this.showTokens,
      el.label === undefined ? '' : this.resolve(el.label), el.cells ? JSON.stringify(el.cells.map(r => r.map(c => this.resolve(c)))) : '',
      `${src.length}:${src.slice(0, 40)}:${src.slice(-40)}`].join('|');
    const hit = this.cache.get(el.id);
    if (hit && hit.key === key) return hit.html;
    const html = this.sanitizer.bypassSecurityTrustHtml(this.inner(el));
    this.cache.set(el.id, { key, html });
    return html;
  }

  // ---------- selection & editing ----------
  onStageDown(ev: MouseEvent): void {
    if (ev.button === 1 || ev.button === 2 || this.spacePressed) {
      ev.preventDefault();
      const stage = this.stageArea?.nativeElement;
      if (stage) {
        this.panDrag = {
          sx: ev.clientX,
          sy: ev.clientY,
          sl: stage.scrollLeft,
          st: stage.scrollTop
        };
        stage.style.cursor = 'grabbing';
      }
      return;
    }
    if ((ev.target as HTMLElement).closest('.el')) return;
    if (this.editingId) return;
    this.selectedId = null;
  }

  onStageContextMenu(ev: MouseEvent): void {
    if (!(ev.target as HTMLElement).closest('.el')) {
      ev.preventDefault();
    }
  }

  onStageDblClick(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).closest('.el')) return;
    this.fit();
  }

  onElDown(ev: MouseEvent, el: El): void {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    if (this.editingId === el.id) return;
    if (this.editingId) this.commitEditing();
    this.selectedId = el.id;
    if (el.locked) return;
    this.drag = { mode: 'move', id: el.id, sx: ev.clientX, sy: ev.clientY, o: { ...el }, moved: false };
  }

  onHandleDown(ev: MouseEvent, el: El, handle: string): void {
    ev.stopPropagation(); ev.preventDefault();
    this.drag = { mode: 'resize', id: el.id, sx: ev.clientX, sy: ev.clientY, o: { ...el }, handle, moved: false };
  }

  onRotDown(ev: MouseEvent, el: El): void {
    ev.stopPropagation(); ev.preventDefault();
    this.drag = { mode: 'rotate', id: el.id, sx: ev.clientX, sy: ev.clientY, o: { ...el }, moved: false };
  }

  startEdit(el: El): void {
    if (el.type !== 'text' || el.locked) return;
    this.selectedId = el.id;
    this.editingId = el.id;
    setTimeout(() => {
      const node = document.getElementById('edit-' + el.id);
      if (!node) return;
      node.focus();
      const r = document.createRange(); r.selectNodeContents(node);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
    }, 0);
  }

  endEdit(el: El, ev: FocusEvent): void {
    if (this.editingId !== el.id) return;
    const node = ev.target as HTMLElement;
    el.text = (node.innerText ?? '').replace(/\n$/, '');
    this.editingId = null;
    this.changed(true);
  }

  private commitEditing(): void {
    const id = this.editingId; if (!id) return;
    const node = document.getElementById('edit-' + id);
    const el = this.cur.els.find(e => e.id === id);
    if (node && el) el.text = (node.innerText ?? '').replace(/\n$/, '');
    this.editingId = null;
    this.changed(true);
  }

  // ---------- mouse drag ----------
  @HostListener('document:mousemove', ['$event'])
  onMove(ev: MouseEvent): void {
    if (this.panDrag) {
      const stage = this.stageArea?.nativeElement;
      if (stage) {
        const dx = ev.clientX - this.panDrag.sx;
        const dy = ev.clientY - this.panDrag.sy;
        stage.scrollLeft = this.panDrag.sl - dx;
        stage.scrollTop = this.panDrag.st - dy;
      }
      return;
    }
    const pd = this.panelDrag;
    if (pd) {
      const dx = ev.clientX - pd.sx;
      if (pd.side === 'left') this.leftW = Math.min(520, Math.max(200, Math.round(pd.w + dx)));
      else this.rightW = Math.min(560, Math.max(220, Math.round(pd.w - dx)));
      return;
    }
    const d = this.drag; if (!d) return;
    const el = this.cur.els.find(e => e.id === d.id); if (!el) return;
    const dx = (ev.clientX - d.sx) / this.zoom, dy = (ev.clientY - d.sy) / this.zoom;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2 / this.zoom) return;
    d.moved = true;

    if (d.mode === 'move') {
      let nx = d.o.x + dx, ny = d.o.y + dy;
      const snap = this.snap(el, nx, ny);
      el.x = Math.round(snap.x); el.y = Math.round(snap.y);
      this.guides = snap.guides;
    } else if (d.mode === 'resize') {
      this.resize(el, d.o, d.handle!, dx, dy, ev.shiftKey || el.type === 'image' || el.type === 'qr');
    } else {
      const r = this.pageEl.nativeElement.getBoundingClientRect();
      const cx = r.left + (d.o.x + d.o.w / 2) * this.zoom, cy = r.top + (d.o.y + d.o.h / 2) * this.zoom;
      let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      a = ((a + 180) % 360 + 360) % 360 - 180;
      el.rot = Math.round(a);
    }
  }

  @HostListener('document:mouseup')
  onUp(): void {
    if (this.panDrag) {
      this.panDrag = null;
      const stage = this.stageArea?.nativeElement;
      if (stage) stage.style.cursor = this.spacePressed ? 'grab' : '';
      return;
    }
    if (this.panelDrag) {
      this.panelDrag = null;
      document.body.style.cursor = '';
      try { localStorage.setItem(this.PANELS, JSON.stringify({ l: this.leftW, r: this.rightW })); } catch { /* storage unavailable */ }
      return;
    }
    if (!this.drag) return;
    const moved = this.drag.moved;
    this.drag = null;
    this.guides = { v: [], h: [] };
    if (moved) this.changed(true);
  }

  private snap(el: El, nx: number, ny: number): { x: number; y: number; guides: { v: number[]; h: number[] } } {
    const th = 6 / this.zoom;
    const xs: number[] = [0, this.W / 2, this.W], ys: number[] = [0, this.H / 2, this.H];
    for (const o of this.cur.els) {
      if (o.id === el.id || o.hidden) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const gv: number[] = [], gh: number[] = [];
    let bestX = th + 1, bestY = th + 1, ox = 0, oy = 0;
    for (const p of [0, el.w / 2, el.w]) for (const t of xs) {
      const dd = t - (nx + p); if (Math.abs(dd) < Math.abs(bestX) && Math.abs(dd) <= th) { bestX = dd; ox = t; }
    }
    for (const p of [0, el.h / 2, el.h]) for (const t of ys) {
      const dd = t - (ny + p); if (Math.abs(dd) < Math.abs(bestY) && Math.abs(dd) <= th) { bestY = dd; oy = t; }
    }
    if (Math.abs(bestX) <= th) { nx += bestX; gv.push(ox); }
    if (Math.abs(bestY) <= th) { ny += bestY; gh.push(oy); }
    return { x: nx, y: ny, guides: { v: gv, h: gh } };
  }

  private resize(el: El, o: El, h: string, dx: number, dy: number, keepRatio: boolean): void {
    const MIN = 10, th = o.rot * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
    const ldx = dx * cos + dy * sin, ldy = -dx * sin + dy * cos;
    let l = -o.w / 2, r = o.w / 2, t = -o.h / 2, b = o.h / 2;
    if (h.includes('w')) l += ldx;
    if (h.includes('e')) r += ldx;
    if (h.includes('n')) t += ldy;
    if (h.includes('s')) b += ldy;
    if (r - l < MIN) { if (h.includes('w')) l = r - MIN; else r = l + MIN; }
    if (b - t < MIN) { if (h.includes('n')) t = b - MIN; else b = t + MIN; }
    if (keepRatio && h.length === 2) {
      const nh = (r - l) * o.h / o.w;
      if (h.includes('n')) t = b - nh; else b = t + nh;
    }
    const cxl = (l + r) / 2, cyl = (t + b) / 2;
    const cx = o.x + o.w / 2 + cxl * cos - cyl * sin;
    const cy = o.y + o.h / 2 + cxl * sin + cyl * cos;
    el.w = Math.round(r - l); el.h = Math.round(b - t);
    el.x = Math.round(cx - el.w / 2); el.y = Math.round(cy - el.h / 2);
  }

  // ---------- keyboard ----------
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.saveOpen) { if (e.key === 'Escape') this.saveOpen = false; return; }
    if (this.pdfPending) { if (e.key === 'Escape') this.pdfPending = null; return; }
    if (this.galleryOpen) { if (e.key === 'Escape') this.galleryOpen = false; return; }
    const t = e.target as HTMLElement | null;
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.spacePressed) {
        this.spacePressed = true;
        const stage = this.stageArea?.nativeElement;
        if (stage) stage.style.cursor = 'grab';
      }
      return;
    }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); this.duplicate(); return; }
    if (mod && k === 'c') { const s = this.sel; if (s) this.clip = JSON.parse(JSON.stringify(s)); return; }
    if (mod && k === 'v') { this.paste(); return; }
    const s = this.sel; if (!s) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.remove(); return; }
    if (k === 'escape') { this.selectedId = null; return; }
    if (k === 'enter' && s.type === 'text') { e.preventDefault(); this.startEdit(s); return; }
    const step = e.shiftKey ? 10 : 1;
    const mv: Record<string, [number, number]> = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
    if (mv[k] && !s.locked) { e.preventDefault(); s.x += mv[k][0]; s.y += mv[k][1]; this.changed(); }
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.code !== 'Space') return;
    this.spacePressed = false;
    const stage = this.stageArea?.nativeElement;
    if (stage && !this.panDrag) stage.style.cursor = '';
  }

  // ---------- editing actions ----------
  set(key: string, value: any): void {
    const s = this.sel; if (!s) return;
    if (typeof (s as any)[key] === 'number' || ['x', 'y', 'w', 'h', 'rot', 'fontSize', 'lineHeight', 'letterSpacing', 'strokeWidth', 'radius', 'opacity', 'boxBorder', 'boxRadius', 'pad', 'rowH'].includes(key)) {
      if (value === null || value === '' || isNaN(Number(value))) return;
      value = Number(value);
      if (key === 'w') value = Math.max(10, value);
      if (key === 'h') value = Math.max(4, value);
    }
    (s as any)[key] = value;
    this.changed();
  }

  toggle(key: 'bold' | 'italic' | 'underline' | 'locked' | 'showText'): void {
    const s = this.sel; if (!s) return;
    s[key] = !s[key];
    this.changed(true);
  }

  toggleLayer(el: El, key: 'hidden' | 'locked', ev: Event): void {
    ev.stopPropagation();
    el[key] = !el[key];
    if (key === 'hidden' && el.hidden && this.selectedId === el.id) this.selectedId = null;
    this.changed(true);
  }

  setBg(color: string): void { this.cur.bg = color; this.changed(); }

  setPageSetup(key: 'size' | 'orientation', value: string): void {
    const ow = this.W, oh = this.H;
    this.doc[key] = value;
    const kx = this.W / ow, ky = this.H / oh;
    if (kx !== 1 || ky !== 1) {
      for (const p of this.doc.pages) for (const e of p.els) {
        e.x = Math.round(e.x * kx); e.y = Math.round(e.y * ky);
      }
    }
    this.changed(true);
    setTimeout(() => this.fit(), 0);
  }

  alignTo(where: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const s = this.sel; if (!s) return;
    if (where === 'left') s.x = 0;
    if (where === 'hcenter') s.x = Math.round((this.W - s.w) / 2);
    if (where === 'right') s.x = this.W - s.w;
    if (where === 'top') s.y = 0;
    if (where === 'vcenter') s.y = Math.round((this.H - s.h) / 2);
    if (where === 'bottom') s.y = this.H - s.h;
    this.changed(true);
  }

  order(dir: 'front' | 'back' | 'up' | 'down'): void {
    const s = this.sel; if (!s) return;
    const a = this.cur.els, i = a.indexOf(s);
    a.splice(i, 1);
    let j = i;
    if (dir === 'front') j = a.length; else if (dir === 'back') j = 0;
    else if (dir === 'up') j = Math.min(a.length, i + 1); else j = Math.max(0, i - 1);
    a.splice(j, 0, s);
    this.changed(true);
  }

  duplicate(): void {
    const s = this.sel; if (!s) return;
    const c: El = JSON.parse(JSON.stringify(s)); c.id = uid(); c.x += 20; c.y += 20;
    this.cur.els.push(c); this.selectedId = c.id; this.changed(true);
  }

  paste(): void {
    if (!this.clip) return;
    const c: El = JSON.parse(JSON.stringify(this.clip)); c.id = uid(); c.x += 20; c.y += 20;
    this.clip = c;
    this.cur.els.push(JSON.parse(JSON.stringify(c))); this.selectedId = this.cur.els[this.cur.els.length - 1].id; this.changed(true);
  }

  remove(): void {
    const s = this.sel; if (!s) return;
    this.cur.els = this.cur.els.filter(e => e.id !== s.id);
    this.cache.delete(s.id);
    this.selectedId = null; this.changed(true);
  }

  // ---------- pages ----------
  goPage(i: number): void { if (this.editingId) this.commitEditing(); this.pageIdx = i; this.selectedId = null; }
  addPage(): void { this.doc.pages.push(this.newPage()); this.goPage(this.doc.pages.length - 1); this.changed(true); }
  duplicatePage(): void {
    const copy: Page = JSON.parse(JSON.stringify(this.cur)); copy.id = uid(); copy.els.forEach(e => e.id = uid());
    this.doc.pages.splice(this.pageIdx + 1, 0, copy); this.goPage(this.pageIdx + 1); this.changed(true);
  }
  deletePage(): void {
    if (this.doc.pages.length < 2) return;
    this.doc.pages.splice(this.pageIdx, 1);
    this.pageIdx = Math.min(this.pageIdx, this.doc.pages.length - 1); this.selectedId = null; this.changed(true);
  }

  // ---------- encrypted fields ----------
  encBusy = new Set<string>();
  decResults = new Map<string, string>();
  private passphrases = new Map<string, string>();

  showPass = new Set<string>();
  togglePass(f: Field): void { this.showPass.has(f.id) ? this.showPass.delete(f.id) : this.showPass.add(f.id); }
  pass(f: Field): string { return this.passphrases.get(f.id) ?? ''; }
  setPass(f: Field, v: string): void { this.passphrases.set(f.id, v ?? ''); }

  onSecretChange(f: Field): void {
    f.cipher = '';
    this.decResults.delete(f.id);
    this.changed();
  }

  newPub = '';
  newPubLabel = '';
  get me() { const u = this.auth.getSession(); return { id: u?.userId ?? 'anon', email: u?.email ?? 'me' }; }

  setMaskLast(f: Field, v: any): void {
    const n = Number(v);
    if (v === null || v === '' || isNaN(n)) return;
    f.maskLast = Math.min(12, Math.max(0, Math.round(n)));
    this.changed();
  }

  private invalidateSeal(f: Field): void { f.cipher = ''; this.decResults.delete(f.id); this.changed(true); }

  removeRecipient(f: Field, i: number): void { (f.recipients ?? []).splice(i, 1); this.invalidateSeal(f); }

  async addMeAsRecipient(f: Field): Promise<void> {
    try {
      const kp = await ensureUserKey(this.me.id);
      if ((f.recipients ?? []).some(r => r.pub === kp.pub)) { this.flash('You are already listed.', true); return; }
      (f.recipients ??= []).push({ label: this.me.email, pub: kp.pub });
      this.invalidateSeal(f);
    } catch (e: any) { this.flash(e?.message || 'Could not create your key.', true); }
  }

  async addRecipient(f: Field): Promise<void> {
    const pub = this.newPub.trim();
    try {
      const kid = await keyId(pub);
      if ((f.recipients ?? []).some(r => r.pub === pub)) { this.flash('That key is already listed.', true); return; }
      (f.recipients ??= []).push({ label: this.newPubLabel.trim() || 'Key ' + kid, pub });
      this.newPub = ''; this.newPubLabel = '';
      this.invalidateSeal(f);
    } catch (e: any) { this.flash(e?.message || 'Invalid public key.', true); }
  }

  async encryptField(f: Field): Promise<boolean> {
    const pass = this.pass(f);
    if (!String(f.value ?? '').trim()) { this.flash('Type the value to protect in "' + f.key + '" first.', true); return false; }
    if (!pass && !(f.recipients?.length)) { this.flash('Enter a passphrase or add a recipient for "' + f.key + '" first.', true); return false; }
    this.encBusy.add(f.id);
    try {
      f.cipher = await seal(String(f.value), { pass, recipients: f.recipients });
      this.decResults.delete(f.id);
      this.changed(true);
      return true;
    } catch (e: any) { this.flash(e?.message || 'Could not seal "' + f.key + '".', true); return false; }
    finally { this.encBusy.delete(f.id); }
  }

  async decryptField(f: Field): Promise<void> {
    const pass = this.pass(f);
    this.encBusy.add(f.id);
    try {
      const kp = await ensureUserKey(this.me.id);
      this.decResults.set(f.id, 'Unlocks to: ' + await openSeal(f.cipher ?? '', { pass, privateKeys: [kp.priv] }));
    } catch (e: any) { this.decResults.set(f.id, e?.message || 'Could not unlock.'); }
    finally { this.encBusy.delete(f.id); }
  }

  /** Seals any encrypted field that has a value but no sealed text yet. Returns false if it cannot. */
  private async prepareEncrypted(): Promise<boolean> {
    for (const f of this.fields) {
      if (f.type !== 'encrypted' || f.cipher || !String(f.value ?? '').trim()) continue;
      if (!this.pass(f) && !f.recipients?.length) {
        this.leftTab = 'data';
        this.flash('Enter a passphrase or add a recipient for "' + f.key + '" in the Data tab so it can be sealed.', true);
        return false;
      }
      if (!(await this.encryptField(f))) return false;
    }
    return true;
  }

  /** Hidden text at the bottom of page 1 so the sealed values travel inside the PDF. */
  private sealedEmbedHtml(): string {
    const used = (f: Field) => this.doc.pages.some(p => p.els.some(e => !e.hidden &&
      new RegExp('\\{\\{\\s*' + f.key + '(\\.cipher)?\\s*\\}\\}').test((e.text ?? '') + ' ' + (e.data ?? ''))));
    const list = this.fields.filter(f => f.type === 'encrypted' && f.cipher && f.embed !== false && used(f));
    if (!list.length) return '';
    const txt = list.map(f => SEAL_OPEN + f.cipher + SEAL_CLOSE).join(' ');
    return `<div style="position:absolute;left:4px;bottom:2px;width:${this.W - 8}px;font:1px/1px monospace;color:rgba(0,0,0,0.02);word-break:break-all;pointer-events:none">${esc(txt)}</div>`;
  }

  // ---------- data fields ----------
  get fields(): Field[] { return this.doc.fields ?? (this.doc.fields = []); }
  get canInsert(): boolean { const t = this.sel?.type; return t === 'text' || t === 'barcode' || t === 'qr' || t === 'button' || t === 'checkbox' || t === 'input'; }
  trackF = (_: number, f: Field) => f.id;
  typeName(t: FieldType): string { return FIELD_TYPES.find(x => x.v === t)?.label ?? t; }

  private normalize(d: Doc): Doc {
    d.fields = Array.isArray(d.fields) ? d.fields : [];
    d.locale = d.locale || 'en-US';
    return d;
  }

  addField(): void {
    let n = this.fields.length + 1, key = 'field' + n;
    while (this.fields.some(f => f.key === key)) key = 'field' + (++n);
    this.fields.push({ id: uid(), key, label: key, type: 'text', value: 'Sample text' });
    this.changed(true);
  }

  removeField(f: Field): void {
    this.doc.fields = this.fields.filter(x => x.id !== f.id);
    this.changed(true);
  }

  setFieldType(f: Field, type: FieldType): void {
    f.type = type;
    const defaults: Record<FieldType, any> = {
      text: 'Sample text', number: 0, currency: 0, percent: 0, boolean: 'true', encrypted: '',
      date: new Date().toISOString().slice(0, 10)
    };
    f.value = defaults[type];
    f.cipher = '';
    if (type === 'currency') { f.currency = f.currency || 'USD'; f.decimals = f.decimals ?? 2; }
    if (type === 'number') f.decimals = f.decimals ?? 0;
    if (type === 'percent') f.decimals = f.decimals ?? 0;
    if (type === 'date') f.dateFormat = f.dateFormat || 'dd MMM yyyy';
    if (type === 'boolean') { f.trueLabel = f.trueLabel || 'Yes'; f.falseLabel = f.falseLabel || 'No'; }
    this.changed(true);
  }

  setFieldNum(f: Field, key: 'decimals', v: any): void {
    const n = Number(v);
    if (v === null || v === '' || isNaN(n)) return;
    f[key] = Math.min(8, Math.max(0, Math.round(n)));
    this.changed();
  }

  renameKey(f: Field, input: HTMLInputElement): void {
    const next = input.value.trim();
    const bad = !/^[A-Za-z_][A-Za-z0-9_]*$/.test(next) || this.fields.some(x => x.id !== f.id && x.key === next);
    if (bad) {
      input.value = f.key;
      this.flash('Field names must start with a letter, use only letters, numbers and _, and be unique.', true);
      return;
    }
    if (next === f.key) return;
    const re = new RegExp('\\{\\{\\s*' + f.key + '\\s*\\}\\}', 'g');
    for (const p of this.doc.pages) for (const e of p.els) if (e.type === 'text' && e.text) e.text = e.text.replace(re, '{{' + next + '}}');
    f.key = next; f.label = next;
    this.changed(true);
  }

  insertField(key: string): void {
    const s = this.sel;
    if (!key || !s) return;
    if (s.type === 'barcode' || s.type === 'qr') { s.data = (s.data ?? '') + '{{' + key + '}}'; this.changed(true); return; }
    if (s.type !== 'text' && s.type !== 'button' && s.type !== 'checkbox' && s.type !== 'input') return;
    const cur = s.text ?? '';
    s.text = cur + (cur && !/\s$/.test(cur) ? ' ' : '') + '{{' + key + '}}';
    this.changed(true);
  }

  fieldError(f: Field): string {
    const v = f.value;
    const empty = v === null || v === undefined || v === '';
    if (['number', 'currency', 'percent'].includes(f.type) && !empty && isNaN(Number(v))) return 'Enter a valid number.';
    if (f.type === 'date' && !empty && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'Pick a valid date.';
    return '';
  }

  formatField(f: Field): string {
    if (f.type === 'encrypted') return this.revealing && f.lockPdf ? String(f.value ?? '') : maskValue(String(f.value ?? ''), f.maskLast ?? 4);
    const v = f.value;
    if (v === null || v === undefined || v === '' || this.fieldError(f)) return f.type === 'boolean' && v !== '' && v != null ? this.boolText(f) : '';
    const loc = this.doc.locale || 'en-US';
    const d = f.decimals ?? (f.type === 'currency' ? 2 : 0);
    try {
      switch (f.type) {
        case 'number': return new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v));
        case 'currency': return new Intl.NumberFormat(loc, { style: 'currency', currency: f.currency || 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v));
        case 'percent': return new Intl.NumberFormat(loc, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) / 100);
        case 'date': return this.fmtDate(String(v), f.dateFormat || 'dd MMM yyyy');
        case 'boolean': return this.boolText(f);
        default: return String(v);
      }
    } catch { return String(v); }
  }

  private boolText(f: Field): string { return String(f.value) === 'true' ? (f.trueLabel || 'Yes') : (f.falseLabel || 'No'); }

  private fmtDate(v: string, pattern: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return '';
    const y = m[1], mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    const p2 = (n: number) => String(n).padStart(2, '0');
    switch (pattern) {
      case 'dd/MM/yyyy': return `${p2(d)}/${p2(mo)}/${y}`;
      case 'MM/dd/yyyy': return `${p2(mo)}/${p2(d)}/${y}`;
      case 'yyyy-MM-dd': return `${y}-${p2(mo)}-${p2(d)}`;
      case 'MMMM d, yyyy': return `${MONTHS[mo - 1]} ${d}, ${y}`;
      default: return `${p2(d)} ${MONTHS[mo - 1].slice(0, 3)} ${y}`;
    }
  }

  /** Replaces {{field}} tokens with values formatted for each field's data type. Unknown names stay as typed. */
  private resolve(text: string, fields: Field[] = this.fields): string {
    return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)(\.cipher)?\s*\}\}/g, (m, k, c) => {
      const f = fields.find(x => x.key === k);
      if (!f) return m;
      return c && f.type === 'encrypted' ? (f.cipher || '[not sealed yet]') : this.formatField(f);
    });
  }

  private displayText(el: El, forExport: boolean, fields?: Field[]): string {
    const raw = el.text ?? '';
    return !forExport && !fields && this.showTokens ? raw : this.resolve(raw, fields ?? this.fields);
  }

  private ensureFields(defs: Partial<Field>[]): void {
    for (const d of defs) {
      if (this.fields.some(f => f.key === d.key)) continue;
      this.fields.push({ id: uid(), label: d.key!, key: d.key!, type: d.type ?? 'text', value: d.value ?? '', decimals: d.decimals, currency: d.currency, dateFormat: d.dateFormat });
    }
  }

  // ---------- template gallery ----------
  get gTemplates(): TplDef[] {
    const q = this.gSearch.trim().toLowerCase();
    return TEMPLATES.filter(t => (this.gCat === 'All' || t.category === this.gCat || (t.id === 'blank' && this.gCat === 'Custom')) && (!q || t.name.toLowerCase().includes(q)));
  }
  get gCurrent(): TplDef { return TEMPLATES.find(t => t.id === this.gSel) ?? TEMPLATES[0]; }

  openGallery(id?: string): void {
    if (id) this.gSel = id;
    this.gSize = this.doc.size;
    this.gOrientation = (this.gCurrent.id === 'blank') ? (this.doc.orientation as any || 'Portrait') : this.gCurrent.orientation;
    this.gTitleTouched = false;
    this.gTitle = (this.gCurrent.id === 'blank') ? 'My Custom Template' : this.gCurrent.name;
    this.gCat = 'All';
    this.gSearch = '';
    this.tplCache.clear();
    this.galleryOpen = true;
  }

  selectTpl(t: TplDef): void {
    this.gSel = t.id;
    if (t.id === 'blank') {
      if (!this.gTitleTouched) this.gTitle = 'My Custom Template';
    } else {
      if (!this.gTitleTouched) this.gTitle = t.name;
      this.gOrientation = t.orientation;
    }
    this.tplCache.clear();
  }

  onSettingChanged(): void {
    this.tplCache.clear();
  }

  addBlankAttr(): void {
    const k = this.newAttrKey.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (k && !this.blankAttrs.includes(k)) {
      this.blankAttrs.push(k);
      this.tplCache.clear();
    }
    this.newAttrKey = '';
  }

  removeBlankAttr(idx: number): void {
    this.blankAttrs.splice(idx, 1);
    this.tplCache.clear();
  }

  tpColor(id: string): string {
    const map: Record<string, string> = {
      blank: '#0f172a,#475569',
      invoice: '#2563eb,#60a5fa', report: '#0f172a,#2563eb', resume: '#0d9488,#5eead4', certificate: '#d97706,#fde68a',
      'business-card': '#2563eb,#7c3aed', 'id-card': '#059669,#6ee7b7', agreement: '#475569,#cbd5e1', menu: '#b45309,#fde68a',
      'meeting-minutes': '#1d4ed8,#93c5fd', newsletter: '#db2777,#f9a8d4', voucher: '#7c3aed,#c4b5fd'
    };
    return map[id] ?? '#2563eb,#93c5fd';
  }

  private tplDims(t: TplDef): { W: number; H: number } {
    const [w, h] = PAGE_PX[this.gSize] ?? PAGE_PX['A4'];
    const orientation = (t.id === 'blank') ? this.gOrientation : t.orientation;
    return orientation === 'Landscape' ? { W: h, H: w } : { W: w, H: h };
  }

  private fullField(f: Partial<Field>): Field {
    return { id: uid(), key: f.key!, label: f.label ?? f.key!, type: f.type ?? 'text', value: f.value ?? '', decimals: f.decimals,
      currency: f.currency, dateFormat: f.dateFormat, trueLabel: f.trueLabel, falseLabel: f.falseLabel };
  }

  private buildTpl(t: TplDef): TplResult {
    const { W, H } = this.tplDims(t);
    const color = /^#[0-9a-fA-F]{6}$/.test(this.gColor) ? this.gColor : '#2563eb';
    return t.build({ W, H, color, logo: this.gLogo, title: this.gTitle });
  }

  /** Rendered thumbnail for a template with the current gallery settings (cached). */
  thumb(t: TplDef): { html: SafeHtml; w: number; h: number } {
    const key = [t.id, this.gSize, this.gColor, this.gLogo, this.gOrientation, this.blankAttrs.join(',')].join('|');
    const hit = this.tplCache.get(key);
    if (hit) return hit;
    const { W, H } = this.tplDims(t);
    const r = this.buildTpl(t);
    const fields = r.fields.map(f => this.fullField(f));
    const els = r.els.map(e => this.elOuter(e, fields)).join('');

    const blankPreview = t.id === 'blank' ? `
      <div style="position:absolute;inset:20px;border:2px dashed #94a3b8;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#475569;font-family:Segoe UI,sans-serif;text-align:center;padding:16px;background:#ffffff;">
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="12" y1="18" x2="12" y2="12"></line>
          <line x1="9" y1="15" x2="15" y2="15"></line>
        </svg>
        <div style="font-weight:700;font-size:14pt;color:#0f172a;margin-bottom:3px;">Blank Canvas</div>
        <div style="font-size:8.5pt;color:#64748b;max-width:240px;margin-bottom:10px;">Create your own template from scratch with custom attributes</div>
        <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;max-width:260px;">
          ${this.blankAttrs.map(a => `<span style="display:inline-block;border:1px solid #cbd5e1;border-radius:10px;padding:1px 6px;font-size:7pt;background:#f8fafc;color:#334155;font-family:monospace;">{{${esc(a)}}}</span>`).join('')}
        </div>
      </div>` : '';

    const html = this.sanitizer.bypassSecurityTrustHtml(
      `<div style="position:relative;overflow:hidden;width:${W}px;height:${H}px;background:${esc(r.bg ?? '#ffffff')}">${blankPreview}${els}</div>`);
    const out = { html, w: W, h: H };
    if (this.tplCache.size > 80) this.tplCache.clear();
    this.tplCache.set(key, out);
    return out;
  }

  fitK(i: { w: number; h: number }, bw: number, bh: number): number { return Math.min(bw / i.w, bh / i.h); }

  useTemplate(): void {
    const t = this.gCurrent;
    this.doc.size = this.gSize;
    this.doc.orientation = (t.id === 'blank') ? this.gOrientation : t.orientation;
    this.doc.title = this.gTitle.trim() || t.name;

    if (t.id === 'blank') {
      const els: El[] = [];
      if (this.gLogo) {
        const color = /^#[0-9a-fA-F]{6}$/.test(this.gColor) ? this.gColor : '#111827';
        els.push(...logoEls(50, 50, 60, color));
      }
      this.doc.pages = [{ id: uid(), bg: '#ffffff', els }];
      this.doc.fields = this.blankAttrs.map(k => this.fullField({
        key: k,
        label: k.charAt(0).toUpperCase() + k.slice(1),
        type: k.toLowerCase().includes('date') ? 'date'
            : (k.toLowerCase().includes('amount') || k.toLowerCase().includes('price') || k.toLowerCase().includes('total')) ? 'currency'
            : 'text',
        value: k.toLowerCase().includes('date') ? new Date().toISOString().slice(0, 10)
            : (k.toLowerCase().includes('amount') || k.toLowerCase().includes('price') || k.toLowerCase().includes('total')) ? '0.00'
            : ''
      }));
      this.leftTab = 'elements';
    } else {
      const r = this.buildTpl(t);
      this.doc.pages = [{ id: uid(), bg: r.bg ?? '#ffffff', els: r.els }];
      this.doc.fields = r.fields.map(f => this.fullField(f));
    }

    this.pageIdx = 0; this.selectedId = null; this.editingId = null; this.cache.clear();
    this.galleryOpen = false;
    this.changed(true);
    setTimeout(() => this.fit(), 0);
    this.flash(t.name + ' loaded with ' + this.doc.fields.length + ' attribute(s). Use the left panel to place elements or add more attributes.', false);
  }

  // ---------- zoom ----------
  zoomBy(d: number): void { this.zoom = Math.min(2, Math.max(0.2, Math.round((this.zoom + d) * 10) / 10)); }
  resetZoom(): void { this.zoom = 1; }

  /** Mouse-wheel zoom over the canvas, keeping the point under the cursor in place. */
  onStageWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const stage = this.stageArea?.nativeElement;
    const page = this.pageEl?.nativeElement;
    if (!stage || !page) return;
    const oldZoom = this.zoom;
    const next = Math.min(2, Math.max(0.2, Math.round((oldZoom + (ev.deltaY < 0 ? 0.1 : -0.1)) * 100) / 100));
    if (next === oldZoom) return;
    const before = page.getBoundingClientRect();
    const px = (ev.clientX - before.left) / oldZoom;   // point under cursor, in page units
    const py = (ev.clientY - before.top) / oldZoom;
    this.zoom = next;
    // wait for Angular to re-render at the new zoom, then re-anchor the scroll position
    setTimeout(() => {
      const after = page.getBoundingClientRect();
      stage.scrollLeft += (after.left + px * next) - ev.clientX;
      stage.scrollTop += (after.top + py * next) - ev.clientY;
    }, 0);
  }
  fit(): void {
    const a = this.stageArea?.nativeElement; if (!a) return;
    const k = Math.min((a.clientWidth - 72) / this.W, (a.clientHeight - 72) / this.H);
    this.zoom = Math.min(1.5, Math.max(0.2, Math.round(k * 100) / 100));
  }

  // ---------- history & persistence ----------
  changed(immediate = false): void {
    clearTimeout(this.commitTimer);
    this.commitTimer = null;
    if (immediate) this.pushHistory();
    else this.commitTimer = setTimeout(() => { this.commitTimer = null; this.pushHistory(); }, 350);
  }

  private pushHistory(): void {
    const s = JSON.stringify(this.doc);
    if (this.hist[this.hIdx] === s) return;
    this.hist = this.hist.slice(0, this.hIdx + 1);
    this.hist.push(s);
    if (this.hist.length > 40) this.hist.shift();
    this.hIdx = this.hist.length - 1;
    try { localStorage.setItem(this.STORE, s); }
    catch { this.flash('Your design is too large to auto-save in this browser. Use "Save file" to keep a copy.', true); }
  }

  private flushPending(): void {
    if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; this.pushHistory(); }
  }

  private restore(): void {
    this.doc = this.normalize(JSON.parse(this.hist[this.hIdx]));
    this.pageIdx = Math.min(this.pageIdx, this.doc.pages.length - 1);
    if (!this.cur.els.some(e => e.id === this.selectedId)) this.selectedId = null;
    this.editingId = null;
  }

  undo(): void {
    if (this.editingId) this.commitEditing();
    this.flushPending();
    if (this.hIdx > 0) { this.hIdx--; this.restore(); }
  }

  redo(): void {
    this.flushPending();
    if (this.hIdx < this.hist.length - 1) { this.hIdx++; this.restore(); }
  }

  // ---------- files ----------
  /** Opens the name dialog; the design is stored when the person confirms (same name = update). */
  saveToTemplates(): void {
    if (this.editingId) this.commitEditing();
    this.flushPending();
    this.saveName = (this.doc.title || '').trim();
    this.saveError = '';
    this.saveOpen = true;
    setTimeout(() => {
      const el = document.getElementById('saveNameInput') as HTMLInputElement | null;
      el?.focus(); el?.select();
    });
  }

  saveExists(): boolean {
    const name = this.saveName.trim().toLowerCase();
    return !!name && this.billStore.list().some(t => t.kind === 'design' && t.name.toLowerCase() === name);
  }

  /** Stores the design on the Templates page under the typed name. Bills & Invoices can then fill it once per invoice. */
  confirmSave(): void {
    const name = this.saveName.trim();
    if (!name) return;
    const existing = this.billStore.list().find(t => t.kind === 'design' && t.name.toLowerCase() === name.toLowerCase());
    this.doc.title = name;   // keep the design title and the template name the same
    const saved = this.billStore.save({
      id: existing?.id ?? this.billStore.newId(), name,
      description: existing?.description || 'Designed in the Editor',
      htmlContent: '', kind: 'design', design: JSON.parse(JSON.stringify(this.doc)),
      defaultPageSize: this.doc.size, defaultOrientation: this.doc.orientation
    });
    if (!saved) { this.saveError = 'Could not save: this browser has no room left. Remove a template or a large image and try again.'; return; }
    this.saveOpen = false; this.saveError = '';
    this.flash(existing ? `Template "${name}" updated on the Templates page.` : `Saved to the Templates page as "${name}".`, false);
  }

  exportJson(): void {
    this.flushPending();
    const blob = new Blob([JSON.stringify(this.doc, null, 2)], { type: 'application/json' });
    this.download(blob, (this.doc.title || 'design').replace(/[^\w\- ]+/g, '') + '.design.json');
  }

  openFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (file) void this.openFileObj(file);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const file = ev.dataTransfer?.files?.[0];
    if (file && !this.openBusy) void this.openFileObj(file);
  }

  choosePdf(mode: PdfMode): void {
    const f = this.pdfPending; this.pdfPending = null;
    if (f) void this.openFileObj(f, mode);
  }

  async makeTextEditable(): Promise<void> {
    const img = this.sel;
    if (!img || img.type !== 'image' || !img.src || this.ocrBusy) return;
    if (img.rot) { this.flash('Set the picture rotation to 0 first, then try again.', true); return; }
    const page = this.cur, id = img.id;
    this.ocrBusy = true; this.ocrStatus = 'Starting...';
    try {
      const r = await ocrImage(img.src, this.ocrLang, (t, p) => { this.ocrStatus = t + (p ? ' ' + Math.round(p * 100) + '%' : ''); });
      const idx = this.doc.pages.includes(page) ? page.els.findIndex(e => e.id === id) : -1;
      if (idx < 0) { this.flash('The picture changed while reading. Please try again.', true); return; }
      const el = page.els[idx];
      const fit = el.fit ?? 'cover';
      const s = fit === 'contain' ? Math.min(el.w / r.width, el.h / r.height) : Math.max(el.w / r.width, el.h / r.height);
      const ox = el.x + (el.w - r.width * s) / 2, oy = el.y + (el.h - r.height * s) / 2;
      const ctx = document.createElement('canvas').getContext('2d')!;
      const add: El[] = [];
      for (const l of r.lines) {
        const x = ox + l.x * s, y = oy + l.y * s, w = l.w * s, h = l.h * s;
        if (x + w < el.x || y + h < el.y || x > el.x + el.w || y > el.y + el.h) continue;
        const pad = Math.max(2, h * 0.15);
        add.push(this.mkShape('rect', { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2, fill: l.bg, stroke: l.bg, strokeWidth: 0, radius: 0 }));
        let fs = Math.max(6, h * 0.8);
        ctx.font = `${fs}px Arial`;
        const tw = ctx.measureText(l.text).width;
        if (tw > w * 1.02) fs = Math.max(6, fs * (w / tw));
        fs = Math.round(fs * 10) / 10;
        add.push(this.mkText({ text: l.text, x, y: y + (h - fs * 1.2) / 2, w: w * 1.08 + 6, h: fs * 1.3, fontSize: fs, color: l.color, lineHeight: 1.2 }));
      }
      if (!add.length) { this.flash('No readable text was found in this picture. Try a clearer or larger picture, or pick another language.', true); return; }
      page.els.splice(idx + 1, 0, ...add);
      this.selectedId = null; this.cache.clear();
      this.changed(true);
      this.flash(add.length / 2 + ' lines of text are now editable. Click any line to change it. Press Undo to go back.', false);
    } catch (e: any) {
      this.flash('Could not read the text: ' + (e?.message || 'unknown error'), true);
    } finally {
      this.ocrBusy = false; this.ocrStatus = '';
    }
  }

  private async openFileObj(file: File, pdfMode?: PdfMode): Promise<void> {
    if (this.openBusy) return;
    if (this.editingId) this.commitEditing();
    if (isPdf(file) && !pdfMode) { this.pdfPending = file; return; }
    if (isDesignJson(file)) { this.readDesignJson(file); return; }
    this.openBusy = true;
    this.flash('Opening ' + file.name + '...', false);
    try {
      const r = await importFile(file, pdfMode ?? 'image');
      this.flushPending();
      this.doc = this.normalize({ title: r.title, size: r.size, orientation: r.orientation, pages: r.pages, fields: [], locale: this.doc.locale });
      this.pageIdx = 0; this.selectedId = null; this.editingId = null; this.cache.clear();
      this.changed(true);
      setTimeout(() => this.fit(), 0);
      this.flash(file.name + ' opened. ' + (r.note ?? '') + ' Press Undo to go back to your previous design.', false);
    } catch (e: any) {
      this.flash(e?.message || 'Could not open that file.', true);
    } finally {
      this.openBusy = false;
    }
  }

  private readDesignJson(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(String(reader.result));
        if (!d || !Array.isArray(d.pages) || !d.pages.length || !PAGE_PX[d.size]) throw new Error('bad');
        this.doc = this.normalize(d); this.pageIdx = 0; this.selectedId = null; this.cache.clear();
        this.changed(true);
        setTimeout(() => this.fit(), 0);
        this.flash('Design opened.', false);
      } catch { this.flash('That file is not a valid design file.', true); }
    };
    reader.readAsText(file);
  }

  private download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------- PDF export ----------
  private elOuter(e: El, fields?: Field[]): string {
    return `<div class="e" style="position:absolute;left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;transform:rotate(${e.rot}deg);opacity:${e.opacity}">${this.inner(e, true, fields)}</div>`;
  }

  private buildHtml(): string {
    const css = `<style>*{box-sizing:border-box}html,body{margin:0;padding:0}.pg{position:relative;overflow:hidden;width:${this.W}px;height:${this.H}px;`
      + 'page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}.e{position:absolute}</style>';
    const embed = this.sealedEmbedHtml();
    const pages = this.doc.pages.map((p, i) => {
      const els = p.els.filter(e => !e.hidden).map(e => this.elOuter(e)).join('');
      return `<div class="pg" style="background:${esc(p.bg)}">${els}${i === 0 ? embed : ''}</div>`;
    }).join('');
    return css + pages;
  }

  async downloadPdf(): Promise<void> {
    if (this.editingId) this.commitEditing();
    if (!(await this.prepareEncrypted())) return;
    const locks = this.fields.filter(f => f.type === 'encrypted' && f.lockPdf);
    const lock = locks[0];
    const openPass = lock ? this.pass(lock) : '';
    if (lock) {
      const missing = locks.find(f => !this.pass(f));
      const differ = locks.find(f => this.pass(f) !== openPass);
      if (missing || differ) {
        this.leftTab = 'data';
        this.flash(missing
          ? 'Enter the passphrase for "' + missing.key + '" in the Data tab. The PDF will ask for it when opened.'
          : 'The fields ' + locks.map(f => '"' + f.key + '"').join(' and ') + ' all lock the PDF, so they must use the same passphrase. Use one passphrase, or untick the box on one of them.', true);
        return;
      }
    }
    this.revealing = !!lock;
    let html: string;
    try { html = this.buildHtml(); } finally { this.revealing = false; }
    this.busy = true; this.message = '';
    this.api.generatePdf({
      htmlContent: html,
      doNotSave: !!lock,
      title: this.doc.title || 'Untitled design',
      pageSize: this.doc.size,
      orientation: this.doc.orientation,
      marginTopMm: 0, marginBottomMm: 0, marginLeftMm: 0, marginRightMm: 0,
      printBackground: true,
      async: false
    }).subscribe({
      next: async (result: any) => {
        if (result instanceof Blob && lock) {
          try { result = await lockPdf(result, openPass); }
          catch (e: any) { this.busy = false; this.flash('Could not lock the PDF: ' + (e?.message || e), true); return; }
        }
        this.busy = false;
        if (result instanceof Blob) {
          this.download(result, (this.doc.title || 'design').replace(/[^\w\- ]+/g, '') + '.pdf');
          this.flash(lock ? 'PDF downloaded. Open it with the passphrase "' + openPass[0] + '•'.repeat(Math.max(0, openPass.length - 2)) + openPass.slice(-1) + '" (' + openPass.length + ' characters). It cannot be recovered if lost. No copy is stored in Documents.' : 'PDF generated and downloaded. A copy is also in Documents.', false);
        }
      },
      error: async (err: any) => {
        this.busy = false;
        let detail: string = err?.error?.message || err?.message || 'API connection error';
        try {
          if (err?.error instanceof Blob) { const b = JSON.parse(await err.error.text()); if (b?.message) detail = b.message; }
        } catch { /* keep generic */ }
        this.flash('Generation failed: ' + detail, true);
      }
    });
  }

  private flash(text: string, error: boolean): void {
    this.message = text; this.isError = error;
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.message = '', error ? 8000 : 4000);
  }
}