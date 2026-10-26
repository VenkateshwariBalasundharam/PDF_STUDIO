import { BILL_TEMPLATE } from './bill-template';

// Ready-made invoice and business document formats.
// All built-in templates use a pure black-and-white print design with ZERO background colors
// and ZERO fills, ensuring clean ink-on-paper presentation suitable for laser printing and corporate documentation.

export interface BillFormat { id: string; name: string; description: string; pageSize: string; orientation: string; html: string; }

const BASE_STYLE = (BILL_TEMPLATE.match(/<style>[\s\S]*?<\/style>/) ?? [''])[0];
const SUMMARY = (BILL_TEMPLATE.match(/\{\{#showSummary\}\}[\s\S]*?\{\{\/showSummary\}\}/) ?? [''])[0];

const ITEMS_ROWS = '{{#items}}<tr><td class="n">{{sno}}</td><td>{{description}}</td><td class="r">{{quantity}}</td><td class="r">{{price}}</td><td class="r">{{lineTotal}}</td></tr>{{/items}}';
const ITEMS_HEAD = '<thead><tr><th class="n">#</th><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>';
const SECURE = '{{#hasSecure}}<div>{{secureLabel}}: <b>{{secureValue}}</b></div>{{/hasSecure}}';
const TOTALS = '<table class="totals"><tr><td>Subtotal</td><td class="r">{{subtotal}}</td></tr><tr><td>{{taxLabel}}</td><td class="r">{{tax}}</td></tr><tr class="grand"><td>Total</td><td class="r">{{total}}</td></tr></table>';
const INVOICE_CHART = '{{#hasInvoiceChart}}<div class="invoice-chart-box" style="{{invoiceChartBoxStyle}}"><div class="invoice-chart-title">{{invoiceChartTitle}}</div>{{{invoiceChartSvg}}}</div>{{/hasInvoiceChart}}';

// Compact chart that sits inside a flex row (used by the rent receipt footer)
const INVOICE_CHART_INLINE = '{{#hasInvoiceChart}}<div class="invoice-chart-box" style="flex:1;max-width:250px;margin:0 14px;padding:4px 8px;"><div class="invoice-chart-title">{{invoiceChartTitle}}</div>{{{invoiceChartSvg}}}</div>{{/hasInvoiceChart}}';

// Small chart row used by every format: sits at the bottom-left, inside the receipt's own border when the
// format has one outer wrapper <div>, otherwise right after the content.
const CHART_FOOTER = '{{#hasInvoiceChart}}<div style="display:flex;justify-content:flex-start;margin-top:10px;"><div class="invoice-chart-box" style="{{invoiceChartFooterStyle}}margin:0;padding:4px 8px;"><div class="invoice-chart-title">{{invoiceChartTitle}}</div>{{{invoiceChartSvg}}}</div></div>{{/hasInvoiceChart}}';

const withChart = (body: string): string => {
  if (body.includes('{{#hasInvoiceChart}}')) return body;          // the format places the chart itself
  const t = body.trim();
  const tokens = [...t.matchAll(/<div\b|<\/div>/g)];
  let depth = 0, closesAtEnd = false;
  if (t.startsWith('<div') && tokens.length) {
    for (let i = 0; i < tokens.length; i++) {
      depth += tokens[i][0] === '<div' ? 1 : -1;
      if (depth === 0) { closesAtEnd = i === tokens.length - 1 && tokens[i].index! + 6 === t.length; break; }
    }
  }
  if (closesAtEnd) {
    const last = t.lastIndexOf('</div>');
    return t.slice(0, last) + CHART_FOOTER + t.slice(last);
  }
  return t + '\n' + CHART_FOOTER;
};

const make = (
  id: string,
  name: string,
  description: string,
  css: string,
  body: string,
  pageSize: string = 'A4',
  orientation: string = 'Portrait'
): BillFormat => ({
  id, name, description, pageSize, orientation,
  html: `${BASE_STYLE}\n<style>${css}</style>\n${withChart(body)}\n${SUMMARY}`
});

export const BILL_FORMATS: BillFormat[] = [
  // 1. Classic Boxed
  make('fmt-classic', 'Classic Boxed Invoice', 'Traditional monochrome invoice with a bordered header box and a fully ruled item table.',
    `.invoice{border:1px solid #111;padding:12px;border-bottom:1px solid #111}
     .head{border:1px solid #111;padding:8px 10px}
     table.items th,table.items td{border:1px solid #111}
     table.items th{background:none;color:#111;border-bottom:2px solid #111}`,
    `<div class="head"><div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
      <div class="right"><div class="title">INVOICE</div><div>No: <b>{{invoiceNo}}</b></div><div>Date: {{invoiceDate}}</div></div></div>
     <div class="billto"><div class="muted">Billed to</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">Thank you for your business.</div>`),

  // 2. Modern Clean Frame
  make('fmt-modern', 'Modern Clean Frame', 'Contemporary clean-bordered header frame with crisp typography and ruled totals.',
    `.band{background:none;color:#111;border:2px solid #111;padding:12px 14px;display:flex;justify-content:space-between;align-items:flex-start;border-radius:4px;margin-bottom:14px}
     .band h1{margin:0;font-size:20pt;color:#111}.band .muted{color:#555}
     .band .title{font-size:20pt;letter-spacing:3px;color:#111}
     table.items th{background:none;color:#111;border-bottom:2px solid #111}
     table.items td{border-bottom:1px solid #ccc}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:bold}`,
    `<div class="band"><div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
      <div class="right"><div class="title">INVOICE</div><div>No: <b>{{invoiceNo}}</b></div><div>{{invoiceDate}}</div></div></div>
     <div class="billto"><div class="muted">Bill to</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">Thank you for your business.</div>`),

  // 3. Minimal Clean
  make('fmt-minimal', 'Minimal Clean', 'Plain and airy monochrome: no heavy boxes, thin neutral lines only. Ideal for services.',
    `.invoice{border-bottom:none}
     .mhead h1{font-size:16pt;margin:0;color:#111}
     .mhead{display:flex;justify-content:space-between;margin-bottom:22px}
     table.items th{background:none;border-bottom:2px solid #111;text-transform:uppercase;font-size:8.5pt;letter-spacing:1px;color:#111}
     table.items td{border-bottom:1px solid #ddd}`,
    `<div class="mhead"><div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
      <div class="right"><div class="muted">Invoice</div><b>{{invoiceNo}}</b><div class="muted">{{invoiceDate}}</div></div></div>
     <div class="billto"><b>{{customerName}}</b><div class="muted">{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}`),

  // 4. Tax Invoice (GST / VAT)
  make('fmt-tax', 'Tax Invoice (GST / VAT)', 'Formal TAX INVOICE with ruled seller and buyer blocks and protected tax ID without shaded fills.',
    `.parties{display:flex;gap:12px;margin-bottom:12px}
     .parties>div{flex:1;border:1px solid #111;padding:8px 10px}
     .tax-title{text-align:center;font-size:16pt;font-weight:bold;letter-spacing:3px;border-top:2px solid #111;border-bottom:2px solid #111;padding:6px 0;margin-bottom:12px;color:#111}
     table.items th,table.items td{border:1px solid #111}
     table.items th{background:none;color:#111;border-bottom:2px solid #111}`,
    `<div class="tax-title">TAX INVOICE</div>
     <div class="parties">
       <div><div class="muted">Seller</div><b>{{company}}</b><div>{{companyAddress}}</div></div>
       <div><div class="muted">Buyer</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
       <div><div class="muted">Invoice details</div>No: <b>{{invoiceNo}}</b><div>Date: {{invoiceDate}}</div></div>
     </div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">This is a computer generated tax invoice.</div>`),

  // 5. Compact Receipt
  make('fmt-receipt', 'Compact Receipt', 'Narrow, centred receipt layout for quick cash-memo bills with monospace numbers.',
    `.invoice{max-width:380px;margin:0 auto 14px;border:1px dashed #111;padding:12px;font-family:"Courier New",monospace}
     .rc{text-align:center;margin-bottom:8px}.rc h1{font-size:14pt;margin:0;color:#111}
     .invoice table.items th{background:none;border-bottom:1px dashed #111;font-size:9pt;color:#111}
     .invoice table.items td{border-bottom:none;padding:2px 4px}
     .invoice table.totals{width:100%}`,
    `<div class="rc"><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div><div>Receipt {{invoiceNo}} &middot; {{invoiceDate}}</div></div>
     <div>{{customerName}}</div>${SECURE}
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="rc foot">Thank you! Visit again.</div>`),

  // 6. Quotation / Estimate
  make('fmt-quote', 'Quotation / Estimate', 'Same layout as an invoice but titled QUOTATION with validity notes and no background fills.',
    `table.items th{background:none;border-bottom:2px solid #111;color:#111}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:bold}`,
    `<div class="head"><div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
      <div class="right"><div class="title" style="color:#111;">QUOTATION</div><div>Ref: <b>{{invoiceNo}}</b></div><div>Date: {{invoiceDate}}</div></div></div>
     <div class="billto"><div class="muted">Prepared for</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">This quotation is valid for 15 days. Prices are subject to change after that.</div>`),

  // 7. Executive Corporate
  make('fmt-executive', 'Executive Corporate B2B', 'Corporate B2B layout with bordered header, wire transfer details, and clean line styling.',
    `.exec-head{background:none;color:#111;border:2px solid #111;padding:14px 16px;border-radius:4px;display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
     .exec-head h1{margin:0;font-size:18pt;color:#111}.exec-head .muted{color:#555}
     .exec-head .title{color:#111;font-size:18pt;font-weight:900;letter-spacing:3px}
     table.items th{background:none;border-bottom:2px solid #111;color:#111}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:800}
     .bank-wire{border:1px dashed #111;border-radius:4px;padding:8px 12px;font-size:8pt;color:#111;margin-top:12px;background:none}`,
    `<div class="exec-head">
       <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
       <div class="right"><div class="title">INVOICE</div><div>No: <b>{{invoiceNo}}</b></div><div>Date: {{invoiceDate}}</div></div>
     </div>
     <div class="billto"><div class="muted">Client Details</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="bank-wire"><b>Bank Wire Transfer:</b> Account: 50200084910291 &bull; IFSC: HDFC0001234 &bull; Please cite ref {{invoiceNo}} on remittance.</div>
     <div class="foot">Thank you for your valued partnership.</div>`),

  // 8. Medical & Clinic Patient Bill
  make('fmt-medical', 'Medical & Clinic Patient Bill', 'Healthcare layout with patient details, doctor seals, and neutral rules without color or fills.',
    `.med-head{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
     .med-head h1{color:#111;font-size:16pt;margin:0}
     .med-badge{background:none;color:#111;border:1px solid #111;font-weight:bold;padding:3px 8px;border-radius:3px;font-size:8.5pt}
     table.items th{background:none;border-bottom:2px solid #111;color:#111}
     .doc-seal{text-align:right;margin-top:18px;font-size:8pt;color:#111}`,
    `<div class="med-head">
       <div><h1>&#x271A; {{company}}</h1><div class="muted">{{companyAddress}}</div></div>
       <div class="right"><span class="med-badge">PATIENT BILL / RECEIPT</span><div style="margin-top:4px;">Bill: <b>{{invoiceNo}}</b> &bull; Date: {{invoiceDate}}</div></div>
     </div>
     <div class="billto"><div class="muted">Patient / Billing To</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="doc-seal">Authorized Doctor / Hospital Seal & Signature ___________________</div>
     <div class="foot">Valid for medical insurance reimbursement. Wishing you good health.</div>`),

  // 9. Logistics & Delivery Challan
  make('fmt-logistics', 'Logistics & Delivery Challan', 'Transport & freight dispatch challan with vehicle info and goods acknowledgment in clean lines.',
    `.challan-head{border:1px solid #111;border-radius:4px;padding:12px;margin-bottom:12px}
     .challan-top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #111;padding-bottom:8px;margin-bottom:10px}
     .challan-top h1{color:#111;font-size:15pt;margin:0}
     .challan-badge{background:none;color:#111;border:1px solid #111;padding:3px 8px;border-radius:3px;font-weight:bold;font-size:8.5pt}
     table.items th{background:none;color:#111;border:1px solid #111;border-bottom:2px solid #111}
     table.items td{border:1px solid #ccc}
     .sign-row{display:flex;justify-content:space-between;margin-top:20px;font-size:8pt;color:#111}`,
    `<div class="challan-head">
       <div class="challan-top">
         <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
         <div class="right"><span class="challan-badge">DELIVERY CHALLAN</span><div>Ref: <b>{{invoiceNo}}</b> &bull; Date: {{invoiceDate}}</div></div>
       </div>
       <div style="display:flex;justify-content:space-between;gap:12px;font-size:8.5pt;">
         <div><div class="muted">Consignor (Dispatch)</div><b>{{company}}</b></div>
         <div><div class="muted">Consignee (Ship To)</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
         <div><div class="muted">Transport Details</div>Road Freight &bull; Driver Confirmed</div>
       </div>
     </div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="sign-row">
       <div>Prepared By: ___________________</div>
       <div>Transporter Signature: ___________________</div>
       <div>Receiver Goods Seal & Date: ___________________</div>
     </div>`),

  // 10. Freelance & Creative Studio
  make('fmt-freelance', 'Freelance & Studio Invoice', 'Clean minimalist layout with deliverables and hourly breakdown in black and clean rules.',
    `.free-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
     .free-head h1{color:#111;font-size:18pt;font-weight:800;margin:0}
     .free-badge{background:none;color:#111;border:1px solid #111;padding:3px 8px;border-radius:3px;font-weight:700;font-size:8.5pt}
     table.items th{border-bottom:2px solid #111;color:#111;background:none;text-transform:uppercase;font-size:8.5pt}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:bold}`,
    `<div class="free-head">
       <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
       <div class="right"><span class="free-badge">STUDIO INVOICE</span><div># <b>{{invoiceNo}}</b> &bull; {{invoiceDate}}</div></div>
     </div>
     <div class="billto"><div class="muted">Invoiced to</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">Thank you for the creative collaboration! Payment via Bank Transfer / UPI.</div>`),

  // 11. SaaS & Subscription Receipt
  make('fmt-saas', 'SaaS & Subscription Receipt', 'Clean black & white cloud recurring membership billing layout showing active tier and cycle.',
    `.saas-bar{background:none;color:#111;border:2px solid #111;padding:12px 16px;border-radius:4px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
     .saas-bar h1{color:#111;font-size:16pt;margin:0}
     .saas-status{background:none;color:#111;border:1px solid #111;font-size:8pt;font-weight:bold;padding:4px 8px;border-radius:3px;display:inline-block;margin-bottom:10px}
     table.items th{background:none;border-bottom:2px solid #111;color:#111}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:bold}`,
    `<div class="saas-bar">
       <div><h1>{{company}}</h1><div style="font-size:8pt;color:#555;">Cloud Platform & Subscription Services &bull; {{companyAddress}}</div></div>
       <div class="right"><div style="font-size:13pt;font-weight:bold;">SUBSCRIPTION RECEIPT</div><div>Inv: <b>{{invoiceNo}}</b> &bull; {{invoiceDate}}</div></div>
     </div>
     <div style="display:flex;justify-content:space-between;align-items:center;">
       <div class="billto"><div class="muted">Billed Subscriber</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
       <div><span class="saas-status">&#x2714; AUTO-PAID &bull; RECEIPT GENERATED</span></div>
     </div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">Manage your active subscription anytime in your account settings.</div>`),

  // 12. Automobile & Garage Repair
  make('fmt-auto', 'Automobile & Workshop Job Card', 'Repair and service billing format with vehicle metadata, parts and labor in crisp lines.',
    `.auto-head{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
     .auto-head h1{color:#111;font-size:16pt;font-weight:900;margin:0}
     .auto-tag{background:none;color:#111;border:1px solid #111;padding:3px 8px;border-radius:3px;font-weight:bold;font-size:8.5pt}
     table.items th{background:none;border-bottom:2px solid #111;color:#111}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:bold}`,
    `<div class="auto-head">
       <div><h1>&#x1F697; {{company}}</h1><div class="muted">Automotive Care & Diagnostics &bull; {{companyAddress}}</div></div>
       <div class="right"><span class="auto-tag">JOB CARD / TAX INVOICE</span><div style="margin-top:4px;">No: <b>{{invoiceNo}}</b> &bull; {{invoiceDate}}</div></div>
     </div>
     <div class="billto"><div class="muted">Customer & Vehicle Owner</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">Warranty on replaced genuine parts: 6 Months / 10,000 KM. Thank you for choosing our workshop!</div>`),

  // 13. Certificate of Achievement & Completion (Landscape)
  make('fmt-certificate', 'Certificate of Completion & Achievement', 'Classical monochrome landscape award with double border rule and seal without background fills.',
    `.cert-wrap{border:4px double #111;padding:24px;text-align:center;background:none;border-radius:4px}
     .cert-head{font-size:22pt;font-weight:900;letter-spacing:3px;color:#111;margin:8px 0}
     .cert-sub{font-size:10pt;color:#444;font-style:italic}
     .cert-name{font-size:20pt;font-weight:bold;color:#111;border-bottom:2px solid #111;display:inline-block;padding:0 20px 4px;margin:12px 0}
     .cert-seal{display:inline-block;width:52px;height:52px;border-radius:50%;border:2px dashed #111;background:none;color:#111;line-height:48px;font-weight:bold;font-size:8pt;margin-top:14px}
     .cert-sigs{display:flex;justify-content:space-around;margin-top:24px;font-size:8.5pt;color:#111}`,
    `<div class="cert-wrap">
       <div style="font-size:12pt;font-weight:800;letter-spacing:2px;color:#111;">{{company}}</div>
       <div class="cert-head">CERTIFICATE OF RECOGNITION</div>
       <div class="cert-sub">This certificate is proudly conferred upon</div>
       <div class="cert-name">{{customerName}}</div>
       <div style="max-width:600px;margin:0 auto 12px;font-size:9pt;line-height:1.5;color:#111;">
         in honor of outstanding completion of the program deliverables recorded under reference <b>{{invoiceNo}}</b> on <b>{{invoiceDate}}</b>.
       </div>
       <table class="items" style="max-width:650px;margin:10px auto;">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
       <div class="cert-sigs">
         <div style="border-top:1px solid #111;width:160px;padding-top:4px;"><b>Authorized Dean / Officer</b></div>
         <div><span class="cert-seal">SEAL</span><div style="font-size:7pt;color:#555;margin-top:2px;">Doc: {{invoiceNo}}</div></div>
         <div style="border-top:1px solid #111;width:160px;padding-top:4px;"><b>Academic Registrar</b></div>
       </div>
     </div>`,
    'A4', 'Landscape'),

  // 14. Monthly Employee Salary Pay Slip
  make('fmt-payslip', 'Monthly Salary Pay Slip', 'Detailed monochrome payroll slip with employee info, earnings breakdown, and clear net salary box.',
    `.slip-head{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
     .slip-head h1{font-size:15pt;margin:0;color:#111}
     .slip-badge{background:none;color:#111;border:1px solid #111;padding:3px 8px;border-radius:3px;font-weight:bold;font-size:8.5pt}
     .slip-emp{background:none;border:1px solid #111;border-radius:4px;padding:8px 12px;margin-bottom:12px;display:flex;justify-content:space-between;font-size:8.5pt}
     table.items th{background:none;border-bottom:2px solid #111;color:#111}
     .slip-net{background:none;border:2px solid #111;border-radius:4px;padding:8px 12px;margin-top:12px;display:flex;justify-content:space-between;align-items:center}
     .slip-net b{color:#111;font-size:13pt}`,
    `<div class="slip-head">
       <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
       <div class="right"><span class="slip-badge">SALARY PAYSLIP</span><div>Ref: <b>{{invoiceNo}}</b> &bull; Date: {{invoiceDate}}</div></div>
     </div>
     <div class="slip-emp">
       <div><div class="muted">Employee Name</div><b>{{customerName}}</b><div>{{customerAddress}}</div></div>
       <div><div class="muted">Pay Period</div><b>{{invoiceDate}}</b></div>
       <div><div class="muted">Tax / UAN Ref</div>${SECURE}</div>
     </div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="slip-net">
       <div><div style="font-size:7.5pt;text-transform:uppercase;color:#111;font-weight:bold;">Net Salary Disbursed</div><div>Direct transfer to employee bank account</div></div>
       <b>{{total}}</b>
     </div>
     <div class="foot">Computer-generated payslip. No physical signature required.</div>`),

  // 15. Hotel & Resort Guest Folio
  make('fmt-hotel', 'Hotel & Resort Guest Folio', 'Monochrome guest checkout folio itemizing night room tariffs, dining, and spa services.',
    `.hotel-head{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
     .hotel-head h1{color:#111;font-size:16pt;margin:0}
     .hotel-badge{background:none;color:#111;border:1px solid #111;font-weight:bold;font-size:8.5pt;padding:3px 8px;border-radius:3px}
     table.items th{background:none;border-bottom:2px solid #111;color:#111}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:bold}`,
    `<div class="hotel-head">
       <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
       <div class="right"><span class="hotel-badge">GUEST FOLIO / CHECKOUT</span><div>Folio: <b>{{invoiceNo}}</b> &bull; {{invoiceDate}}</div></div>
     </div>
     <div class="billto"><div class="muted">Guest Name & Details</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">Thank you for staying with us! We hope to welcome you back soon.</div>`),

  // 16. HRA House Rent Receipt
  make('fmt-rent', 'HRA House Rent Receipt', 'Official Sec 10(13A) residential rent receipt with landlord PAN and neutral revenue stamp box.',
    `.rent-wrap{border:2px solid #111;border-radius:4px;padding:16px 20px}
     .rent-head{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
     .rent-title{font-size:14pt;font-weight:800;color:#111}
     .rent-stamp{width:80px;height:80px;border:1.5px dashed #111;border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:6.5pt;color:#111;background:none;text-align:center}
     table.items th{background:none;border-bottom:2px solid #111;color:#111}`,
    `<div class="rent-wrap">
       <div class="rent-head">
         <div class="rent-title">RENT RECEIPT (UNDER SEC 10(13A) IT ACT)</div>
         <div style="font-size:8.5pt;font-weight:bold;">Receipt: <b>{{invoiceNo}}</b></div>
       </div>
       <div style="font-size:10pt;line-height:1.7;margin-bottom:14px;color:#111;">
         Received with thanks from <b>{{customerName}}</b> resident of <b>{{customerAddress}}</b> the sum detailed below for the period ending <b>{{invoiceDate}}</b> from Landlord <b>{{company}}</b> ({{companyAddress}}).
       </div>
       ${SECURE}
       <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
       ${TOTALS}
       <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;">
         <div class="rent-stamp"><span>&#x25A6;</span><b>REVENUE STAMP</b><span>Sign across</span></div>
         ${INVOICE_CHART_INLINE}
         <div style="text-align:right;font-size:8.5pt;">
           <b>{{company}}</b><br>
           <span class="muted">(Landlord / Property Owner Signature)</span>
         </div>
       </div>
     </div>`),

  // 17. Restaurant Dine-In Guest Check
  make('fmt-restaurant', 'Restaurant Dine-In Guest Check', 'Compact dining check slip in crisp black & white with table, food items, and service charge.',
    `.rest-box{max-width:440px;margin:0 auto;border:1px solid #111;border-radius:4px;padding:14px}
     .rest-head{text-align:center;border-bottom:2px dashed #111;padding-bottom:8px;margin-bottom:10px}
     .rest-head h1{font-size:15pt;color:#111;margin:0}
     table.items th{border-bottom:1px solid #111;background:none;font-size:8pt;color:#111}
     table.items td{border-bottom:1px dashed #ccc;font-size:8.5pt}
     .rest-box table.totals{width:100%}`,
    `<div class="rest-box">
       <div class="rest-head">
         <h1>{{company}}</h1>
         <div class="muted">{{companyAddress}}</div>
         <div style="font-weight:bold;margin-top:3px;font-size:8pt;color:#111;">DINE-IN GUEST CHECK &bull; Table &amp; Steward Service</div>
       </div>
       <div style="display:flex;justify-content:space-between;font-size:8pt;margin-bottom:8px;">
         <div>Guest: <b>{{customerName}}</b></div>
         <div>Check: <b>#{{invoiceNo}}</b></div>
         <div>{{invoiceDate}}</div>
       </div>
       ${SECURE}
       <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
       ${TOTALS}
       <div class="foot" style="text-align:center;margin-top:12px;">Thank you for dining with us! Visit again.</div>
     </div>`),

  // 18. Official Corporate Purchase Order
  make('fmt-po', 'Official Corporate Purchase Order', 'Formal procurement PO in clean black-and-white lines with warehouse receiving terms.',
    `.po-head{border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
     .po-head h1{color:#111;font-size:16pt;margin:0}
     .po-badge{background:none;color:#111;border:1.5px solid #111;font-weight:bold;font-size:9pt;padding:3px 8px;border-radius:3px;letter-spacing:1px}
     .po-parties{display:flex;gap:12px;margin-bottom:12px;font-size:8.5pt}
     .po-parties>div{flex:1;border:1px solid #111;border-radius:4px;padding:8px}
     table.items th{background:none;color:#111;border-bottom:2px solid #111}
     table.items td{border-bottom:1px solid #ccc}
     table.totals tr.grand td{border-top:2px solid #111;border-bottom:2px solid #111;color:#111;font-weight:bold}`,
    `<div class="po-head">
       <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
       <div class="right"><span class="po-badge">PURCHASE ORDER</span><div>PO No: <b>{{invoiceNo}}</b> &bull; Date: {{invoiceDate}}</div></div>
     </div>
     <div class="po-parties">
       <div><div class="muted">Vendor / Supplier</div><b>{{customerName}}</b><div>{{customerAddress}}</div>${SECURE}</div>
       <div><div class="muted">Ship To / Warehouse</div><b>{{company}} Receiving Warehouse</b><div>Central Gate 3 &bull; Inspection on Arrival</div></div>
     </div>
     <table class="items">${ITEMS_HEAD}<tbody>${ITEMS_ROWS}</tbody></table>
     ${TOTALS}
     <div class="foot">All items subject to receiving quality inspection. Material test certificates must accompany delivery.</div>`)
];
