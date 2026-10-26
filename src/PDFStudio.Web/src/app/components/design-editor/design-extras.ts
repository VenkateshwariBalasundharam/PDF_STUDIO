// Extra design elements: bordered text boxes, tables and form-style controls (button, checkbox, input field).
// Used by both the visual editor (canvas + PDF export) and design-render.ts (Bills & Invoices, Templates preview),
// so what you see on the canvas is exactly what the PDF prints. Everything is plain div / table markup,
// so it survives the server's HTML sanitiser and prints in any PDF engine.
import { El, esc } from './design-model';

const STACKS: Record<string, string> = {
  'Arial': 'Arial, Helvetica, sans-serif',
  'Verdana': 'Verdana, Geneva, sans-serif',
  'Tahoma': 'Tahoma, Geneva, sans-serif',
  'Trebuchet MS': "'Trebuchet MS', Helvetica, sans-serif",
  'Georgia': "Georgia, 'Times New Roman', serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Courier New': "'Courier New', Courier, monospace",
  'Impact': 'Impact, Haettenschweiler, sans-serif'
};
const stack = (n?: string) => STACKS[n ?? ''] ?? STACKS['Arial'];
const num = (v: number | undefined, d: number) => (typeof v === 'number' && !isNaN(v) ? v : d);

/** Extra CSS for a text element: background, border, rounded corners and padding. Empty when none are set. */
export function boxCss(el: El): string {
  let c = '';
  if (el.boxFill) c += `background:${esc(el.boxFill)};`;
  const bw = num(el.boxBorder, 0);
  if (bw > 0) c += `border:${bw}px ${el.boxStyle ?? 'solid'} ${esc(el.boxColor || '#0f172a')};`;
  const r = num(el.boxRadius, 0); if (r > 0) c += `border-radius:${r}px;`;
  const p = num(el.pad, 0); if (p > 0) c += `padding:${p}px;`;
  return c;
}

export const EXTRA_TYPES = ['table', 'button', 'checkbox', 'input'];

/** HTML for a table / button / checkbox / input element, or null for any other element type. `rs` fills {{fields}}. */
export function extraHtml(el: El, rs: (s: string) => string): string | null {
  const fs = num(el.fontSize, 14), font = stack(el.fontFamily), color = esc(el.color || '#0f172a');
  const base = `font-family:${font};font-size:${fs}px;color:${color};`;

  if (el.type === 'table') {
    const rows = el.cells?.length ? el.cells : [['']];
    const bw = num(el.strokeWidth, 1), bc = esc(el.stroke || '#94a3b8');
    const align = el.align ?? 'left';
    const first = el.header ? 1 : 0;
    const body = rows.map((r, i) => {
      const head = !!el.header && i === 0;
      const bg = head ? (el.headFill || '#e2e8f0') : (el.zebra && (i - first) % 2 === 1 ? '#f1f5f9' : (el.fill || ''));
      const tdCss = `border:${bw > 0 ? `${bw}px solid ${bc}` : 'none'};padding:4px 8px;vertical-align:middle;text-align:${align};`
        + 'white-space:pre-wrap;word-break:break-word;overflow:hidden;'
        + (head ? `font-weight:700;color:${esc(el.headColor || el.color || '#0f172a')};` : '')
        + (bg ? `background:${esc(bg)};` : '');
      return `<tr style="height:${(100 / rows.length).toFixed(4)}%">`
        + r.map(c => `<td style="${tdCss}">${esc(rs(c ?? ''))}</td>`).join('') + '</tr>';
    }).join('');
    return `<table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;${base}line-height:1.25;"><tbody>${body}</tbody></table>`;
  }

  if (el.type === 'button') {
    const bw = num(el.strokeWidth, 0);
    return `<div style="width:100%;height:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;`
      + `background:${el.fill ? esc(el.fill) : 'transparent'};border:${bw > 0 ? `${bw}px solid ${esc(el.stroke || '#1e3a8a')}` : 'none'};border-radius:${num(el.radius, 0)}px;`
      + `${base}font-weight:${el.bold === false ? 400 : 700};${el.italic ? 'font-style:italic;' : ''}${el.underline ? 'text-decoration:underline;' : ''}">${esc(rs(el.text ?? ''))}</div>`;
  }

  if (el.type === 'checkbox') {
    const box = Math.round(Math.min(el.h, Math.max(14, fs * 1.3)));
    const bw = Math.max(1, num(el.strokeWidth, 2));
    const tick = el.checked
      ? `<svg width="${box}" height="${box}" viewBox="0 0 24 24" style="display:block"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${esc(el.stroke || '#0f172a')}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    return `<div style="width:100%;height:100%;display:flex;align-items:center;gap:8px;${base}">`
      + `<div style="flex:0 0 ${box}px;width:${box}px;height:${box}px;box-sizing:border-box;border:${bw}px solid ${esc(el.stroke || '#0f172a')};`
      + `background:${el.fill ? esc(el.fill) : '#ffffff'};border-radius:${el.round ? '50%' : num(el.radius, 3) + 'px'};overflow:hidden">${tick}</div>`
      + `<div style="flex:1;min-width:0;white-space:pre-wrap;word-break:break-word">${esc(rs(el.text ?? ''))}</div></div>`;
  }

  if (el.type === 'input') {
    const bw = num(el.strokeWidth, 1);
    const label = el.label ? `<div style="flex:0 0 auto;font-size:${Math.max(8, Math.round(fs * 0.85))}px;font-weight:700;margin-bottom:3px;color:${color}">${esc(rs(el.label))}</div>` : '';
    return `<div style="width:100%;height:100%;display:flex;flex-direction:column;${base}">${label}`
      + `<div style="flex:1;min-height:0;box-sizing:border-box;display:flex;align-items:center;padding:0 8px;overflow:hidden;`
      + `background:${el.fill ? esc(el.fill) : '#ffffff'};border:${bw > 0 ? `${bw}px solid ${esc(el.stroke || '#94a3b8')}` : 'none'};border-radius:${num(el.radius, 4)}px;white-space:pre-wrap">${esc(rs(el.text ?? ''))}</div></div>`;
  }
  return null;
}

/** Every piece of text in an element that can hold {{field}} tags (used to find tags in tables). */
export function extraTexts(el: El): string[] {
  return [...(el.cells ?? []).flat(), el.label ?? ''];
}
