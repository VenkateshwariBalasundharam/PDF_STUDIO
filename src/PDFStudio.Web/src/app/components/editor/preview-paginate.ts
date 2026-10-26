// Makes the Code Editor's live preview look like the PDF Chromium will produce:
//  - the page margins are applied (the PDF engine uses 10 mm unless told otherwise),
//  - the content is split into real A4/Letter/... sheets with a gap between them,
//  - "break-before/after: page" and "break-inside: avoid" (plus table rows, paragraphs, headings)
//    start a new sheet instead of running across the page edge,
//  - the iframe grows to hold every sheet, so there is no inner scrollbar.
// The preview iframe is sandboxed WITHOUT scripts; only this (parent) code touches its document.

export interface PaginateOpts {
  pageW: number; pageH: number;                                  // px (96 dpi)
  margin: { t: number; r: number; b: number; l: number };        // px
  gap: number;                                                   // px between sheets
}
export interface PaginateResult { pages: number; height: number }

const AVOID_TAGS = new Set(['TR', 'LI', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'IMG', 'FIGURE', 'BLOCKQUOTE', 'PRE', 'SVG']);
const MAX_ELEMENTS = 4000;
const FORCED = /^(page|always|left|right)$/;

export const mmToPx = (mm: number) => (mm * 96) / 25.4;

export function paginatePreview(doc: Document, o: PaginateOpts): PaginateResult {
  const win = doc.defaultView;
  const body = doc.body, html = doc.documentElement;
  const empty: PaginateResult = { pages: 1, height: o.pageH };
  if (!win || !body || !html) return empty;

  const m = o.margin;
  const C = o.pageH - m.t - m.b;          // usable height of one sheet
  const P = o.pageH + o.gap;              // distance from the start of one sheet to the next

  // Colour of the sheets: whatever the template paints on body/html, else white.
  const clear = (c: string) => !c || c === 'transparent' || /,\s*0\)$/.test(c);
  let sheet = win.getComputedStyle(body).backgroundColor;
  if (clear(sheet)) sheet = win.getComputedStyle(html).backgroundColor;
  if (clear(sheet)) sheet = '#ffffff';

  const style = doc.createElement('style');
  style.textContent =
    `html{margin:0!important;padding:${m.t}px ${m.r}px ${m.b}px ${m.l}px!important;width:${o.pageW}px!important;`
    + 'box-sizing:border-box!important;overflow:hidden!important;background:transparent!important}'
    + 'body{background:transparent!important}';
  (doc.head ?? html).appendChild(style);

  const forceBefore = new Set<Element>();
  const els = Array.from(body.querySelectorAll('*')).slice(0, MAX_ELEMENTS);

  const place = (el: HTMLElement, cs: CSSStyleDeclaration, need: number, targetRel: number): void => {
    if (need < 0.5) return;
    const adjust = (apply: (extra: number) => void) => {            // fix margin-collapsing drift
      const drift = targetRel - (el.getBoundingClientRect().top - m.t);
      if (Math.abs(drift) > 0.5) apply(drift);
    };
    if (el.tagName === 'TR') {
      const cells = Array.from(el.children) as HTMLElement[];
      for (const c of cells) c.style.paddingTop = (parseFloat(win.getComputedStyle(c).paddingTop) || 0) + need + 'px';
      return;
    }
    const parent = el.parentElement;
    const pd = parent ? win.getComputedStyle(parent).display : 'block';
    if (!parent || /flex|grid/.test(pd) || cs.display.startsWith('table')) {
      el.style.marginTop = (parseFloat(cs.marginTop) || 0) + need + 'px';
      adjust(d => { el.style.marginTop = (parseFloat(el.style.marginTop) || 0) + d + 'px'; });
      return;
    }
    const sp = doc.createElement('div');
    sp.setAttribute('data-pv-spacer', '');
    sp.style.cssText = `height:${need}px;margin:0;padding:0;border:0;clear:both`;
    parent.insertBefore(sp, el);
    adjust(d => { sp.style.height = Math.max(0, need + d) + 'px'; });
  };

  for (const el of els as HTMLElement[]) {
    if (el.hasAttribute('data-pv-spacer')) continue;
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (el.closest('td,th') && el.tagName !== 'TR') continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
    if (/^inline($|-(?!block))/.test(cs.display) || /^table-(cell|column|row-group|header-group|footer-group|caption)/.test(cs.display)) {
      if (FORCED.test(cs.breakAfter) && el.nextElementSibling) forceBefore.add(el.nextElementSibling);
      continue;
    }

    const rect = el.getBoundingClientRect();
    const relY = rect.top - m.t;
    const k = Math.floor((relY + 0.01) / P);
    const r = relY - k * P;
    const h = rect.height;

    const forced = forceBefore.has(el) || FORCED.test(cs.breakBefore) || cs.pageBreakBefore === 'always';
    const avoid = h > 0 && h <= C
      && (cs.breakInside === 'avoid' || cs.pageBreakInside === 'avoid' || AVOID_TAGS.has(el.tagName));

    let need = 0;
    if (r > C + 0.5) need = P - r;                       // would start inside the gap between sheets
    else if (forced && r > 0.5) need = P - r;            // explicit page break
    else if (avoid && r + h > C + 0.5) need = P - r;     // would be cut by the page edge

    if (need > 0) place(el, cs, need, (k + 1) * P);
    if (FORCED.test(cs.breakAfter) || cs.pageBreakAfter === 'always') {
      if (el.nextElementSibling) forceBefore.add(el.nextElementSibling);
    }
  }

  // How many sheets does the content now need?
  const endRel = body.getBoundingClientRect().bottom - m.t;
  const kEnd = Math.max(0, Math.floor((endRel - 0.5) / P));
  let pages = kEnd + 1;
  if (endRel - kEnd * P > C + 0.5) pages++;
  const height = pages * o.pageH + (pages - 1) * o.gap;

  const edge = '#cbd5e1';
  const g = `repeating-linear-gradient(to bottom,${edge} 0,${edge} 1px,${sheet} 1px,${sheet} ${o.pageH - 1}px,`
    + `${edge} ${o.pageH - 1}px,${edge} ${o.pageH}px,transparent ${o.pageH}px,transparent ${P}px)`;
  html.style.setProperty('height', height + 'px', 'important');
  html.style.setProperty('background', g, 'important');

  return { pages, height };
}
