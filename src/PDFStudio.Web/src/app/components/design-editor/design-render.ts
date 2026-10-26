// Renders a saved Editor design to HTML outside the editor, so one design can be filled
// once per invoice (used by Bills & Invoices and by the Templates page preview).
import { Doc, El, Field, PAGE_PX, esc } from './design-model';
import { barcodeSvg, qrSvg } from './design-codes';
import { maskValue } from './field-crypto';
import { boxCss, extraHtml, extraTexts } from './design-extras';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FONTS: { name: string; stack: string }[] = [
  { name: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { name: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { name: 'Trebuchet MS', stack: "'Trebuchet MS', Helvetica, sans-serif" },
  { name: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { name: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { name: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { name: 'Impact', stack: 'Impact, Haettenschweiler, sans-serif' }
];
const stack = (name?: string) => (FONTS.find(f => f.name === name) ?? FONTS[0]).stack;

function fmtDate(v: string, pattern: string): string {
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

export function formatDesignField(f: Field, locale: string): string {
  if (f.type === 'encrypted') return maskValue(String(f.value ?? ''), f.maskLast ?? 4);
  const v = f.value;
  const empty = v === null || v === undefined || v === '';
  if (empty) return f.type === 'boolean' && v !== '' && v != null ? (String(v) === 'true' ? (f.trueLabel || 'Yes') : (f.falseLabel || 'No')) : '';
  if (['number', 'currency', 'percent'].includes(f.type) && isNaN(Number(v))) return '';
  const d = f.decimals ?? (f.type === 'currency' ? 2 : 0);
  try {
    switch (f.type) {
      case 'number': return new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v));
      case 'currency': return new Intl.NumberFormat(locale, { style: 'currency', currency: f.currency || 'USD', minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v));
      case 'percent': return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v) / 100);
      case 'date': return fmtDate(String(v), f.dateFormat || 'dd MMM yyyy');
      case 'boolean': return String(v) === 'true' ? (f.trueLabel || 'Yes') : (f.falseLabel || 'No');
      default: return String(v);
    }
  } catch { return String(v); }
}

function resolveTags(text: string, fields: Field[], locale: string): string {
  return text.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)(\.cipher)?\s*\}\}/g, (m, k, c) => {
    const f = fields.find(x => x.key === k);
    if (!f) return m;
    return c && f.type === 'encrypted' ? (f.cipher || '') : formatDesignField(f, locale);
  });
}

function textCss(el: El): string {
  return 'width:100%;height:100%;margin:0;box-sizing:border-box;white-space:pre-wrap;word-break:break-word;overflow:visible;'
    + `font-family:${stack(el.fontFamily)};font-size:${el.fontSize}px;font-weight:${el.bold ? 700 : 400};`
    + `font-style:${el.italic ? 'italic' : 'normal'};text-decoration:${el.underline ? 'underline' : 'none'};`
    + `text-align:${el.align};color:${el.color};line-height:${el.lineHeight};letter-spacing:${el.letterSpacing}px;` + boxCss(el);
}

function inner(el: El, fields: Field[], locale: string): string {
  const extra = extraHtml(el, t => resolveTags(t, fields, locale));
  if (extra !== null) return extra;
  if (el.type === 'text') return `<div style="${textCss(el)}">${esc(resolveTags(el.text ?? '', fields, locale))}</div>`;
  if (el.type === 'barcode' || el.type === 'qr') {
    const data = resolveTags(el.data ?? '', fields, locale);
    const color = esc(el.color || '#000000'), bg = el.fill ? esc(el.fill) : '';
    return el.type === 'barcode'
      ? barcodeSvg(data, { w: el.w, h: el.h, color, bg, showText: !!el.showText, text: esc(data) })
      : qrSvg(data, { w: el.w, h: el.h, color, bg });
  }
  if (el.type === 'image') {
    const src = (el.src ?? '').startsWith('data:image/') ? el.src : '';
    return `<img src="${src}" alt="" style="display:block;width:100%;height:100%;object-fit:${el.fit ?? 'cover'};border-radius:${el.radius ?? 0}px">`;
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

export function designCss(doc: Doc): string {
  const [w, h] = PAGE_PX[doc.size] ?? PAGE_PX['A4'];
  const W = doc.orientation === 'Landscape' ? h : w, H = doc.orientation === 'Landscape' ? w : h;
  return `<style>*{box-sizing:border-box}html,body{margin:0;padding:0}.pg{position:relative;overflow:hidden;width:${W}px;height:${H}px;`
    + 'page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}.e{position:absolute}</style>';
}

/** Pages of one design with the given field values filled in (no <style>; add designCss once). */
export function designPagesHtml(doc: Doc, fields: Field[]): string {
  const locale = doc.locale || 'en-US';
  return doc.pages.map(p => {
    const els = p.els.filter(e => !e.hidden).map(e =>
      `<div class="e" style="position:absolute;left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;transform:rotate(${e.rot}deg);opacity:${e.opacity}">${inner(e, fields, locale)}</div>`
    ).join('');
    return `<div class="pg" style="background:${esc(p.bg)}">${els}</div>`;
  }).join('');
}

/** The highest N used in {{itemNDescription}} tags, i.e. how many line-item rows the design has. */
export function designItemRows(doc: Doc): number {
  let max = 0;
  for (const p of doc.pages) for (const e of p.els) {
    for (const s of [e.text ?? '', e.data ?? '', ...extraTexts(e)]) {
      for (const m of s.matchAll(/\{\{\s*item(\d+)[A-Za-z]*\s*\}\}/g)) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return max;
}

const ITEM_TAG = /\{\{\s*item(\d+)([A-Za-z]*)\s*\}\}/g;
const rowOf = (e: El): number => {
  let k = 0;
  for (const s of [e.text ?? '', e.data ?? '']) for (const m of s.matchAll(ITEM_TAG)) k = Math.max(k, parseInt(m[1], 10));
  return k;
};
const bumpTags = (s: string | undefined, from: number, to: number): string | undefined =>
  s === undefined ? s : s.replace(ITEM_TAG, (m, n, rest) => parseInt(n, 10) === from ? `{{item${to}${rest}}}` : m);

/**
 * Grows the item table so ALL of an invoice's rows print on the same page: the last item row is cloned downward
 * (same spacing as the design's own rows), everything below the table is pushed down, and boxes that wrap the table
 * are stretched. If the page cannot hold `wanted` rows, it grows as far as fits and `rowsPerPage` tells the caller
 * how many rows each page carries (the rest continue on following pages).
 */
export function expandDesignRows(doc: Doc, wanted: number): { doc: Doc; rowsPerPage: number } {
  const rows = designItemRows(doc);
  if (rows === 0 || wanted <= rows) return { doc, rowsPerPage: rows || Infinity };
  const [pw, ph] = PAGE_PX[doc.size] ?? PAGE_PX['A4'];
  const H = doc.orientation === 'Landscape' ? pw : ph;

  const page = doc.pages.find(p => p.els.some(e => rowOf(e) === rows));
  if (!page) return { doc, rowsPerPage: rows };
  const last = page.els.filter(e => rowOf(e) === rows);
  const prev = page.els.filter(e => rowOf(e) === rows - 1);
  const lastTop = Math.min(...last.map(e => e.y)), lastBottom = Math.max(...last.map(e => e.y + e.h));
  const pitch = rows >= 2 && prev.length ? Math.max(1, lastTop - Math.min(...prev.map(e => e.y))) : (lastBottom - lastTop) + 6;
  const contentBottom = Math.max(...page.els.filter(e => !e.hidden).map(e => e.y + e.h));
  const spare = Math.floor((H - 12 - contentBottom) / pitch);      // extra rows that fit before running off the page
  const target = Math.min(wanted, rows + Math.max(0, spare));
  if (target <= rows) return { doc, rowsPerPage: rows };

  const extra = target - rows, delta = extra * pitch;
  const pages = doc.pages.map(p => {
    if (p !== page) return p;
    const els: El[] = p.els.map(e => {
      if (rowOf(e) > 0 && rowOf(e) <= rows) return e;
      if (e.y >= lastBottom - 1) return { ...e, y: e.y + delta };                                    // below the table: push down
      if (e.y < lastTop && e.y + e.h >= lastBottom - 1) return { ...e, h: e.h + delta };             // wraps the table: stretch
      return e;
    });
    for (let j = 1; j <= extra; j++) for (const e of last) {
      els.push({ ...e, id: `${e.id}_r${rows + j}`, y: e.y + j * pitch, text: bumpTags(e.text, rows, rows + j), data: bumpTags(e.data, rows, rows + j) });
    }
    return { ...p, els };
  });
  return { doc: { ...doc, pages }, rowsPerPage: target };
}

/** Adds the {{itemNDescription}} etc. fields for the cloned rows so they resolve. */
export function expandDesignFields(fields: Field[], rows: number, to: number): Field[] {
  const out = [...fields];
  for (let n = rows + 1; n <= to; n++) {
    for (const f of fields) {
      const m = /^item(\d+)(.*)$/.exec(f.key);
      if (m && parseInt(m[1], 10) === rows) out.push({ ...f, id: `${f.id}_r${n}`, key: `item${n}${m[2]}` });
    }
  }
  return out;
}
