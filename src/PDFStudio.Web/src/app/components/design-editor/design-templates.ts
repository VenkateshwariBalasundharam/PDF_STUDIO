import { El, ElType, Field, Page, uid } from './design-model';

export interface TplOpts { W: number; H: number; color: string; logo: boolean; title: string; }
export interface TplResult { bg?: string; els: El[]; fields: Partial<Field>[]; }
export interface TplDef {
  id: string; name: string; category: string; orientation: 'Portrait' | 'Landscape';
  build: (o: TplOpts) => TplResult;
}

export const TPL_CATEGORIES = ['All', 'Custom', 'Business', 'Personal', 'Cards', 'Marketing'];

// ---------- colour helpers ----------
function rgb(c: string): number[] {
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = parseInt(h, 16);
  return isNaN(n) ? [37, 99, 235] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return '#' + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('');
}
const tint = (c: string, t: number) => mix(c, '#ffffff', t);
const shade = (c: string, t: number) => mix(c, '#000000', t);

const INK = '#0f172a', MUTED = '#64748b', LINE = '#e2e8f0';

// ---------- element helpers ----------
function base(type: ElType, o: Partial<El>): El {
  return { id: uid(), type, x: 0, y: 0, w: 100, h: 40, rot: 0, opacity: 1, ...o };
}
const T = (o: Partial<El>): El => base('text', {
  text: 'Text', fontFamily: 'Arial', fontSize: 14, bold: false, italic: false, underline: false,
  align: 'left', color: INK, lineHeight: 1.3, letterSpacing: 0, ...o
});
const S = (type: ElType, o: Partial<El>): El => base(type, { fill: '#2563eb', stroke: '#1e3a8a', strokeWidth: 0, radius: 0, ...o });
const RECT = (x: number, y: number, w: number, h: number, fill: string, o: Partial<El> = {}): El => S('rect', { x, y, w, h, fill, ...o });
const LINE_ = (x: number, y: number, w: number, color = LINE, thick = 1): El => S('line', { x, y: y - 6, w, h: 12, stroke: color, strokeWidth: thick });
const OUTLINE = (x: number, y: number, w: number, h: number, color: string, sw: number, radius = 0): El =>
  S('rect', { x, y, w, h, fill: '', stroke: color, strokeWidth: sw, radius });

export function logoEls(x: number, y: number, size: number, color: string, onDark = false): El[] {
  return [
    S('ellipse', { x, y, w: size, h: size, fill: onDark ? '#ffffff' : color }),
    T({ text: 'LOGO', x, y: y + size / 2 - size * 0.14, w: size, h: size * 0.3, fontSize: Math.round(size * 0.22), bold: true,
      align: 'center', color: onDark ? color : '#ffffff', letterSpacing: 1 })
  ];
}

const QR = (x: number, y: number, size: number, data: string): El =>
  base('qr', { x, y, w: size, h: size, data, color: '#000000', fill: '#ffffff' });
const BARCODE = (x: number, y: number, w: number, h: number, data: string): El =>
  base('barcode', { x, y, w, h, data, color: '#000000', fill: '#ffffff', showText: true });

const today = () => new Date().toISOString().slice(0, 10);

// ---------- templates ----------
const blank: TplDef = {
  id: 'blank', name: 'Blank Page', category: 'Custom', orientation: 'Portrait',
  build: ({ W, H, color, logo, title }) => {
    const els: El[] = [];
    if (logo) els.push(...logoEls(50, 50, 60, color));
    return {
      bg: '#ffffff',
      els,
      fields: [
        { key: 'title', type: 'text', value: title || 'Custom Document' },
        { key: 'date', type: 'date', value: today(), dateFormat: 'yyyy-MM-dd' },
        { key: 'recipient', type: 'text', value: 'Customer / Recipient' },
        { key: 'amount', type: 'currency', value: '0.00', currency: '₹' }
      ]
    };
  }
};

const invoice: TplDef = {
  id: 'invoice', name: 'Invoice', category: 'Business', orientation: 'Portrait',
  build: ({ W, H, color, logo }) => {
    const m = 50, tw = W - m * 2;
    const els: El[] = [
      T({ text: 'INVOICE', x: m, y: 50, w: 400, h: 50, fontSize: 38, bold: true, color }),
      LINE_(m, 112, tw, color, 3),
      T({ text: 'Invoice #{{invoiceNo}}', x: m, y: 130, w: 300, h: 24, fontSize: 13, color: INK }),
      T({ text: 'Date: {{invoiceDate}}', x: W - m - 260, y: 130, w: 260, h: 24, fontSize: 13, align: 'right' }),
      LINE_(m, 168, tw),
      T({ text: 'Bill To', x: m, y: 188, w: 200, h: 22, fontSize: 12, bold: true, color: MUTED }),
      T({ text: '{{billName}}\n{{billCompany}}\n{{billAddress}}', x: m, y: 212, w: 360, h: 90, fontSize: 14, lineHeight: 1.5 }),
      RECT(m, 330, tw, 38, color),
      T({ text: 'Description', x: m + 14, y: 340, w: 300, h: 20, fontSize: 12, bold: true, color: '#ffffff' }),
      T({ text: 'Quantity', x: W - m - 330, y: 340, w: 70, h: 20, fontSize: 12, bold: true, color: '#ffffff', align: 'right' }),
      T({ text: 'Unit Price', x: W - m - 240, y: 340, w: 100, h: 20, fontSize: 12, bold: true, color: '#ffffff', align: 'right' }),
      T({ text: 'Amount', x: W - m - 120, y: 340, w: 106, h: 20, fontSize: 12, bold: true, color: '#ffffff', align: 'right' })
    ];
    const rows = [['Web Design Services', '3', '$150.00', '$450.00'], ['Consulting Fee', '1', '$200.00', '$200.00'], ['Hosting (annual)', '1', '$0.00', '$0.00']];
    rows.forEach((r, i) => {
      const y = 384 + i * 46;
      els.push(
        T({ text: '{{item' + (i + 1) + 'Description}}', x: m + 14, y, w: 320, h: 22, fontSize: 13 }),
        T({ text: '{{item' + (i + 1) + 'Quantity}}', x: W - m - 330, y, w: 70, h: 22, fontSize: 13, align: 'right' }),
        T({ text: '{{item' + (i + 1) + 'Price}}', x: W - m - 240, y, w: 100, h: 22, fontSize: 13, align: 'right' }),
        T({ text: '{{item' + (i + 1) + 'Amount}}', x: W - m - 120, y, w: 106, h: 22, fontSize: 13, align: 'right' }),
        LINE_(m, y + 33, tw)
      );
    });
    const ty = 384 + rows.length * 46 + 24;
    els.push(
      T({ text: 'Subtotal:', x: W - m - 280, y: ty, w: 150, h: 22, fontSize: 13, align: 'right', color: MUTED }),
      T({ text: '{{subtotal}}', x: W - m - 120, y: ty, w: 120, h: 22, fontSize: 13, align: 'right', bold: true }),
      T({ text: 'Tax ({{taxRate}}):', x: W - m - 280, y: ty + 30, w: 150, h: 22, fontSize: 13, align: 'right', color: MUTED }),
      T({ text: '{{tax}}', x: W - m - 120, y: ty + 30, w: 120, h: 22, fontSize: 13, align: 'right', bold: true }),
      LINE_(W - m - 280, ty + 66, 280, INK, 1.5),
      T({ text: 'Total:', x: W - m - 280, y: ty + 78, w: 150, h: 30, fontSize: 18, align: 'right', bold: true }),
      T({ text: '{{total}}', x: W - m - 130, y: ty + 78, w: 130, h: 30, fontSize: 18, align: 'right', bold: true, color }),
      QR(m, ty - 6, 112, '{{invoiceNo}}'),
      T({ text: 'Scan to verify', x: m, y: ty + 108, w: 112, h: 16, fontSize: 10, color: MUTED, align: 'center' }),
      T({ text: 'Thank you for your business. Payment is due within 14 days.', x: m, y: H - 90, w: tw, h: 24, fontSize: 12, color: MUTED, align: 'center' })
    );
    if (logo) els.push(...logoEls(W - m - 64, 44, 64, color));
    return { els, fields: [
      { key: 'invoiceNo', type: 'text', value: '12345' },
      { key: 'invoiceDate', type: 'date', value: today(), dateFormat: 'MM/dd/yyyy' },
      { key: 'billName', type: 'text', value: 'John Doe' },
      { key: 'billCompany', type: 'text', value: 'ABC Company' },
      { key: 'billAddress', type: 'text', value: '123 Main Street, City, State 12345' },
      ...rows.flatMap((r, i) => [
        { key: 'item' + (i + 1) + 'Description', type: 'text' as const, value: r[0] },
        { key: 'item' + (i + 1) + 'Quantity', type: 'number' as const, value: Number(r[1]), decimals: 0 },
        { key: 'item' + (i + 1) + 'Price', type: 'currency' as const, value: Number(r[2].replace('$', '')), currency: 'USD', decimals: 2 },
        { key: 'item' + (i + 1) + 'Amount', type: 'currency' as const, value: Number(r[3].replace('$', '')), currency: 'USD', decimals: 2 }
      ]),
      { key: 'subtotal', type: 'currency', value: 650, currency: 'USD', decimals: 2 },
      { key: 'taxRate', type: 'percent', value: 10, decimals: 0 },
      { key: 'tax', type: 'currency', value: 65, currency: 'USD', decimals: 2 },
      { key: 'total', type: 'currency', value: 715, currency: 'USD', decimals: 2 }
    ] };
  }
};

const report: TplDef = {
  id: 'report', name: 'Report', category: 'Business', orientation: 'Portrait',
  build: ({ W, H, color, logo }) => {
    const m = 50, tw = W - m * 2, cw = (tw - 40) / 3;
    const els: El[] = [
      RECT(0, 0, W, 250, color),
      S('ellipse', { x: W - 230, y: -90, w: 330, h: 330, fill: shade(color, 0.25), opacity: 0.5 }),
      T({ text: 'QUARTERLY REPORT', x: m, y: 70, w: tw, h: 24, fontSize: 13, bold: true, color: tint(color, 0.7), letterSpacing: 3 }),
      T({ text: '{{reportTitle}}', x: m, y: 104, w: tw - 60, h: 90, fontSize: 38, bold: true, color: '#ffffff', lineHeight: 1.15 }),
      T({ text: '{{period}}  ·  Prepared by {{author}}', x: m, y: 206, w: tw, h: 24, fontSize: 13, color: tint(color, 0.8) }),
      T({ text: 'Executive Summary', x: m, y: 290, w: tw, h: 30, fontSize: 20, bold: true, color }),
      T({ text: 'This report summarises performance for the period, highlights the main drivers of growth and sets out the recommended actions for the next quarter. Replace this paragraph with your own summary.',
        x: m, y: 330, w: tw, h: 80, fontSize: 13.5, color: '#334155', lineHeight: 1.55 })
    ];
    const kpis: [string, string][] = [['Revenue', '{{revenue}}'], ['Customers', '{{customers}}'], ['Growth', '{{growth}}']];
    kpis.forEach((k, i) => {
      const x = m + i * (cw + 20);
      els.push(RECT(x, 440, cw, 96, tint(color, 0.9), { radius: 10 }),
        RECT(x, 440, 5, 96, color, { radius: 3 }),
        T({ text: k[0], x: x + 20, y: 456, w: cw - 30, h: 20, fontSize: 12, color: MUTED }),
        T({ text: k[1], x: x + 20, y: 482, w: cw - 30, h: 40, fontSize: 24, bold: true, color: INK }));
    });
    els.push(T({ text: 'Performance by Month', x: m, y: 570, w: tw, h: 28, fontSize: 18, bold: true, color }));
    const bars = [40, 62, 55, 80, 70, 95], bw = 54, gap = (tw - bars.length * bw) / (bars.length + 1), base0 = 770;
    bars.forEach((v, i) => {
      const bh = v * 1.5, x = m + gap + i * (bw + gap);
      els.push(RECT(x, base0 - bh, bw, bh, i === bars.length - 1 ? color : tint(color, 0.45), { radius: 4 }),
        T({ text: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'][i], x: x - 6, y: base0 + 8, w: bw + 12, h: 20, fontSize: 11, color: MUTED, align: 'center' }));
    });
    els.push(LINE_(m, base0, tw, LINE, 1.5),
      T({ text: 'Key Insights', x: m, y: 830, w: tw, h: 28, fontSize: 18, bold: true, color }),
      T({ text: '•  Revenue grew steadily across the period.\n•  Customer retention improved against the industry average.\n•  Focus next quarter: acquisition cost and onboarding time.',
        x: m, y: 868, w: tw, h: 110, fontSize: 13.5, color: '#334155', lineHeight: 1.7 }));
    if (logo) els.push(...logoEls(m, 22, 38, color, true));
    return { els, fields: [
      { key: 'reportTitle', type: 'text', value: 'Company Performance Report' },
      { key: 'period', type: 'text', value: 'Q3 2026' },
      { key: 'author', type: 'text', value: 'Finance Team' },
      { key: 'revenue', type: 'currency', value: 1250000, currency: 'USD', decimals: 0 },
      { key: 'customers', type: 'number', value: 4200, decimals: 0 },
      { key: 'growth', type: 'percent', value: 12.5, decimals: 1 }
    ] };
  }
};

const resume: TplDef = {
  id: 'resume', name: 'Resume', category: 'Personal', orientation: 'Portrait',
  build: ({ W, H, color }) => {
    const sw = 250, rx = sw + 36, rw = W - rx - 40;
    const els: El[] = [
      RECT(0, 0, sw, H, color),
      S('ellipse', { x: sw / 2 - 62, y: 50, w: 124, h: 124, fill: tint(color, 0.8), stroke: '#ffffff', strokeWidth: 4 }),
      T({ text: 'Photo', x: sw / 2 - 62, y: 102, w: 124, h: 22, fontSize: 12, color: shade(color, 0.2), align: 'center' }),
      T({ text: 'CONTACT', x: 28, y: 214, w: sw - 56, h: 20, fontSize: 12, bold: true, color: '#ffffff', letterSpacing: 2 }),
      LINE_(28, 240, sw - 56, tint(color, 0.5), 1),
      T({ text: '{{phone}}\n{{email}}\n{{location}}', x: 28, y: 254, w: sw - 56, h: 90, fontSize: 12.5, color: '#ffffff', lineHeight: 1.7 }),
      T({ text: 'SKILLS', x: 28, y: 380, w: sw - 56, h: 20, fontSize: 12, bold: true, color: '#ffffff', letterSpacing: 2 }),
      LINE_(28, 406, sw - 56, tint(color, 0.5), 1),
      T({ text: 'Project management\nCommunication\nProblem solving\nData analysis\nTeam leadership', x: 28, y: 420, w: sw - 56, h: 150, fontSize: 12.5, color: '#ffffff', lineHeight: 1.8 }),
      T({ text: 'LANGUAGES', x: 28, y: 600, w: sw - 56, h: 20, fontSize: 12, bold: true, color: '#ffffff', letterSpacing: 2 }),
      LINE_(28, 626, sw - 56, tint(color, 0.5), 1),
      T({ text: 'English\nHindi\nTamil', x: 28, y: 640, w: sw - 56, h: 70, fontSize: 12.5, color: '#ffffff', lineHeight: 1.8 }),

      T({ text: '{{fullName}}', x: rx, y: 56, w: rw, h: 54, fontSize: 38, bold: true, color: INK }),
      T({ text: '{{jobTitle}}', x: rx, y: 112, w: rw, h: 28, fontSize: 17, color }),
      T({ text: 'PROFILE', x: rx, y: 176, w: rw, h: 20, fontSize: 12, bold: true, color, letterSpacing: 2 }),
      LINE_(rx, 202, rw, color, 2),
      T({ text: 'A motivated professional with a track record of delivering results. Replace this text with a short summary of your experience, strengths and goals.',
        x: rx, y: 214, w: rw, h: 80, fontSize: 13, color: '#334155', lineHeight: 1.6 }),
      T({ text: 'EXPERIENCE', x: rx, y: 320, w: rw, h: 20, fontSize: 12, bold: true, color, letterSpacing: 2 }),
      LINE_(rx, 346, rw, color, 2),
      T({ text: 'Senior Role  ·  Company Name', x: rx, y: 360, w: rw, h: 22, fontSize: 14, bold: true }),
      T({ text: '2022 – Present', x: rx, y: 384, w: rw, h: 20, fontSize: 12, color: MUTED }),
      T({ text: '•  Led a team to deliver key projects on time.\n•  Improved a core process by 30%.', x: rx, y: 408, w: rw, h: 60, fontSize: 13, color: '#334155', lineHeight: 1.6 }),
      T({ text: 'Previous Role  ·  Company Name', x: rx, y: 492, w: rw, h: 22, fontSize: 14, bold: true }),
      T({ text: '2018 – 2022', x: rx, y: 516, w: rw, h: 20, fontSize: 12, color: MUTED }),
      T({ text: '•  Managed day-to-day operations and reporting.\n•  Trained and mentored new team members.', x: rx, y: 540, w: rw, h: 60, fontSize: 13, color: '#334155', lineHeight: 1.6 }),
      T({ text: 'EDUCATION', x: rx, y: 640, w: rw, h: 20, fontSize: 12, bold: true, color, letterSpacing: 2 }),
      LINE_(rx, 666, rw, color, 2),
      T({ text: 'Degree Name', x: rx, y: 680, w: rw, h: 22, fontSize: 14, bold: true }),
      T({ text: 'University Name  ·  2014 – 2018', x: rx, y: 704, w: rw, h: 20, fontSize: 12, color: MUTED })
    ];
    return { els, fields: [
      { key: 'fullName', type: 'text', value: 'Your Name' },
      { key: 'jobTitle', type: 'text', value: 'Professional Title' },
      { key: 'phone', type: 'text', value: '+91 98765 43210' },
      { key: 'email', type: 'text', value: 'name@email.com' },
      { key: 'location', type: 'text', value: 'City, Country' }
    ] };
  }
};

const certificate: TplDef = {
  id: 'certificate', name: 'Certificate', category: 'Personal', orientation: 'Landscape',
  build: ({ W, H, color, logo }) => {
    const els: El[] = [
      OUTLINE(24, 24, W - 48, H - 48, color, 6),
      OUTLINE(44, 44, W - 88, H - 88, tint(color, 0.45), 2),
      T({ text: 'CERTIFICATE', x: 60, y: H * 0.17, w: W - 120, h: 76, fontSize: 56, bold: true, align: 'center', color, fontFamily: 'Georgia', letterSpacing: 5 }),
      T({ text: 'OF ACHIEVEMENT', x: 60, y: H * 0.17 + 78, w: W - 120, h: 34, fontSize: 22, align: 'center', color: shade(color, 0.2), fontFamily: 'Georgia', letterSpacing: 6 }),
      T({ text: 'This certificate is proudly presented to', x: 60, y: H * 0.43, w: W - 120, h: 28, fontSize: 17, align: 'center', color: MUTED, fontFamily: 'Georgia', italic: true }),
      T({ text: '{{recipient}}', x: 60, y: H * 0.49, w: W - 120, h: 66, fontSize: 46, bold: true, align: 'center', color: INK, fontFamily: 'Georgia' }),
      LINE_(W / 2 - 170, H * 0.49 + 72, 340, color, 2),
      T({ text: '{{reason}}', x: 110, y: H * 0.63, w: W - 220, h: 56, fontSize: 17, align: 'center', color: MUTED, fontFamily: 'Georgia', lineHeight: 1.5 }),
      LINE_(100, H * 0.84, 210, INK, 1.5),
      T({ text: '{{issuer}}', x: 100, y: H * 0.84 + 10, w: 210, h: 24, fontSize: 14, align: 'center', color: MUTED }),
      T({ text: '{{issueDate}}', x: W - 310, y: H * 0.84 - 30, w: 210, h: 24, fontSize: 15, align: 'center' }),
      LINE_(W - 310, H * 0.84, 210, INK, 1.5),
      T({ text: 'Date', x: W - 310, y: H * 0.84 + 10, w: 210, h: 24, fontSize: 14, align: 'center', color: MUTED })
    ];
    if (logo) els.push(...logoEls(W / 2 - 34, 64, 68, color));
    return { bg: tint(color, 0.97), els, fields: [
      { key: 'recipient', type: 'text', value: 'Recipient Name' },
      { key: 'reason', type: 'text', value: 'in recognition of outstanding effort, dedication and achievement.' },
      { key: 'issuer', type: 'text', value: 'Authorised Signatory' },
      { key: 'issueDate', type: 'date', value: today(), dateFormat: 'MMMM d, yyyy' }
    ] };
  }
};

const businessCard: TplDef = {
  id: 'business-card', name: 'Business Card', category: 'Cards', orientation: 'Portrait',
  build: ({ W, color, logo }) => {
    const cw = 504, ch = 288, x = (W - cw) / 2, y1 = 90, y2 = y1 + ch + 36;
    const els: El[] = [
      RECT(x, y1, cw, ch, color, { radius: 10 }),
      S('ellipse', { x: x + cw - 150, y: y1 - 60, w: 220, h: 220, fill: shade(color, 0.25), opacity: 0.45 }),
      T({ text: '{{fullName}}', x: x + 36, y: y1 + 150, w: cw - 72, h: 44, fontSize: 32, bold: true, color: '#ffffff' }),
      T({ text: '{{jobTitle}}', x: x + 36, y: y1 + 196, w: cw - 72, h: 26, fontSize: 16, color: tint(color, 0.75) }),
      T({ text: '{{company}}', x: x + 36, y: y1 + 232, w: cw - 72, h: 22, fontSize: 13, bold: true, color: '#ffffff', letterSpacing: 2 }),
      OUTLINE(x, y2, cw, ch, LINE, 1.5, 10),
      RECT(x, y2, 12, ch, color, { radius: 5 }),
      T({ text: '{{company}}', x: x + 44, y: y2 + 36, w: cw - 80, h: 30, fontSize: 20, bold: true, color }),
      LINE_(x + 44, y2 + 84, 70, color, 3),
      T({ text: 'Phone  {{phone}}\nEmail  {{email}}\nWeb  {{website}}\n{{address}}', x: x + 44, y: y2 + 110, w: 290, h: 140, fontSize: 14, color: '#334155', lineHeight: 1.8 }),
      QR(x + cw - 36 - 112, y2 + 118, 112, '{{website}}')
    ];
    if (logo) els.push(...logoEls(x + 36, y1 + 36, 62, color, true));
    return { els, fields: [
      { key: 'fullName', type: 'text', value: 'Your Name' },
      { key: 'jobTitle', type: 'text', value: 'Job Title' },
      { key: 'company', type: 'text', value: 'COMPANY NAME' },
      { key: 'phone', type: 'text', value: '+91 98765 43210' },
      { key: 'email', type: 'text', value: 'name@company.com' },
      { key: 'website', type: 'text', value: 'www.company.com' },
      { key: 'address', type: 'text', value: '12 Main Street, City' }
    ] };
  }
};

const idCard: TplDef = {
  id: 'id-card', name: 'ID Card', category: 'Cards', orientation: 'Portrait',
  build: ({ W, H, color, logo }) => {
    const cw = 340, ch = 540, gap = 40, x1 = (W - (cw * 2 + gap)) / 2, x2 = x1 + cw + gap, y = Math.max(40, Math.min(120, (H - ch) / 2 * 0.6));
    const els: El[] = [
      RECT(x1, y, cw, ch, '#ffffff', { radius: 14, stroke: LINE, strokeWidth: 1.5 }),
      RECT(x1, y, cw, 150, color, { radius: 14 }),
      RECT(x1, y + 100, cw, 50, color),
      T({ text: '{{company}}', x: x1 + 24, y: y + 30, w: cw - 48, h: 28, fontSize: 18, bold: true, color: '#ffffff', align: 'center', letterSpacing: 2 }),
      T({ text: 'IDENTITY CARD', x: x1 + 24, y: y + 62, w: cw - 48, h: 20, fontSize: 11, color: tint(color, 0.75), align: 'center', letterSpacing: 4 }),
      S('ellipse', { x: x1 + cw / 2 - 70, y: y + 100, w: 140, h: 140, fill: tint(color, 0.85), stroke: '#ffffff', strokeWidth: 6 }),
      T({ text: 'Photo', x: x1 + cw / 2 - 70, y: y + 160, w: 140, h: 20, fontSize: 12, color: MUTED, align: 'center' }),
      T({ text: '{{fullName}}', x: x1 + 20, y: y + 262, w: cw - 40, h: 38, fontSize: 26, bold: true, align: 'center' }),
      T({ text: '{{jobTitle}}', x: x1 + 20, y: y + 302, w: cw - 40, h: 24, fontSize: 15, color, align: 'center' }),
      LINE_(x1 + 40, y + 346, cw - 80),
      T({ text: 'ID No:  {{idNumber}}\nJoined:  {{joinDate}}\nPhone:  {{phone}}', x: x1 + 44, y: y + 362, w: cw - 70, h: 90, fontSize: 13.5, color: '#334155', lineHeight: 1.7 })
    ];
    els.push(BARCODE(x1 + 36, y + ch - 96, cw - 72, 76, '{{idNumber}}'));

    els.push(
      RECT(x2, y, cw, ch, '#ffffff', { radius: 14, stroke: LINE, strokeWidth: 1.5 }),
      RECT(x2, y, cw, 20, color, { radius: 14 }), RECT(x2, y + 10, cw, 10, color),
      T({ text: 'Terms of use', x: x2 + 28, y: y + 56, w: cw - 56, h: 24, fontSize: 15, bold: true, color }),
      T({ text: '•  This card is the property of {{company}}.\n•  It must be carried at all times on premises.\n•  Report loss of this card immediately.\n•  If found, please return to the address below.',
        x: x2 + 28, y: y + 90, w: cw - 56, h: 200, fontSize: 13, color: '#334155', lineHeight: 1.7 }),
      LINE_(x2 + 28, y + 330, cw - 56),
      T({ text: '{{company}}\n{{address}}', x: x2 + 28, y: y + 346, w: cw - 56, h: 60, fontSize: 13, color: MUTED, lineHeight: 1.6 }),
      LINE_(x2 + 60, y + 470, cw - 120, INK, 1.2),
      T({ text: 'Authorised Signature', x: x2 + 60, y: y + 478, w: cw - 120, h: 20, fontSize: 11, color: MUTED, align: 'center' })
    );
    if (logo) els.push(...logoEls(x1 + 18, y + 18, 44, color, true));
    return { els, fields: [
      { key: 'company', type: 'text', value: 'COMPANY NAME' },
      { key: 'fullName', type: 'text', value: 'Your Name' },
      { key: 'jobTitle', type: 'text', value: 'Job Title' },
      { key: 'idNumber', type: 'text', value: 'EMP-0042' },
      { key: 'joinDate', type: 'date', value: today(), dateFormat: 'dd MMM yyyy' },
      { key: 'phone', type: 'text', value: '+91 98765 43210' },
      { key: 'address', type: 'text', value: '12 Main Street, City, Country' }
    ] };
  }
};

const agreement: TplDef = {
  id: 'agreement', name: 'Agreement', category: 'Business', orientation: 'Portrait',
  build: ({ W, H, color, logo }) => {
    const m = 70, tw = W - m * 2;
    const clauses = [
      ['1. Scope of Services', 'The Service Provider agrees to deliver the services described in the attached schedule within the agreed timeline.'],
      ['2. Payment', 'The Client agrees to pay the fees set out in the schedule within 14 days of receiving each invoice.'],
      ['3. Confidentiality', 'Both parties agree to keep all non-public information shared under this agreement strictly confidential.'],
      ['4. Termination', 'Either party may end this agreement with 30 days written notice to the other party.']
    ];
    const els: El[] = [
      T({ text: 'SERVICE AGREEMENT', x: m, y: 70, w: tw, h: 44, fontSize: 30, bold: true, color, letterSpacing: 2 }),
      LINE_(m, 126, tw, color, 3),
      T({ text: 'This agreement is made on {{agreementDate}} between:', x: m, y: 148, w: tw, h: 24, fontSize: 13.5, color: '#334155' }),
      T({ text: '{{partyA}} (the “Service Provider”)\nand\n{{partyB}} (the “Client”).', x: m, y: 184, w: tw, h: 80, fontSize: 14, bold: true, lineHeight: 1.6 })
    ];
    clauses.forEach((c, i) => {
      const y = 296 + i * 112;
      els.push(T({ text: c[0], x: m, y, w: tw, h: 24, fontSize: 15, bold: true, color }),
        T({ text: c[1], x: m, y: y + 28, w: tw, h: 60, fontSize: 13.5, color: '#334155', lineHeight: 1.6 }));
    });
    const sy = H - 190;
    els.push(
      LINE_(m, sy, 240, INK, 1.2), LINE_(W - m - 240, sy, 240, INK, 1.2),
      T({ text: '{{partyA}}\nService Provider', x: m, y: sy + 10, w: 240, h: 44, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }),
      T({ text: '{{partyB}}\nClient', x: W - m - 240, y: sy + 10, w: 240, h: 44, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }),
      T({ text: 'Date: ____________', x: m, y: sy + 66, w: 240, h: 22, fontSize: 12.5, color: MUTED }),
      T({ text: 'Date: ____________', x: W - m - 240, y: sy + 66, w: 240, h: 22, fontSize: 12.5, color: MUTED })
    );
    if (logo) els.push(...logoEls(W - m - 54, 58, 54, color));
    return { els, fields: [
      { key: 'agreementDate', type: 'date', value: today(), dateFormat: 'MMMM d, yyyy' },
      { key: 'partyA', type: 'text', value: 'Your Company Ltd.' },
      { key: 'partyB', type: 'text', value: 'Client Name' }
    ] };
  }
};

const menu: TplDef = {
  id: 'menu', name: 'Menu', category: 'Marketing', orientation: 'Portrait',
  build: ({ W, H, color, logo }) => {
    const m = 90, tw = W - m * 2;
    const els: El[] = [
      OUTLINE(28, 28, W - 56, H - 56, color, 3),
      T({ text: '{{restaurant}}', x: m, y: 82, w: tw, h: 60, fontSize: 44, bold: true, align: 'center', color, fontFamily: 'Georgia' }),
      T({ text: 'FRESH · LOCAL · SEASONAL', x: m, y: 148, w: tw, h: 22, fontSize: 12, align: 'center', color: MUTED, letterSpacing: 5 }),
      LINE_(W / 2 - 60, 190, 120, color, 2)
    ];
    const sections: [string, [string, string][]][] = [
      ['STARTERS', [['Tomato Soup', '$6'], ['Garden Salad', '$7'], ['Garlic Bread', '$5']]],
      ['MAIN COURSES', [['Grilled Chicken', '$16'], ['Vegetable Pasta', '$14'], ['Fish & Chips', '$15']]],
      ['DESSERTS', [['Chocolate Cake', '$7'], ['Fruit Tart', '$6'], ['Ice Cream', '$5']]]
    ];
    sections.forEach((s, si) => {
      const y0 = 226 + si * 270;
      els.push(T({ text: s[0], x: m, y: y0, w: tw, h: 26, fontSize: 16, bold: true, align: 'center', color, letterSpacing: 4, fontFamily: 'Georgia' }));
      s[1].forEach((it, i) => {
        const y = y0 + 46 + i * 64;
        els.push(T({ text: it[0], x: m, y, w: tw - 80, h: 24, fontSize: 17, bold: true, fontFamily: 'Georgia' }),
          T({ text: it[1], x: W - m - 70, y, w: 70, h: 24, fontSize: 17, bold: true, align: 'right', color, fontFamily: 'Georgia' }),
          T({ text: 'A short description of the dish goes here.', x: m, y: y + 26, w: tw - 80, h: 20, fontSize: 12, italic: true, color: MUTED, fontFamily: 'Georgia' }));
      });
    });
    if (logo) els.push(...logoEls(W / 2 - 24, 36, 48, color));
    return { bg: tint(color, 0.96), els, fields: [{ key: 'restaurant', type: 'text', value: 'The Garden Kitchen' }] };
  }
};

const minutes: TplDef = {
  id: 'meeting-minutes', name: 'Meeting Minutes', category: 'Business', orientation: 'Portrait',
  build: ({ W, H, color, logo }) => {
    const m = 56, tw = W - m * 2, half = (tw - 20) / 2;
    const els: El[] = [
      RECT(0, 0, W, 120, color),
      T({ text: 'MEETING MINUTES', x: m, y: 36, w: tw - 80, h: 40, fontSize: 30, bold: true, color: '#ffffff', letterSpacing: 2 }),
      T({ text: '{{meetingTitle}}', x: m, y: 78, w: tw - 80, h: 24, fontSize: 15, color: tint(color, 0.8) })
    ];
    const meta: [string, string][] = [['Date', '{{meetingDate}}'], ['Time', '{{meetingTime}}'], ['Location', '{{location}}'], ['Chair', '{{chair}}']];
    meta.forEach((k, i) => {
      const x = m + (i % 2) * (half + 20), y = 150 + Math.floor(i / 2) * 64;
      els.push(RECT(x, y, half, 52, tint(color, 0.92), { radius: 8 }),
        T({ text: k[0], x: x + 14, y: y + 8, w: half - 20, h: 16, fontSize: 11, color: MUTED }),
        T({ text: k[1], x: x + 14, y: y + 25, w: half - 20, h: 22, fontSize: 14, bold: true }));
    });
    els.push(
      T({ text: 'Attendees', x: m, y: 296, w: tw, h: 26, fontSize: 16, bold: true, color }),
      T({ text: 'Name One, Name Two, Name Three, Name Four', x: m, y: 326, w: tw, h: 24, fontSize: 13, color: '#334155' }),
      T({ text: 'Agenda & Discussion', x: m, y: 378, w: tw, h: 26, fontSize: 16, bold: true, color }),
      T({ text: '1.  Review of previous actions\n2.  Project status update\n3.  Budget and timeline\n4.  Any other business', x: m, y: 410, w: tw, h: 110, fontSize: 13.5, color: '#334155', lineHeight: 1.75 }),
      T({ text: 'Action Items', x: m, y: 548, w: tw, h: 26, fontSize: 16, bold: true, color }),
      RECT(m, 584, tw, 34, color),
      T({ text: 'Task', x: m + 12, y: 592, w: 300, h: 20, fontSize: 12, bold: true, color: '#ffffff' }),
      T({ text: 'Owner', x: m + 340, y: 592, w: 120, h: 20, fontSize: 12, bold: true, color: '#ffffff' }),
      T({ text: 'Due', x: W - m - 120, y: 592, w: 108, h: 20, fontSize: 12, bold: true, color: '#ffffff' })
    );
    for (let i = 0; i < 4; i++) {
      const y = 632 + i * 42;
      els.push(T({ text: 'Describe the action item', x: m + 12, y, w: 310, h: 20, fontSize: 13 }),
        T({ text: 'Name', x: m + 340, y, w: 120, h: 20, fontSize: 13 }),
        T({ text: '{{nextDate}}', x: W - m - 120, y, w: 108, h: 20, fontSize: 13 }),
        LINE_(m, y + 30, tw));
    }
    els.push(T({ text: 'Next meeting: {{nextDate}}', x: m, y: H - 100, w: tw, h: 24, fontSize: 13.5, bold: true, color }));
    if (logo) els.push(...logoEls(W - m - 54, 33, 54, color, true));
    return { els, fields: [
      { key: 'meetingTitle', type: 'text', value: 'Weekly Project Sync' },
      { key: 'meetingDate', type: 'date', value: today(), dateFormat: 'dd MMM yyyy' },
      { key: 'meetingTime', type: 'text', value: '10:00 AM' },
      { key: 'location', type: 'text', value: 'Conference Room A' },
      { key: 'chair', type: 'text', value: 'Chairperson' },
      { key: 'nextDate', type: 'date', value: today(), dateFormat: 'dd MMM yyyy' }
    ] };
  }
};

const newsletter: TplDef = {
  id: 'newsletter', name: 'Newsletter', category: 'Marketing', orientation: 'Portrait',
  build: ({ W, H, color, logo }) => {
    const m = 50, tw = W - m * 2, cw = (tw - 30) / 2;
    const els: El[] = [
      RECT(0, 0, W, 150, color),
      T({ text: '{{newsletterName}}', x: m, y: 40, w: tw, h: 56, fontSize: 42, bold: true, color: '#ffffff', fontFamily: 'Georgia' }),
      T({ text: 'Issue {{issueNo}}  ·  {{issueDate}}', x: m, y: 100, w: tw, h: 24, fontSize: 13, color: tint(color, 0.8), letterSpacing: 1 }),
      RECT(m, 180, tw, 230, tint(color, 0.85), { radius: 12 }),
      S('ellipse', { x: W - 260, y: 210, w: 160, h: 160, fill: tint(color, 0.6) }),
      T({ text: 'FEATURE STORY', x: m + 28, y: 214, w: 380, h: 18, fontSize: 11, bold: true, color, letterSpacing: 3 }),
      T({ text: 'The headline of your main story goes here', x: m + 28, y: 238, w: 400, h: 90, fontSize: 28, bold: true, lineHeight: 1.2, fontFamily: 'Georgia' }),
      T({ text: 'A short teaser sentence that invites readers to continue.', x: m + 28, y: 340, w: 380, h: 50, fontSize: 13.5, color: '#334155', lineHeight: 1.5 })
    ];
    for (let i = 0; i < 4; i++) {
      const x = m + (i % 2) * (cw + 30), y = 450 + Math.floor(i / 2) * 230;
      els.push(RECT(x, y, cw, 6, color),
        T({ text: 'Article headline ' + (i + 1), x, y: y + 22, w: cw, h: 52, fontSize: 19, bold: true, lineHeight: 1.2, fontFamily: 'Georgia' }),
        T({ text: 'Short summary of the article. Replace this text with your own words to tell readers what the story is about and why it matters.',
          x, y: y + 82, w: cw, h: 110, fontSize: 13, color: '#334155', lineHeight: 1.6 }));
    }
    els.push(RECT(0, H - 90, W, 90, '#f1f5f9'),
      T({ text: 'You are receiving this newsletter because you subscribed. To unsubscribe, reply with “unsubscribe”.', x: m, y: H - 58, w: tw, h: 36, fontSize: 11.5, color: MUTED, align: 'center', lineHeight: 1.5 }));
    if (logo) els.push(...logoEls(W - m - 60, 36, 60, color, true));
    return { els, fields: [
      { key: 'newsletterName', type: 'text', value: 'The Monthly Update' },
      { key: 'issueNo', type: 'number', value: 12, decimals: 0 },
      { key: 'issueDate', type: 'date', value: today(), dateFormat: 'MMMM d, yyyy' }
    ] };
  }
};

const voucher: TplDef = {
  id: 'voucher', name: 'Voucher', category: 'Marketing', orientation: 'Portrait',
  build: ({ W, color, logo }) => {
    const m = 48, cw = W - m * 2, ch = 320, y = 150, stub = 250;
    const els: El[] = [
      T({ text: 'GIFT VOUCHER', x: m, y: 70, w: cw, h: 40, fontSize: 28, bold: true, color, letterSpacing: 4, align: 'center' }),
      RECT(m, y, cw, ch, '#ffffff', { radius: 18, stroke: color, strokeWidth: 3 }),
      RECT(m, y, stub, ch, color, { radius: 18 }),
      RECT(m + stub - 30, y, 30, ch, color),
      T({ text: '{{discount}}', x: m + 10, y: y + 70, w: stub - 20, h: 90, fontSize: 70, bold: true, color: '#ffffff', align: 'center', fontFamily: 'Impact' }),
      T({ text: 'OFF', x: m + 10, y: y + 164, w: stub - 20, h: 40, fontSize: 30, bold: true, color: tint(color, 0.75), align: 'center', letterSpacing: 8 }),
      T({ text: 'Present this voucher to redeem', x: m + stub + 30, y: y + 38, w: cw - stub - 60, h: 22, fontSize: 13, color: MUTED }),
      T({ text: '{{storeName}}', x: m + stub + 30, y: y + 68, w: cw - stub - 60, h: 40, fontSize: 28, bold: true, color }),
      T({ text: 'Voucher code', x: m + stub + 30, y: y + 138, w: 200, h: 18, fontSize: 11, color: MUTED, letterSpacing: 2 }),
      RECT(m + stub + 30, y + 160, cw - stub - 60, 46, tint(color, 0.9), { radius: 8 }),
      T({ text: '{{voucherCode}}', x: m + stub + 30, y: y + 170, w: cw - stub - 60, h: 28, fontSize: 20, bold: true, align: 'center', color: INK, fontFamily: 'Courier New', letterSpacing: 4 }),
      T({ text: 'Valid until {{validUntil}}', x: m + stub + 30, y: y + 232, w: cw - stub - 60, h: 22, fontSize: 13, bold: true }),
      T({ text: 'One use per customer. Cannot be combined with other offers.', x: m + stub + 30, y: y + 262, w: cw - stub - 60, h: 40, fontSize: 11.5, color: MUTED, lineHeight: 1.4 })
    ];
    if (logo) els.push(...logoEls(m + stub / 2 - 26, y + 270, 52, color, true));
    return { els, fields: [
      { key: 'discount', type: 'percent', value: 20, decimals: 0 },
      { key: 'storeName', type: 'text', value: 'Your Store Name' },
      { key: 'voucherCode', type: 'text', value: 'SAVE-2026-ABCD' },
      { key: 'validUntil', type: 'date', value: today(), dateFormat: 'dd MMM yyyy' }
    ] };
  }
};

export const TEMPLATES: TplDef[] = [
  blank, invoice, report, resume, certificate, businessCard, idCard, agreement, menu, minutes, newsletter, voucher
];

export function toPages(r: TplResult): Page[] { return [{ id: uid(), bg: r.bg ?? '#ffffff', els: r.els }]; }
