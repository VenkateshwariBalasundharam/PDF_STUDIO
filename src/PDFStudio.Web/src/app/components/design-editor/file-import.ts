// Opens many file types as editable designs. Everything here is dependency-free except PDF,
// which loads pdf.js on demand. Used by the Editor's single "Open" button.
import { El, ElType, Page, PAGE_PX, uid } from './design-model';
import { sampleColors } from './image-ocr';

export interface ImportResult {
  title: string;
  size: string;
  orientation: 'Portrait' | 'Landscape';
  pages: Page[];
  note?: string;
}
export type PdfMode = 'image' | 'text' | 'overlay';

export const OPEN_ACCEPT = '.json,.pdf,.docx,.xlsx,.xlsm,.pptx,.csv,.tsv,.txt,.md,.markdown,.html,.htm,.svg,.png,.jpg,.jpeg,.gif,.webp,.bmp';
export const SUPPORTED_LABEL = 'Design (.json), PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), CSV, text, Markdown, HTML, SVG and images';

// ---------- element factories ----------
const mk = (type: ElType, o: Partial<El>): El => ({ id: uid(), type, x: 0, y: 0, w: 100, h: 40, rot: 0, opacity: 1, ...o });
const mkText = (text: string, o: Partial<El>): El => mk('text', {
  text, fontFamily: 'Arial', fontSize: 14, bold: false, italic: false, underline: false,
  align: 'left', color: '#0f172a', lineHeight: 1.35, letterSpacing: 0, ...o
});

// ---------- block model + flow layout ----------
type Block =
  | { k: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'pre'; text: string }
  | { k: 'table'; rows: string[][] }
  | { k: 'img'; src: string; w: number; h: number }
  | { k: 'hr' }
  | { k: 'break' };

const STYLE: Record<string, { fs: number; bold: boolean; gap: number; font: string; color: string }> = {
  h1: { fs: 30, bold: true, gap: 14, font: 'Arial', color: '#0f172a' },
  h2: { fs: 23, bold: true, gap: 12, font: 'Arial', color: '#0f172a' },
  h3: { fs: 18, bold: true, gap: 10, font: 'Arial', color: '#1e293b' },
  p: { fs: 14, bold: false, gap: 10, font: 'Arial', color: '#1e293b' },
  li: { fs: 14, bold: false, gap: 5, font: 'Arial', color: '#1e293b' },
  pre: { fs: 12, bold: false, gap: 10, font: 'Courier New', color: '#1e293b' }
};

function wrapLines(text: string, width: number, fs: number, mono: boolean): number {
  const cw = fs * (mono ? 0.6 : 0.52);
  const per = Math.max(4, Math.floor(width / cw));
  let n = 0;
  for (const line of text.split('\n')) n += Math.max(1, Math.ceil(line.length / per));
  return n;
}

const MAX_TABLE_ROWS = 1500;

function pageDims(size: string, landscape: boolean): [number, number] {
  const [w, h] = PAGE_PX[size];
  return landscape ? [h, w] : [w, h];
}

export function layoutBlocks(blocks: Block[], size: string, landscape: boolean): { pages: Page[]; truncated: boolean } {
  const [W, H] = pageDims(size, landscape);
  const M = 56, cw = W - M * 2, bottom = H - M;
  const pages: Page[] = [];
  let els: El[] = [];
  let y = M;
  let truncated = false;
  const flush = () => { pages.push({ id: uid(), bg: '#ffffff', els }); els = []; y = M; };
  const ensure = (hgt: number) => { if (y + hgt > bottom && els.length) flush(); };

  for (const b of blocks) {
    if (b.k === 'break') { if (els.length) flush(); continue; }
    if (b.k === 'hr') {
      ensure(20);
      els.push(mk('line', { x: M, y: y + 6, w: cw, h: 2, stroke: '#cbd5e1', strokeWidth: 1 }));
      y += 20; continue;
    }
    if (b.k === 'img') {
      const k = Math.min(1, cw / b.w, (bottom - M) / b.h);
      const w = Math.max(20, b.w * k), h = Math.max(20, b.h * k);
      ensure(h + 10);
      els.push(mk('image', { src: b.src, x: M, y, w, h, fit: 'contain', radius: 0 }));
      y += h + 12; continue;
    }
    if (b.k === 'table') {
      const rows = b.rows.slice(0, MAX_TABLE_ROWS);
      if (b.rows.length > MAX_TABLE_ROWS) truncated = true;
      const cols = Math.max(1, ...rows.map(r => r.length));
      const weights = Array.from({ length: cols }, (_, c) =>
        Math.min(28, Math.max(5, ...rows.slice(0, 200).map(r => (r[c] ?? '').length))));
      const total = weights.reduce((a, c) => a + c, 0);
      const widths = weights.map(wt => (cw * wt) / total);
      const xs: number[] = []; let acc = M;
      for (const w of widths) { xs.push(acc); acc += w; }
      const fs = cols > 8 ? 10 : 12;
      const rowH = (r: string[]) => Math.max(...r.map((t, c) => wrapLines(t, widths[c] - 10, fs, false)), 1) * fs * 1.3 + 12;
      const header = rows[0];
      const drawRow = (r: string[], isHead: boolean) => {
        const h = rowH(r);
        if (isHead) els.push(mk('rect', { x: M, y, w: cw, h, fill: '#e2e8f0', stroke: '#e2e8f0', strokeWidth: 0, radius: 0 }));
        for (let c = 0; c < cols; c++) {
          const t = r[c] ?? '';
          if (t === '') continue;
          els.push(mkText(t, { x: xs[c] + 5, y: y + 6, w: widths[c] - 10, h: h - 8, fontSize: fs, bold: isHead, lineHeight: 1.3 }));
        }
        els.push(mk('line', { x: M, y: y + h, w: cw, h: 1, stroke: '#cbd5e1', strokeWidth: 1 }));
        y += h;
      };
      rows.forEach((r, i) => {
        const h = rowH(r);
        if (y + h > bottom && els.length) { flush(); if (i > 0 && header) drawRow(header, true); }
        drawRow(r, i === 0);
      });
      y += 14; continue;
    }
    // text blocks
    const st = STYLE[b.k];
    const indent = b.k === 'li' ? 18 : 0;
    const width = cw - indent;
    let text = b.k === 'li' ? '•  ' + b.text : b.text;
    // very long blocks are split across pages
    while (true) {
      const lh = st.fs * 1.35;
      const room = Math.floor((bottom - y) / lh);
      const total = wrapLines(text, width, st.fs, b.k === 'pre');
      if (total <= room || room < 2) {
        if (room < 2 && els.length) { flush(); continue; }
        els.push(mkText(text, { x: M + indent, y, w: width, h: total * lh + 4, fontSize: st.fs, bold: st.bold,
          fontFamily: st.font, color: st.color, lineHeight: 1.35 }));
        y += total * lh + st.gap;
        break;
      }
      // take as many words as fit in `room` lines
      const per = Math.max(4, Math.floor(width / (st.fs * (b.k === 'pre' ? 0.6 : 0.52))));
      let cut = Math.min(text.length, room * per);
      const sp = text.lastIndexOf(' ', cut);
      if (sp > cut * 0.6) cut = sp;
      const head = text.slice(0, cut), rest = text.slice(cut).trimStart();
      els.push(mkText(head, { x: M + indent, y, w: width, h: room * lh + 4, fontSize: st.fs, bold: st.bold,
        fontFamily: st.font, color: st.color, lineHeight: 1.35 }));
      flush();
      if (!rest) break;
      text = rest;
    }
  }
  if (els.length || !pages.length) flush();
  return { pages, truncated };
}

function fromBlocks(title: string, blocks: Block[], landscape = false, size = 'A4', note = ''): ImportResult {
  const r = layoutBlocks(blocks, size, landscape);
  const warn = r.truncated ? ` Only the first ${MAX_TABLE_ROWS} table rows were imported.` : '';
  return { title, size, orientation: landscape ? 'Landscape' : 'Portrait', pages: r.pages, note: (note + warn).trim() || undefined };
}

// ---------- ZIP reader (DOCX / XLSX / PPTX are zip files) ----------
interface ZEntry { name: string; method: number; csize: number; offset: number; }

function readZipDirectory(buf: Uint8Array): ZEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid Office file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZEntry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    out.push({ name: dec.decode(buf.subarray(p + 46, p + 46 + nlen)), method, csize, offset });
    p += 46 + nlen + elen + clen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(data as unknown as BufferSource).catch(() => { /* surfaced by the read below */ });
  w.close().catch(() => { /* surfaced by the read below */ });
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

class Zip {
  private entries: ZEntry[];
  constructor(private buf: Uint8Array) { this.entries = readZipDirectory(buf); }
  names(): string[] { return this.entries.map(e => e.name); }
  async bytes(name: string): Promise<Uint8Array | null> {
    const e = this.entries.find(x => x.name === name);
    if (!e) return null;
    const dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
    const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
    const raw = this.buf.subarray(start, start + e.csize);
    if (e.method === 0) return raw;
    if (e.method === 8) return inflateRaw(raw);
    throw new Error('Unsupported compression in this file.');
  }
  async text(name: string): Promise<string | null> {
    const b = await this.bytes(name);
    return b ? new TextDecoder('utf-8').decode(b) : null;
  }
}

// ---------- tiny XML helpers (regex based; enough for Office text) ----------
const unxml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&amp;/g, '&');

function runsText(xml: string, tag: string): string {
  // joins <tag>text</tag>, with tabs and line breaks in word processing XML
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<w:tab\\s*/>|<w:br\\s*/>|<w:cr\\s*/>`, 'g');
  let out = '', m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('<w:tab')) out += '\t';
    else if (m[0].startsWith('<w:br') || m[0].startsWith('<w:cr')) out += '\n';
    else out += unxml(m[1]);
  }
  return out;
}

// ---------- DOCX ----------
async function importDocx(buf: Uint8Array, title: string): Promise<ImportResult> {
  const zip = new Zip(buf);
  const xml = await zip.text('word/document.xml');
  if (!xml) throw new Error('This Word file has no readable content.');
  const blocks: Block[] = [];
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  let wide = false;
  while ((m = re.exec(xml))) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl>')) {
      const rows = (chunk.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map(tr =>
        (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map(tc => runsText(tc, 'w:t').trim()));
      if (rows.length) { blocks.push({ k: 'table', rows }); if (Math.max(...rows.map(r => r.length)) > 6) wide = true; }
      continue;
    }
    if (/<w:br\s+w:type="page"\s*\/>/.test(chunk)) blocks.push({ k: 'break' });
    const text = runsText(chunk, 'w:t').replace(/\s+$/, '');
    if (!text.trim()) continue;
    const style = /<w:pStyle w:val="([^"]+)"/.exec(chunk)?.[1] ?? '';
    if (/^(Title|Heading1)$/i.test(style)) blocks.push({ k: 'h1', text });
    else if (/^Heading2$/i.test(style)) blocks.push({ k: 'h2', text });
    else if (/^Heading[3-9]$/i.test(style) || /^Subtitle$/i.test(style)) blocks.push({ k: 'h3', text });
    else if (/<w:numPr>/.test(chunk) || /^List/i.test(style)) blocks.push({ k: 'li', text });
    else blocks.push({ k: 'p', text });
  }
  if (!blocks.length) throw new Error('This Word file has no text to import.');
  return fromBlocks(title, blocks, wide, 'A4', 'Text and tables were imported. Pictures and exact fonts inside the Word file are not carried over.');
}

// ---------- XLSX ----------
const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function importXlsx(buf: Uint8Array, title: string): Promise<ImportResult> {
  const zip = new Zip(buf);
  const shared: string[] = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    shared.push(unxml((si.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) ?? []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
  }
  const wb = await zip.text('xl/workbook.xml');
  const sheetNames = wb ? [...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(x => unxml(x[1])) : [];
  const files = zip.names().filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  if (!files.length) throw new Error('This Excel file has no worksheets.');
  const blocks: Block[] = [];
  let maxCols = 0;
  for (let si = 0; si < files.length; si++) {
    const xml = (await zip.text(files[si])) ?? '';
    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row: string[] = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1], inner = cm[2] ?? '';
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
        let val = '';
        if (t === 'inlineStr') val = unxml((inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? []).map(x => x.replace(/<[^>]+>/g, '')).join(''));
        else {
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
          val = t === 's' ? (shared[parseInt(v, 10)] ?? '') : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : unxml(v);
        }
        const ci = ref ? colIndex(ref) : row.length;
        while (row.length < ci) row.push('');
        row[ci] = val;
      }
      rows.push(row);
    }
    while (rows.length && rows[rows.length - 1].every(c => !c)) rows.pop();
    if (!rows.length) continue;
    maxCols = Math.max(maxCols, ...rows.map(r => r.length));
    if (files.length > 1) blocks.push({ k: 'h3', text: sheetNames[si] || 'Sheet ' + (si + 1) });
    blocks.push({ k: 'table', rows });
    if (si < files.length - 1) blocks.push({ k: 'break' });
  }
  if (!blocks.length) throw new Error('This Excel file is empty.');
  return fromBlocks(title, blocks, maxCols > 6, 'A4', 'Cell values were imported as text (formulas show their last saved result; dates may appear as serial numbers).');
}

// ---------- PPTX ----------
async function importPptx(buf: Uint8Array, title: string): Promise<ImportResult> {
  const zip = new Zip(buf);
  const files = zip.names().filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  if (!files.length) throw new Error('This PowerPoint file has no slides.');
  const [W, H] = pageDims('A4', true);
  const pages: Page[] = [];
  for (const f of files) {
    const xml = (await zip.text(f)) ?? '';
    const paras = (xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [])
      .map(p => unxml((p.match(/<a:t>[\s\S]*?<\/a:t>|<a:t\/>/g) ?? []).map(t => t.replace(/<[^>]+>/g, '')).join('')).trim())
      .filter(Boolean);
    const els: El[] = [];
    if (paras.length) {
      els.push(mkText(paras[0], { x: 56, y: 48, w: W - 112, h: 70, fontSize: 36, bold: true, color: '#0f172a', lineHeight: 1.2 }));
      if (paras.length > 1) {
        const body = paras.slice(1).map(t => '•  ' + t).join('\n');
        els.push(mkText(body, { x: 64, y: 140, w: W - 128, h: H - 190, fontSize: 20, color: '#1e293b', lineHeight: 1.5 }));
      }
    }
    pages.push({ id: uid(), bg: '#ffffff', els });
  }
  return { title, size: 'A4', orientation: 'Landscape', pages, note: 'Slide text was imported (one page per slide). Slide pictures and shapes are not carried over.' };
}

// ---------- CSV / TSV ----------
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', '\t', ';'].map(d => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function importCsv(text: string, title: string): ImportResult {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('This file is empty.');
  return fromBlocks(title, [{ k: 'table', rows }], Math.max(...rows.map(r => r.length)) > 6);
}

// ---------- plain text / Markdown ----------
export function parseMarkdown(text: string, markdown: boolean): Block[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const blocks: Block[] = [];
  let para: string[] = [];
  let code: string[] | null = null;
  const clean = (s: string) => markdown
    ? s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/`([^`]+)`/g, '$1')
    : s;
  const endPara = () => { if (para.length) { blocks.push({ k: 'p', text: para.join(markdown ? ' ' : '\n') }); para = []; } };
  for (const raw of lines) {
    if (markdown && /^\s*```/.test(raw)) {
      if (code) { blocks.push({ k: 'pre', text: code.join('\n') }); code = null; } else { endPara(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }
    if (!raw.trim()) { endPara(); continue; }
    if (markdown) {
      const h = /^(#{1,6})\s+(.*)$/.exec(raw);
      if (h) { endPara(); blocks.push({ k: h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3', text: clean(h[2].trim()) }); continue; }
      const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw);
      if (li) { endPara(); blocks.push({ k: 'li', text: clean(li[1]) }); continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) { endPara(); blocks.push({ k: 'hr' }); continue; }
    }
    para.push(clean(raw.trimEnd()));
  }
  if (code) blocks.push({ k: 'pre', text: code.join('\n') });
  endPara();
  return blocks;
}

function importText(text: string, title: string, markdown: boolean): ImportResult {
  const blocks = parseMarkdown(text, markdown);
  if (!blocks.length) throw new Error('This file is empty.');
  return fromBlocks(title, blocks);
}

// ---------- HTML ----------
function importHtml(html: string, title: string): ImportResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,template,head').forEach(n => n.remove());
  const blocks: Block[] = [];
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const walk = (node: Element): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const t = norm(child.textContent ?? '');
        if (t) blocks.push({ k: 'p', text: t });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element, tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) { const t = norm(el.textContent ?? ''); if (t) blocks.push({ k: tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3', text: t }); }
      else if (tag === 'p' || tag === 'blockquote' || tag === 'figcaption') { const t = norm(el.textContent ?? ''); if (t) blocks.push({ k: 'p', text: t }); }
      else if (tag === 'pre') { const t = (el.textContent ?? '').replace(/\s+$/, ''); if (t) blocks.push({ k: 'pre', text: t }); }
      else if (tag === 'ul' || tag === 'ol') el.querySelectorAll(':scope > li').forEach(li => { const t = norm(li.textContent ?? ''); if (t) blocks.push({ k: 'li', text: t }); });
      else if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th,td')).map(c => norm(c.textContent ?? '')));
        if (rows.length) blocks.push({ k: 'table', rows });
      } else if (tag === 'hr') blocks.push({ k: 'hr' });
      else if (tag === 'img') {
        const src = el.getAttribute('src') ?? '';
        if (src.startsWith('data:image/')) blocks.push({ k: 'img', src, w: 400, h: 300 });
      } else walk(el);
    }
  }
  walk(doc.body);
  if (!blocks.length) throw new Error('This HTML file has no readable text.');
  const pageTitle = norm(doc.title || '');
  const wide = blocks.some(b => b.k === 'table' && Math.max(...b.rows.map(r => r.length)) > 6);
  return fromBlocks(pageTitle || title, blocks, wide, 'A4',
    'The text, lists and tables were imported. CSS styling and pictures from web addresses are not carried over.');
}

// ---------- images / SVG ----------
function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read that image.'));
    img.src = url;
  });
}

async function importImage(file: File, title: string): Promise<ImportResult> {
  let url = await readAsDataUrl(file);
  if (file.name.toLowerCase().endsWith('.svg') && !url.startsWith('data:image/svg+xml')) {
    url = 'data:image/svg+xml;base64,' + url.split(',')[1];
  }
  if (!url.startsWith('data:image/')) throw new Error('That file is not a supported image.');
  const img = await loadImage(url);
  const nw = img.naturalWidth || 800, nh = img.naturalHeight || 600;
  let src = url;
  const isSvg = url.startsWith('data:image/svg+xml');
  if (!isSvg && Math.max(nw, nh) > 2000) {
    const k = 2000 / Math.max(nw, nh);
    const c = document.createElement('canvas');
    c.width = Math.round(nw * k); c.height = Math.round(nh * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    src = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.92);
  }
  const landscape = nw > nh;
  const [W, H] = pageDims('A4', landscape);
  const m = 24, k = Math.min((W - m * 2) / nw, (H - m * 2) / nh);
  const w = Math.round(nw * k), h = Math.round(nh * k);
  const el = mk('image', { src, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, fit: 'contain', radius: 0 });
  return { title, size: 'A4', orientation: landscape ? 'Landscape' : 'Portrait', pages: [{ id: uid(), bg: '#ffffff', els: [el] }] };
}

// ---------- exact overlay: page picture + editable text on the real text positions ----------
export interface Run { str: string; x: number; base: number; fs: number; w: number; font: string; }
export interface FontInfo { family: string; bold: boolean; italic: boolean; }

/** Joins neighbouring pieces of the same line and font into one editable run. Positions are in page units, y = baseline. */
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const p = out[out.length - 1];
    if (p && p.font === r.font && Math.abs(p.base - r.base) < p.fs * 0.2 && Math.abs(p.fs - r.fs) < p.fs * 0.15) {
      const gap = r.x - (p.x + p.w);
      if (gap > -p.fs * 0.3 && gap < p.fs * 0.6) {
        const space = gap > p.fs * 0.12 && !/\s$/.test(p.str) && !/^\s/.test(r.str);
        p.str += (space ? ' ' : '') + r.str;
        p.w = Math.max(p.w, r.x + r.w - p.x);
        continue;
      }
    }
    out.push({ ...r });
  }
  return out;
}

export function fontInfoFromName(name: string): FontInfo {
  const bold = /bold|black|heavy|semibold|demi/i.test(name);
  const italic = /italic|oblique|-it\b|ital/i.test(name);
  let family = 'Arial';
  if (/courier|mono|consol|typewriter/i.test(name)) family = 'Courier New';
  else if (!/sans/i.test(name) && /times|serif|roman|georgia|palatino|garamond|cmr|lmroman|minion|book/i.test(name)) family = 'Times New Roman';
  return { family, bold, italic };
}

const STACKS: Record<string, string> = {
  'Arial': 'Arial, Helvetica, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Courier New': "'Courier New', Courier, monospace"
};

export interface OverlayCtx {
  k: number;           // page units -> design pixels
  scale: number;       // page units -> picture pixels
  pixels: Uint8ClampedArray; cw: number; ch: number;
  fontOf: (fontName: string) => FontInfo;
  measure: (text: string, font: string) => number;
}

/** Cover patches (background colour) first, then editable text on top, so nothing hides a neighbour. */
export function overlayElements(runs: Run[], c: OverlayCtx): El[] {
  const patches: El[] = [], texts: El[] = [];
  for (const r of mergeRuns(runs)) {
    const str = r.str.replace(/\s+$/, '');
    if (!str.trim()) continue;
    const fi = c.fontOf(r.font);
    const fs = r.fs * c.k, x = r.x * c.k, w = r.w * c.k, baseY = r.base * c.k;
    const col = sampleColors(c.pixels, c.cw, c.ch, (r.x - 1) * c.scale, (r.base - 0.95 * r.fs) * c.scale,
      (r.x + r.w + 1) * c.scale, (r.base + 0.28 * r.fs) * c.scale);
    patches.push(mk('rect', { x: x - 1.5, y: baseY - 0.97 * fs, w: w + 3, h: 1.25 * fs, fill: col.bg, stroke: col.bg, strokeWidth: 0, radius: 0 }));
    const font = `${fi.bold ? '700 ' : ''}${fi.italic ? 'italic ' : ''}${fs}px ${STACKS[fi.family]}`;
    const tw = c.measure(str, font);
    let ls = (w - tw) / Math.max(1, str.length);
    ls = Math.max(-fs * 0.12, Math.min(fs * 0.25, ls));
    texts.push(mkText(str, { x, y: baseY - 0.95 * fs, w: w * 1.1 + 4, h: fs * 1.25, fontSize: Math.round(fs * 10) / 10,
      fontFamily: fi.family, bold: fi.bold, italic: fi.italic, color: col.color, lineHeight: 1.2, letterSpacing: Math.round(ls * 100) / 100 }));
  }
  return [...patches, ...texts];
}

// ---------- PDF (pdf.js, loaded only when needed) ----------
const PDF_SIZES: Record<string, [number, number]> = { A4: [595, 842], Letter: [612, 792], Legal: [612, 1008] };

function closestSize(wPt: number, hPt: number): { size: string; landscape: boolean } {
  const landscape = wPt > hPt;
  const w = Math.min(wPt, hPt), h = Math.max(wPt, hPt);
  let best = 'A4', d = Infinity;
  for (const [name, [pw, ph]] of Object.entries(PDF_SIZES)) {
    const dist = Math.abs(pw - w) + Math.abs(ph - h);
    if (dist < d) { d = dist; best = name; }
  }
  return { size: best, landscape };
}

async function importPdf(file: File, title: string, mode: PdfMode): Promise<ImportResult> {
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.js';
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf: any;
  try { pdf = await pdfjs.getDocument({ data }).promise; }
  catch (e: any) {
    if (e?.name === 'PasswordException') throw new Error('This PDF is password protected. Remove the password first, then open it again.');
    throw new Error('Could not read this PDF. It may be damaged.');
  }
  const MAX_PAGES = 60;
  const count = Math.min(pdf.numPages, MAX_PAGES);
  const first = await pdf.getPage(1);
  const v0 = first.getViewport({ scale: 1 });
  const { size, landscape } = closestSize(v0.width, v0.height);
  const [W, H] = pageDims(size, landscape);
  const pages: Page[] = [];
  let textBoxes = 0;
  for (let i = 1; i <= count; i++) {
    const page = i === 1 ? first : await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const k = W / vp.width;
    const els: El[] = [];
    if (mode === 'image' || mode === 'overlay') {
      const scale = Math.min(2.5, Math.max(1.2, 1600 / Math.max(vp.width, vp.height) * 1.5));
      const v = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(v.width); c.height = Math.round(v.height);
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: v }).promise;
      els.push(mk('image', { src: c.toDataURL('image/jpeg', 0.9), x: 0, y: 0, w: W, h: Math.round(vp.height * k), fit: 'cover', radius: 0, locked: true }));
      if (mode === 'overlay') {
        const tc = await page.getTextContent();
        const runs: Run[] = [];
        for (const it of tc.items as any[]) {
          const str: string = it.str ?? '';
          if (!str.trim()) continue;
          const tx: number[] = pdfjs.Util.transform(vp.transform, it.transform);
          if (Math.abs(tx[1]) > 0.05 * Math.abs(tx[0]) || Math.abs(tx[2]) > 0.05 * Math.abs(tx[3])) continue; // rotated text stays in the picture
          const fsv = Math.hypot(tx[2], tx[3]);
          if (fsv < 3) continue;
          runs.push({ str, x: tx[4], base: tx[5], fs: fsv, w: Math.max(0, (it.width ?? 0)), font: String(it.fontName ?? '') });
        }
        const fontCache = new Map<string, FontInfo>();
        const fontOf = (name: string): FontInfo => {
          let f = fontCache.get(name);
          if (!f) {
            let real = '';
            try { real = String(page.commonObjs.get(name)?.name ?? ''); } catch { /* font not resolved */ }
            const fam = String(tc.styles?.[name]?.fontFamily ?? '');
            f = fontInfoFromName(real + ' ' + fam);
            fontCache.set(name, f);
          }
          return f;
        };
        const mctx = document.createElement('canvas').getContext('2d')!;
        const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        const added = overlayElements(runs, { k, scale, pixels, cw: c.width, ch: c.height, fontOf,
          measure: (t, f) => { mctx.font = f; return mctx.measureText(t).width; } });
        textBoxes += added.length;
        els.push(...added);
      }
    } else {
      const tc = await page.getTextContent();
      for (const it of tc.items as any[]) {
        const str: string = it.str ?? '';
        if (!str.trim()) continue;
        const tr = it.transform as number[];
        const fs = Math.max(6, Math.hypot(tr[2], tr[3]) * k);
        const x = tr[4] * k, yTop = (vp.height - tr[5]) * k - fs;
        const w = Math.max(10, (it.width ?? str.length * fs * 0.5) * k + 6);
        const font = String(it.fontName ?? '');
        els.push(mkText(str, { x, y: Math.max(0, yTop), w, h: fs * 1.3, fontSize: Math.round(fs * 10) / 10, lineHeight: 1.1,
          bold: /bold/i.test(font), italic: /italic|oblique/i.test(font) }));
      }
    }
    pages.push({ id: uid(), bg: '#ffffff', els });
  }
  const extra = pdf.numPages > MAX_PAGES ? ` Only the first ${MAX_PAGES} pages were opened.` : '';
  const note = mode === 'image'
    ? 'Each PDF page is a locked background picture. Add text, shapes, stamps, QR codes and images on top, then download the PDF.'
    : mode === 'overlay'
      ? (textBoxes
        ? 'The page looks exactly like the PDF. Click any text to edit it; it sits on the original position. Moving a box leaves a background-colour patch behind.'
        : 'This PDF has no real text (it is probably a scan), so nothing is editable yet. Select a page and use "Make text editable" instead.')
      : 'Text from the PDF was extracted as editable boxes. Pictures, lines and colours from the original are not carried over.';
  return { title, size, orientation: landscape ? 'Landscape' : 'Portrait', pages, note: note + extra };
}

// ---------- entry point ----------
export const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
export const isDesignJson = (f: File) => /\.json$/i.test(f.name);

export async function importFile(file: File, pdfMode: PdfMode = 'image'): Promise<ImportResult> {
  const name = file.name;
  const title = name.replace(/\.[^.]+$/, '').replace(/\.design$/i, '') || 'Imported file';
  const ext = (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase();
  if (ext === 'pdf' || file.type === 'application/pdf') return importPdf(file, title, pdfMode);
  if (ext === 'docx') return importDocx(new Uint8Array(await file.arrayBuffer()), title);
  if (ext === 'xlsx' || ext === 'xlsm') return importXlsx(new Uint8Array(await file.arrayBuffer()), title);
  if (ext === 'pptx') return importPptx(new Uint8Array(await file.arrayBuffer()), title);
  if (ext === 'doc' || ext === 'xls' || ext === 'ppt') throw new Error(`Old .${ext} files cannot be opened. In Office, choose Save As and pick .${ext}x, then open that file.`);
  if (ext === 'csv' || ext === 'tsv') return importCsv(await file.text(), title);
  if (ext === 'md' || ext === 'markdown') return importText(await file.text(), title, true);
  if (ext === 'txt' || ext === 'log' || file.type === 'text/plain') return importText(await file.text(), title, false);
  if (ext === 'html' || ext === 'htm') return importHtml(await file.text(), title);
  if (ext === 'svg' || file.type.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp)$/.test(ext)) return importImage(file, title);
  throw new Error('This file type is not supported. You can open: ' + SUPPORTED_LABEL + '.');
}

// ---------- Plain table reader (used by the Bill Generator) ----------
// Returns the first worksheet of an .xlsx as rows of text. Dates arrive as Excel serial numbers.
export async function readXlsxRows(buf: Uint8Array): Promise<string[][]> {
  const zip = new Zip(buf);
  const shared: string[] = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
    shared.push(unxml((si.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) ?? []).map(t => t.replace(/<[^>]+>/g, '')).join('')));
  }
  const files = zip.names().filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  if (!files.length) throw new Error('This Excel file has no worksheets.');
  const xml = (await zip.text(files[0])) ?? '';
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let val = '';
      if (t === 'inlineStr') val = unxml((inner.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) ?? []).map(x => x.replace(/<[^>]+>/g, '')).join(''));
      else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '';
        val = t === 's' ? (shared[parseInt(v, 10)] ?? '') : unxml(v);
      }
      const ci = ref ? colIndex(ref) : row.length;
      while (row.length < ci) row.push('');
      row[ci] = val;
    }
    rows.push(row);
  }
  return rows.filter(r => r.some(c => (c ?? '').trim() !== ''));
}
