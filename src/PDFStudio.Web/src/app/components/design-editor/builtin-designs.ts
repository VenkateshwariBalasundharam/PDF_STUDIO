// Converts any built-in template into a visual Design Editor Doc (elements, lines, text, QR, tables, fields)
// so the user can click "Edit template in editor" on ANY built-in template and edit it visually!
import { Doc, El, ElType, Field, Page, PAGE_PX, uid } from './design-model';

const INK = '#111827', MUTED = '#4b5563', LINE = '#cbd5e1', DARK_LINE = '#111827';

function base(type: ElType, o: Partial<El>): El {
  return { id: uid(), type, x: 0, y: 0, w: 100, h: 40, rot: 0, opacity: 1, ...o };
}

const T = (o: Partial<El>): El => base('text', {
  text: 'Text', fontFamily: 'Arial', fontSize: 13, bold: false, italic: false, underline: false,
  align: 'left', color: INK, lineHeight: 1.3, letterSpacing: 0, ...o
});

const S = (type: ElType, o: Partial<El>): El => base(type, { fill: 'none', stroke: DARK_LINE, strokeWidth: 1, radius: 0, ...o });
const RECT = (x: number, y: number, w: number, h: number, stroke = DARK_LINE, sw = 1, radius = 0): El =>
  S('rect', { x, y, w, h, fill: 'none', stroke, strokeWidth: sw, radius });
const LINE_ = (x: number, y: number, w: number, color = DARK_LINE, thick = 1): El =>
  S('line', { x, y: y - 6, w, h: 12, stroke: color, strokeWidth: thick });
const QR = (x: number, y: number, size: number, data: string): El =>
  base('qr', { x, y, w: size, h: size, data, color: '#000000', fill: '#ffffff' });

const today = () => new Date().toISOString().slice(0, 10);

function commonFields(): Field[] {
  return [
    { id: uid(), key: 'company', label: 'Company', type: 'text', value: 'Your Company Name' },
    { id: uid(), key: 'companyAddress', label: 'Company Address', type: 'text', value: 'Salem, Tamil Nadu • GSTIN: 33AAAPL1234F1Z5' },
    { id: uid(), key: 'invoiceNo', label: 'Invoice No', type: 'text', value: 'INV-001' },
    { id: uid(), key: 'invoiceDate', label: 'Invoice Date', type: 'date', value: today(), dateFormat: 'yyyy-MM-dd' },
    { id: uid(), key: 'customerName', label: 'Customer Name', type: 'text', value: 'Lakshmi Traders' },
    { id: uid(), key: 'customerAddress', label: 'Customer Address', type: 'text', value: '12 Main Road, Salem' },
    { id: uid(), key: 'item1Description', label: 'Item 1 Description', type: 'text', value: 'Consulting / Product Services' },
    { id: uid(), key: 'item1Quantity', label: 'Item 1 Quantity', type: 'number', value: 2 },
    { id: uid(), key: 'item1Price', label: 'Item 1 Price', type: 'currency', value: '1000.00', currency: '₹' },
    { id: uid(), key: 'item1Amount', label: 'Item 1 Amount', type: 'currency', value: '2000.00', currency: '₹' },
    { id: uid(), key: 'item2Description', label: 'Item 2 Description', type: 'text', value: 'Standard Materials / Support' },
    { id: uid(), key: 'item2Quantity', label: 'Item 2 Quantity', type: 'number', value: 1 },
    { id: uid(), key: 'item2Price', label: 'Item 2 Price', type: 'currency', value: '500.00', currency: '₹' },
    { id: uid(), key: 'item2Amount', label: 'Item 2 Amount', type: 'currency', value: '500.00', currency: '₹' },
    { id: uid(), key: 'subtotal', label: 'Subtotal', type: 'currency', value: '2500.00', currency: '₹' },
    { id: uid(), key: 'tax', label: 'Tax', type: 'currency', value: '0.00', currency: '₹' },
    { id: uid(), key: 'total', label: 'Total', type: 'currency', value: '2500.00', currency: '₹' }
  ];
}

export function getDesignForTemplate(template: { id: string; name: string; defaultPageSize?: string; defaultOrientation?: string }): Doc {
  const id = template.id || '';
  const name = template.name || 'Custom Template';
  const size = template.defaultPageSize || 'A4';
  const orientation = (id === 'fmt-certificate' || template.defaultOrientation === 'Landscape') ? 'Landscape' : 'Portrait';

  const [pw, ph] = PAGE_PX[size] ?? PAGE_PX['A4'];
  const W = orientation === 'Landscape' ? ph : pw;
  const H = orientation === 'Landscape' ? pw : ph;
  const m = 48, tw = W - m * 2;

  const els: El[] = [];
  const fields = commonFields();

  // 1. Purchase Order
  if (id === 'fmt-po') {
    els.push(
      T({ text: 'All items subject to receiving quality inspection. Material test certificates must accompany delivery.', x: m, y: 36, w: tw, h: 20, fontSize: 9, color: MUTED }),
      LINE_(m, 60, tw, LINE),
      T({ text: '{{company}}', x: m, y: 72, w: 420, h: 32, fontSize: 22, bold: true, color: INK }),
      T({ text: '{{companyAddress}}', x: m, y: 108, w: 420, h: 20, fontSize: 10, color: MUTED }),
      RECT(W - m - 170, 72, 170, 30, DARK_LINE, 1.5, 3),
      T({ text: 'PURCHASE ORDER', x: W - m - 170, y: 78, w: 170, h: 20, fontSize: 11, bold: true, align: 'center', color: INK, letterSpacing: 1 }),
      T({ text: 'PO No: {{invoiceNo}} • Date: {{invoiceDate}}', x: W - m - 280, y: 110, w: 280, h: 20, fontSize: 10, align: 'right' }),
      LINE_(m, 136, tw, DARK_LINE, 2),
      // Vendor / Ship To boxes
      RECT(m, 150, (tw - 16) / 2, 70, DARK_LINE, 1, 4),
      T({ text: 'Vendor / Supplier', x: m + 10, y: 156, w: 200, h: 16, fontSize: 8.5, color: MUTED }),
      T({ text: '{{customerName}}\n{{customerAddress}}', x: m + 10, y: 174, w: (tw - 16) / 2 - 20, h: 40, fontSize: 11, bold: true }),
      RECT(m + (tw - 16) / 2 + 16, 150, (tw - 16) / 2, 70, DARK_LINE, 1, 4),
      T({ text: 'Ship To / Warehouse', x: m + (tw - 16) / 2 + 26, y: 156, w: 200, h: 16, fontSize: 8.5, color: MUTED }),
      T({ text: '{{company}} Receiving Warehouse\nCentral Gate 3 • Inspection on Arrival', x: m + (tw - 16) / 2 + 26, y: 174, w: (tw - 16) / 2 - 20, h: 40, fontSize: 10, bold: true }),
      // Table Header
      LINE_(m, 238, tw, DARK_LINE, 2),
      T({ text: '#', x: m + 6, y: 244, w: 30, h: 20, fontSize: 10, bold: true }),
      T({ text: 'Description of Materials / Supplies', x: m + 40, y: 244, w: 340, h: 20, fontSize: 10, bold: true }),
      T({ text: 'Qty', x: W - m - 280, y: 244, w: 60, h: 20, fontSize: 10, bold: true, align: 'right' }),
      T({ text: 'Price', x: W - m - 190, y: 244, w: 80, h: 20, fontSize: 10, bold: true, align: 'right' }),
      T({ text: 'Amount', x: W - m - 90, y: 244, w: 86, h: 20, fontSize: 10, bold: true, align: 'right' }),
      LINE_(m, 270, tw, DARK_LINE, 1.5),
      // Item Rows (Rows 1 & 2)
      T({ text: '1', x: m + 6, y: 280, w: 30, h: 20, fontSize: 11 }),
      T({ text: '{{item1Description}}', x: m + 40, y: 280, w: 340, h: 20, fontSize: 11 }),
      T({ text: '{{item1Quantity}}', x: W - m - 280, y: 280, w: 60, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item1Price}}', x: W - m - 190, y: 280, w: 80, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item1Amount}}', x: W - m - 90, y: 280, w: 86, h: 20, fontSize: 11, align: 'right' }),
      LINE_(m, 308, tw, LINE),
      T({ text: '2', x: m + 6, y: 318, w: 30, h: 20, fontSize: 11 }),
      T({ text: '{{item2Description}}', x: m + 40, y: 318, w: 340, h: 20, fontSize: 11 }),
      T({ text: '{{item2Quantity}}', x: W - m - 280, y: 318, w: 60, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item2Price}}', x: W - m - 190, y: 318, w: 80, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item2Amount}}', x: W - m - 90, y: 318, w: 86, h: 20, fontSize: 11, align: 'right' }),
      LINE_(m, 346, tw, LINE),
      // Totals
      T({ text: 'Subtotal:', x: W - m - 240, y: 366, w: 120, h: 20, fontSize: 11, align: 'right', color: MUTED }),
      T({ text: '{{subtotal}}', x: W - m - 110, y: 366, w: 106, h: 20, fontSize: 11, align: 'right', bold: true }),
      T({ text: 'Tax:', x: W - m - 240, y: 392, w: 120, h: 20, fontSize: 11, align: 'right', color: MUTED }),
      T({ text: '{{tax}}', x: W - m - 110, y: 392, w: 106, h: 20, fontSize: 11, align: 'right', bold: true }),
      LINE_(W - m - 240, 420, 240, DARK_LINE, 2),
      T({ text: 'Total:', x: W - m - 240, y: 430, w: 120, h: 26, fontSize: 15, bold: true, align: 'right' }),
      T({ text: '{{total}}', x: W - m - 110, y: 430, w: 106, h: 26, fontSize: 15, bold: true, align: 'right' }),
      LINE_(W - m - 240, 460, 240, DARK_LINE, 1.5),
      // QR & Foot
      QR(m, 366, 80, '{{invoiceNo}}'),
      T({ text: 'Scan to verify PO', x: m, y: 452, w: 80, h: 14, fontSize: 8, color: MUTED, align: 'center' }),
      T({ text: 'All items subject to receiving quality inspection. Material test certificates must accompany delivery.', x: m, y: H - 60, w: tw, h: 20, fontSize: 9, color: MUTED, align: 'center' })
    );
  }
  // 2. Certificate of Achievement (Landscape)
  else if (id === 'fmt-certificate') {
    els.push(
      RECT(m, 40, tw, H - 80, DARK_LINE, 3, 4),
      RECT(m + 8, 48, tw - 16, H - 96, LINE, 1, 2),
      T({ text: '{{company}}', x: m + 30, y: 70, w: tw - 60, h: 24, fontSize: 13, bold: true, align: 'center', letterSpacing: 2 }),
      T({ text: 'CERTIFICATE OF RECOGNITION', x: m + 30, y: 102, w: tw - 60, h: 40, fontSize: 24, bold: true, align: 'center', letterSpacing: 3 }),
      T({ text: 'This certificate is proudly conferred upon', x: m + 30, y: 150, w: tw - 60, h: 20, fontSize: 11, italic: true, align: 'center', color: MUTED }),
      T({ text: '{{customerName}}', x: m + 100, y: 180, w: tw - 200, h: 36, fontSize: 24, bold: true, align: 'center' }),
      LINE_(W / 2 - 160, 224, 320, DARK_LINE, 2),
      T({ text: 'in honor of outstanding completion of the program deliverables recorded under reference {{invoiceNo}} on {{invoiceDate}}.', x: m + 80, y: 240, w: tw - 160, h: 40, fontSize: 11, align: 'center', lineHeight: 1.5 }),
      // Signatures
      LINE_(m + 70, H - 120, 180, DARK_LINE, 1),
      T({ text: 'Authorized Dean / Officer', x: m + 70, y: H - 112, w: 180, h: 18, fontSize: 9.5, bold: true, align: 'center' }),
      QR(W / 2 - 30, H - 150, 60, '{{invoiceNo}}'),
      T({ text: 'Doc: {{invoiceNo}}', x: W / 2 - 50, y: H - 86, w: 100, h: 14, fontSize: 7.5, color: MUTED, align: 'center' }),
      LINE_(W - m - 250, H - 120, 180, DARK_LINE, 1),
      T({ text: 'Academic Registrar', x: W - m - 250, y: H - 112, w: 180, h: 18, fontSize: 9.5, bold: true, align: 'center' })
    );
  }
  // 3. Tax Invoice (GST / VAT)
  else if (id === 'fmt-tax') {
    els.push(
      LINE_(m, 40, tw, DARK_LINE, 2),
      T({ text: 'TAX INVOICE', x: m, y: 48, w: tw, h: 28, fontSize: 18, bold: true, align: 'center', letterSpacing: 3 }),
      LINE_(m, 80, tw, DARK_LINE, 2),
      // 3 Ruled Party Boxes
      RECT(m, 92, (tw - 16) / 3, 76, DARK_LINE, 1),
      T({ text: 'Seller / Consignor', x: m + 8, y: 98, w: 140, h: 16, fontSize: 8.5, color: MUTED }),
      T({ text: '{{company}}\n{{companyAddress}}', x: m + 8, y: 116, w: (tw - 16) / 3 - 16, h: 48, fontSize: 10, bold: true }),
      RECT(m + (tw - 16) / 3 + 8, 92, (tw - 16) / 3, 76, DARK_LINE, 1),
      T({ text: 'Buyer / Consignee', x: m + (tw - 16) / 3 + 16, y: 98, w: 140, h: 16, fontSize: 8.5, color: MUTED }),
      T({ text: '{{customerName}}\n{{customerAddress}}', x: m + (tw - 16) / 3 + 16, y: 116, w: (tw - 16) / 3 - 16, h: 48, fontSize: 10, bold: true }),
      RECT(m + ((tw - 16) / 3) * 2 + 16, 92, (tw - 16) / 3, 76, DARK_LINE, 1),
      T({ text: 'Invoice Details', x: m + ((tw - 16) / 3) * 2 + 24, y: 98, w: 140, h: 16, fontSize: 8.5, color: MUTED }),
      T({ text: 'Invoice No: {{invoiceNo}}\nDate: {{invoiceDate}}\nPlace: Tamil Nadu', x: m + ((tw - 16) / 3) * 2 + 24, y: 116, w: (tw - 16) / 3 - 16, h: 48, fontSize: 10, bold: true }),
      // Item Table
      RECT(m, 180, tw, 30, DARK_LINE, 1),
      T({ text: '#', x: m + 8, y: 188, w: 30, h: 18, fontSize: 10, bold: true }),
      T({ text: 'Goods / Services Description', x: m + 42, y: 188, w: 340, h: 18, fontSize: 10, bold: true }),
      T({ text: 'Qty', x: W - m - 280, y: 188, w: 60, h: 18, fontSize: 10, bold: true, align: 'right' }),
      T({ text: 'Rate', x: W - m - 190, y: 188, w: 80, h: 18, fontSize: 10, bold: true, align: 'right' }),
      T({ text: 'Taxable Amount', x: W - m - 110, y: 188, w: 102, h: 18, fontSize: 10, bold: true, align: 'right' }),
      // Item Rows
      RECT(m, 210, tw, 36, LINE, 1),
      T({ text: '1', x: m + 8, y: 220, w: 30, h: 20, fontSize: 11 }),
      T({ text: '{{item1Description}}', x: m + 42, y: 220, w: 340, h: 20, fontSize: 11 }),
      T({ text: '{{item1Quantity}}', x: W - m - 280, y: 220, w: 60, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item1Price}}', x: W - m - 190, y: 220, w: 80, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item1Amount}}', x: W - m - 110, y: 220, w: 102, h: 20, fontSize: 11, align: 'right' }),
      RECT(m, 246, tw, 36, LINE, 1),
      T({ text: '2', x: m + 8, y: 256, w: 30, h: 20, fontSize: 11 }),
      T({ text: '{{item2Description}}', x: m + 42, y: 256, w: 340, h: 20, fontSize: 11 }),
      T({ text: '{{item2Quantity}}', x: W - m - 280, y: 256, w: 60, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item2Price}}', x: W - m - 190, y: 256, w: 80, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item2Amount}}', x: W - m - 110, y: 256, w: 102, h: 20, fontSize: 11, align: 'right' }),
      // Totals
      T({ text: 'Subtotal:', x: W - m - 250, y: 300, w: 130, h: 20, fontSize: 11, align: 'right', color: MUTED }),
      T({ text: '{{subtotal}}', x: W - m - 110, y: 300, w: 106, h: 20, fontSize: 11, align: 'right', bold: true }),
      T({ text: 'GST / Tax:', x: W - m - 250, y: 326, w: 130, h: 20, fontSize: 11, align: 'right', color: MUTED }),
      T({ text: '{{tax}}', x: W - m - 110, y: 326, w: 106, h: 20, fontSize: 11, align: 'right', bold: true }),
      LINE_(W - m - 250, 354, 250, DARK_LINE, 2),
      T({ text: 'Total Tax Invoice:', x: W - m - 250, y: 364, w: 130, h: 24, fontSize: 13, bold: true, align: 'right' }),
      T({ text: '{{total}}', x: W - m - 110, y: 364, w: 106, h: 24, fontSize: 13, bold: true, align: 'right' }),
      LINE_(W - m - 250, 394, 250, DARK_LINE, 1.5),
      QR(m, 300, 80, '{{invoiceNo}}'),
      T({ text: 'This is a computer generated tax invoice.', x: m, y: H - 50, w: tw, h: 20, fontSize: 9, color: MUTED, align: 'center' })
    );
  }
  // 4. Monthly Salary Pay Slip
  else if (id === 'fmt-payslip') {
    els.push(
      T({ text: '{{company}}', x: m, y: 44, w: 400, h: 28, fontSize: 20, bold: true }),
      T({ text: '{{companyAddress}}', x: m, y: 74, w: 400, h: 18, fontSize: 9.5, color: MUTED }),
      RECT(W - m - 160, 44, 160, 28, DARK_LINE, 1.5, 3),
      T({ text: 'SALARY PAYSLIP', x: W - m - 160, y: 50, w: 160, h: 18, fontSize: 10, bold: true, align: 'center', letterSpacing: 1 }),
      T({ text: 'Ref: {{invoiceNo}} • Date: {{invoiceDate}}', x: W - m - 260, y: 76, w: 260, h: 18, fontSize: 9.5, align: 'right' }),
      LINE_(m, 102, tw, DARK_LINE, 2),
      // Employee info box
      RECT(m, 114, tw, 60, DARK_LINE, 1, 4),
      T({ text: 'Employee Name: {{customerName}}', x: m + 14, y: 124, w: 280, h: 18, fontSize: 10.5, bold: true }),
      T({ text: 'Department / Role: {{customerAddress}}', x: m + 14, y: 146, w: 280, h: 18, fontSize: 9.5, color: MUTED }),
      T({ text: 'Pay Period: {{invoiceDate}}', x: W - m - 260, y: 124, w: 240, h: 18, fontSize: 10, align: 'right' }),
      T({ text: 'UAN / PAN Ref: Verified', x: W - m - 260, y: 146, w: 240, h: 18, fontSize: 9.5, align: 'right', color: MUTED }),
      // Earnings Breakdown Table
      LINE_(m, 186, tw, DARK_LINE, 2),
      T({ text: 'Salary Components & Allowances', x: m + 10, y: 192, w: 380, h: 18, fontSize: 10, bold: true }),
      T({ text: 'Gross Disbursed', x: W - m - 130, y: 192, w: 120, h: 18, fontSize: 10, bold: true, align: 'right' }),
      LINE_(m, 214, tw, DARK_LINE, 1.5),
      T({ text: '{{item1Description}} (Basic & HRA)', x: m + 10, y: 224, w: 380, h: 20, fontSize: 11 }),
      T({ text: '{{item1Amount}}', x: W - m - 130, y: 224, w: 120, h: 20, fontSize: 11, align: 'right' }),
      LINE_(m, 250, tw, LINE),
      T({ text: '{{item2Description}} (Special & Travel Allowances)', x: m + 10, y: 260, w: 380, h: 20, fontSize: 11 }),
      T({ text: '{{item2Amount}}', x: W - m - 130, y: 260, w: 120, h: 20, fontSize: 11, align: 'right' }),
      LINE_(m, 286, tw, LINE),
      // Net Disbursed Salary Box
      RECT(m, 310, tw, 50, DARK_LINE, 2, 4),
      T({ text: 'NET SALARY DISBURSED\nDirect electronic transfer to employee bank account', x: m + 16, y: 318, w: 360, h: 36, fontSize: 9, bold: true }),
      T({ text: '{{total}}', x: W - m - 180, y: 320, w: 160, h: 30, fontSize: 18, bold: true, align: 'right' }),
      T({ text: 'Computer-generated payslip. No physical signature required.', x: m, y: H - 50, w: tw, h: 20, fontSize: 9, color: MUTED, align: 'center' })
    );
  }
  // 5. General & Default (Classic Boxed, Modern, Quotation, Medical, etc.)
  else {
    const docTitle = id === 'fmt-quote' ? 'QUOTATION' : (id === 'fmt-receipt' ? 'RECEIPT' : (id === 'fmt-medical' ? 'PATIENT BILL' : 'INVOICE'));
    els.push(
      T({ text: '{{company}}', x: m, y: 44, w: 420, h: 32, fontSize: 24, bold: true, color: INK }),
      T({ text: '{{companyAddress}}', x: m, y: 80, w: 420, h: 20, fontSize: 10, color: MUTED }),
      RECT(W - m - 160, 44, 160, 30, DARK_LINE, 1.5, 3),
      T({ text: docTitle, x: W - m - 160, y: 50, w: 160, h: 20, fontSize: 12, bold: true, align: 'center', letterSpacing: 1 }),
      T({ text: 'No: {{invoiceNo}} • Date: {{invoiceDate}}', x: W - m - 260, y: 82, w: 260, h: 20, fontSize: 10, align: 'right' }),
      LINE_(m, 110, tw, DARK_LINE, 2),
      // Bill to
      RECT(m, 124, tw, 64, DARK_LINE, 1, 4),
      T({ text: 'Billed to / Customer Details', x: m + 12, y: 132, w: 200, h: 16, fontSize: 8.5, color: MUTED }),
      T({ text: '{{customerName}}\n{{customerAddress}}', x: m + 12, y: 150, w: tw - 24, h: 32, fontSize: 11, bold: true }),
      // Table Header
      LINE_(m, 204, tw, DARK_LINE, 2),
      T({ text: '#', x: m + 6, y: 210, w: 30, h: 20, fontSize: 10, bold: true }),
      T({ text: 'Description', x: m + 40, y: 210, w: 340, h: 20, fontSize: 10, bold: true }),
      T({ text: 'Qty', x: W - m - 280, y: 210, w: 60, h: 20, fontSize: 10, bold: true, align: 'right' }),
      T({ text: 'Price', x: W - m - 190, y: 210, w: 80, h: 20, fontSize: 10, bold: true, align: 'right' }),
      T({ text: 'Amount', x: W - m - 90, y: 210, w: 86, h: 20, fontSize: 10, bold: true, align: 'right' }),
      LINE_(m, 236, tw, DARK_LINE, 1.5),
      // Rows 1 & 2
      T({ text: '1', x: m + 6, y: 246, w: 30, h: 20, fontSize: 11 }),
      T({ text: '{{item1Description}}', x: m + 40, y: 246, w: 340, h: 20, fontSize: 11 }),
      T({ text: '{{item1Quantity}}', x: W - m - 280, y: 246, w: 60, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item1Price}}', x: W - m - 190, y: 246, w: 80, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item1Amount}}', x: W - m - 90, y: 246, w: 86, h: 20, fontSize: 11, align: 'right' }),
      LINE_(m, 274, tw, LINE),
      T({ text: '2', x: m + 6, y: 284, w: 30, h: 20, fontSize: 11 }),
      T({ text: '{{item2Description}}', x: m + 40, y: 284, w: 340, h: 20, fontSize: 11 }),
      T({ text: '{{item2Quantity}}', x: W - m - 280, y: 284, w: 60, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item2Price}}', x: W - m - 190, y: 284, w: 80, h: 20, fontSize: 11, align: 'right' }),
      T({ text: '{{item2Amount}}', x: W - m - 90, y: 284, w: 86, h: 20, fontSize: 11, align: 'right' }),
      LINE_(m, 312, tw, LINE),
      // Totals
      T({ text: 'Subtotal:', x: W - m - 240, y: 334, w: 120, h: 20, fontSize: 11, align: 'right', color: MUTED }),
      T({ text: '{{subtotal}}', x: W - m - 110, y: 334, w: 106, h: 20, fontSize: 11, align: 'right', bold: true }),
      T({ text: 'Tax:', x: W - m - 240, y: 360, w: 120, h: 20, fontSize: 11, align: 'right', color: MUTED }),
      T({ text: '{{tax}}', x: W - m - 110, y: 360, w: 106, h: 20, fontSize: 11, align: 'right', bold: true }),
      LINE_(W - m - 240, 388, 240, DARK_LINE, 2),
      T({ text: 'Total:', x: W - m - 240, y: 398, w: 120, h: 26, fontSize: 15, bold: true, align: 'right' }),
      T({ text: '{{total}}', x: W - m - 110, y: 398, w: 106, h: 26, fontSize: 15, bold: true, align: 'right' }),
      LINE_(W - m - 240, 428, 240, DARK_LINE, 1.5),
      QR(m, 334, 80, '{{invoiceNo}}'),
      T({ text: 'Thank you for your business.', x: m, y: H - 50, w: tw, h: 20, fontSize: 9, color: MUTED, align: 'center' })
    );
  }

  return {
    title: name,
    size,
    orientation,
    pages: [{ id: uid(), bg: '#ffffff', els }],
    fields,
    locale: 'en-US'
  };
}

