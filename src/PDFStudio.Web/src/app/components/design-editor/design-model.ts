// Shared types and helpers for the visual design editor and its template library.

export type ElType = 'text' | 'rect' | 'ellipse' | 'triangle' | 'line' | 'image' | 'barcode' | 'qr' | 'table' | 'button' | 'checkbox' | 'input';

export interface El {
  id: string;
  type: ElType;
  x: number; y: number; w: number; h: number; rot: number; opacity: number;
  locked?: boolean; hidden?: boolean;
  // text
  text?: string; fontFamily?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify'; color?: string; lineHeight?: number; letterSpacing?: number;
  // shapes
  fill?: string; stroke?: string; strokeWidth?: number; radius?: number;
  // image
  src?: string; fit?: 'cover' | 'contain';
  // barcode / QR (data may contain {{field}} tags; colours use `color` and `fill`)
  data?: string; showText?: boolean;
  // text box styling: background, border and inner padding around a text element
  boxFill?: string; boxBorder?: number; boxColor?: string; boxStyle?: 'solid' | 'dashed' | 'dotted' | 'double'; boxRadius?: number; pad?: number;
  // table: cells[row][col]; the grid uses stroke / strokeWidth, text uses fontFamily / fontSize / color / align
  cells?: string[][]; header?: boolean; zebra?: boolean; headFill?: string; headColor?: string; rowH?: number;
  // form controls (button / checkbox / input): `text` is the button label, checkbox label or input value
  label?: string; checked?: boolean; round?: boolean;
}
export interface Page { id: string; bg: string; els: El[]; }
export type FieldType = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'boolean' | 'encrypted';
export interface Field {
  id: string; key: string; label: string; type: FieldType; value: any;
  decimals?: number; currency?: string; dateFormat?: string; trueLabel?: string; falseLabel?: string;
  cipher?: string; // encrypted fields: the sealed text (PSENC2...) that can be embedded in the PDF
  maskLast?: number; // encrypted fields: characters left visible at the end of the masked text (default 4)
  lockPdf?: boolean; // encrypted fields: the PDF asks for the passphrase when opened and then shows the real value
  recipients?: { label: string; pub: string }[]; // encrypted fields: public keys that can unlock the value
  embed?: boolean; // encrypted fields: hide the sealed text inside the PDF (default true)
}
export interface Doc { title: string; size: string; orientation: string; pages: Page[]; fields?: Field[]; locale?: string; }


export const PAGE_PX: Record<string, [number, number]> = {
  A4: [793, 1122],
  Letter: [816, 1056],
  Legal: [816, 1344],
  A5: [559, 793],
  A3: [1122, 1587]
};

export const uid = () => Math.random().toString(36).slice(2, 9);
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

