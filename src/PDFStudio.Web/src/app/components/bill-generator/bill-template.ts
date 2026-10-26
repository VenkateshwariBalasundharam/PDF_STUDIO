// Mustache template used by the Bill Generator. It is sent as raw HTML + data to /pdf/render,
// so no database template is needed. Money values are pre-formatted strings (Mustache cannot calculate).
export const BILL_TEMPLATE = `
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #1f2937; }
  .sheet + .sheet, .consolidated { break-before: page; page-break-before: always; }
  .invoice { break-inside: avoid; page-break-inside: avoid; border-bottom: 1px dashed #9ca3af; margin-bottom: 14px; padding-bottom: 12px; }
  /* An invoice with more rows than fit on a page: let the rows flow onto the next page(s). */
  .invoice.long { break-inside: auto; page-break-inside: auto; min-height: 0 !important; }
  .invoice.long table.totals, .invoice.long .foot { break-inside: avoid; page-break-inside: avoid; }
  .sheet.long-sheet { break-before: page; page-break-before: always; }
  .sheet.long-sheet + .sheet { break-before: page; page-break-before: always; }
  .compact { font-size: 9pt; }
  .compact .head { padding-bottom: 6px; margin-bottom: 8px; }
  .compact .head h1 { font-size: 14pt; }
  .compact .title { font-size: 12pt; margin-bottom: 2px; }
  .compact .billto { margin-bottom: 8px; }
  .compact th, .compact td { padding: 3px 6px; }
  .compact .foot { margin-top: 8px; }
  .compact h1, .compact table { margin-top: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f2937; padding-bottom: 10px; margin-bottom: 14px; }
  .head h1 { font-size: 20pt; margin: 0 0 3px 0; }
  .muted { color: #6b7280; font-size: 9.5pt; }
  .right { text-align: right; }
  .title { font-size: 18pt; font-weight: bold; letter-spacing: 2px; margin-bottom: 4px; }
  .billto { margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px 0; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { background: transparent; text-align: left; padding: 6px 8px; border-bottom: 2px solid #1f2937; font-size: 10pt; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  .r { text-align: right; } .n { width: 36px; }
  table.totals { width: 45%; margin-left: auto; }
  table.totals td { border-bottom: none; padding: 3px 8px; }
  table.totals tr.grand td { border-top: 2px solid #1f2937; font-weight: bold; font-size: 12pt; }
  .invoice-chart-box { margin: 8px 0 10px 0; border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 8px; background: transparent; }
  .invoice-chart-title { font-size: 7.5pt; font-weight: bold; color: #1f2937; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0 14px 0; }
  .kpi-card { background: transparent; border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 10px; }
  .kpi-label { font-size: 7.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #4b5563; margin-bottom: 2px; }
  .kpi-val { font-size: 12pt; font-weight: bold; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kpi-sub { font-size: 7pt; color: #4b5563; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .summary-chart-card { border: 1px solid #d1d5db; border-radius: 4px; background: transparent; padding: 10px 12px; margin-bottom: 14px; }
  .summary-chart-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px; }
  .summary-chart-title { font-size: 9pt; font-weight: bold; color: #1e293b; }
  .summary-chart-sub { font-size: 7.5pt; color: #64748b; }
  .summary-chart-legend { display: flex; gap: 8px; font-size: 7.5pt; color: #334155; flex-wrap: wrap; }
  .summary-chart-legend-item { display: flex; align-items: center; gap: 4px; }
  .summary-chart-legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .summary-chart-svg-wrap { width: 100%; overflow: hidden; }
  h2 { font-size: 16pt; margin: 0 0 4px 0; }
  h3 { font-size: 12pt; margin: 16px 0 4px 0; }
  .foot { margin-top: 24px; color: #6b7280; font-size: 9pt; }
</style>
<div class="{{layoutClass}}">
{{#sheets}}
<div class="sheet {{sheetClass}}">
{{#invoices}}
<section class="invoice {{invoiceClass}}" style="min-height: {{slot}}">
  <div class="head">
    <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
    <div class="right">
      <div class="title">INVOICE</div>
      <div>No: <b>{{invoiceNo}}</b></div>
      <div>Date: {{invoiceDate}}</div>
    </div>
  </div>
  <div class="billto"><div class="muted">Bill to</div><b>{{customerName}}</b><div>{{customerAddress}}</div>{{#hasSecure}}<div>{{secureLabel}}: <b>{{secureValue}}</b></div>{{/hasSecure}}</div>
  <table>
    <thead><tr><th class="n">#</th><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
    <tbody>
      {{#items}}<tr><td class="n">{{sno}}</td><td>{{description}}</td><td class="r">{{quantity}}</td><td class="r">{{price}}</td><td class="r">{{lineTotal}}</td></tr>{{/items}}
    </tbody>
  </table>
  {{#hasInvoiceChart}}
  <div class="invoice-chart-box" style="{{invoiceChartBoxStyle}}">
    <div class="invoice-chart-title">{{invoiceChartTitle}}</div>
    {{{invoiceChartSvg}}}
  </div>
  {{/hasInvoiceChart}}
  <table class="totals">
    <tr><td>Subtotal</td><td class="r">{{subtotal}}</td></tr>
    <tr><td>{{taxLabel}}</td><td class="r">{{tax}}</td></tr>
    <tr class="grand"><td>Total</td><td class="r">{{total}}</td></tr>
  </table>
  <div class="foot">Thank you for your business.</div>
</section>
{{/invoices}}
</div>
{{/sheets}}
</div>
{{#showSummary}}
<section class="consolidated">
  <div class="head">
    <div><h1>{{company}}</h1><div class="muted">{{companyAddress}}</div></div>
    <div class="right"><div class="title">CONSOLIDATED INVOICE</div><div>Date: {{generatedOn}}</div><div>Invoices: <b>{{invoiceCount}}</b></div></div>
  </div>

  {{#hasSummaryKpis}}
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Total Revenue</div>
      <div class="kpi-val">{{grandTotal}}</div>
      <div class="kpi-sub">{{invoiceCount}} total invoice(s)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Average Order Value</div>
      <div class="kpi-val">{{avgOrderValue}}</div>
      <div class="kpi-sub">Across all orders</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Top Account</div>
      <div class="kpi-val">{{topCustomerName}}</div>
      <div class="kpi-sub">{{topCustomerTotal}} ({{topCustomerShare}})</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Peak Billing Date</div>
      <div class="kpi-val">{{peakDate}}</div>
      <div class="kpi-sub">{{peakDateTotal}} billed</div>
    </div>
  </div>
  {{/hasSummaryKpis}}

  {{#hasSummaryChart}}
  <div class="summary-chart-card">
    <div class="summary-chart-head">
      <div>
        <div class="summary-chart-title">Day-to-Day Billing Breakdown ({{chartGroupingLabel}})</div>
        <div class="summary-chart-sub">Daily totals stacked across billing period</div>
      </div>
      <div class="summary-chart-legend">
        {{{summaryChartLegendHtml}}}
      </div>
    </div>
    <div class="summary-chart-svg-wrap">
      {{{summaryChartSvg}}}
    </div>
  </div>
  {{/hasSummaryChart}}

  <h3>All invoices</h3>
  <table>
    <thead><tr><th>Invoice No</th><th>Customer</th><th>Date</th><th class="r">Subtotal</th><th class="r">Tax</th><th class="r">Total</th></tr></thead>
    <tbody>
      {{#summaryRows}}<tr><td>{{invoiceNo}}</td><td>{{customerName}}</td><td>{{invoiceDate}}</td><td class="r">{{subtotal}}</td><td class="r">{{tax}}</td><td class="r">{{total}}</td></tr>{{/summaryRows}}
    </tbody>
  </table>
  <h3>Totals by customer</h3>
  <table>
    <thead><tr><th>Customer</th><th class="r">Invoices</th><th class="r">Total</th></tr></thead>
    <tbody>
      {{#customerRows}}<tr><td>{{customerName}}</td><td class="r">{{count}}</td><td class="r">{{total}}</td></tr>{{/customerRows}}
    </tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td class="r">{{grandSubtotal}}</td></tr>
    <tr><td>{{taxLabel}}</td><td class="r">{{grandTax}}</td></tr>
    <tr class="grand"><td>Grand total</td><td class="r">{{grandTotal}}</td></tr>
  </table>
</section>
{{/showSummary}}
`;

/**
 * Makes any invoice template printable. Users only have to design ONE invoice with tags such as
 * {{invoiceNo}} and {{#items}}…{{/items}}; the loops that repeat it per invoice / per page are added here.
 *  - Has both {{#sheets}} and {{#invoices}}  -> used exactly as written (advanced mode).
 *  - Has {{#invoices}} only                  -> wrapped in {{#sheets}}.
 *  - Has neither                             -> <style> blocks and a {{#showSummary}} block are kept outside,
 *                                               everything else becomes the body of one invoice.
 *  - Has {{#sheets}} only                    -> cannot be guessed, reported by billTemplateProblem().
 */
export function prepareBillHtml(html: string): string {
  const src = html ?? '';
  const hasSheets = src.includes('{{#sheets}}');
  const hasInvoices = src.includes('{{#invoices}}');
  if (hasSheets && hasInvoices) return src;
  if (hasInvoices) return `<div class="{{layoutClass}}">{{#sheets}}<div class="sheet {{sheetClass}}">${src}</div>{{/sheets}}</div>`;
  if (hasSheets) return src;

  const styles: string[] = [];
  let rest = src.replace(/<style[\s\S]*?<\/style>/gi, m => { styles.push(m); return ''; });
  const summaries: string[] = [];
  rest = rest.replace(/\{\{#showSummary\}\}[\s\S]*?\{\{\/showSummary\}\}/g, m => { summaries.push(m); return ''; });
  return styles.join('\n')
    + `<div class="{{layoutClass}}">{{#sheets}}<div class="sheet {{sheetClass}}">{{#invoices}}`
    + `<section class="invoice {{invoiceClass}}" style="min-height: {{slot}}">${rest}</section>`
    + `{{/invoices}}</div>{{/sheets}}</div>`
    + summaries.join('\n');
}

/** Returns a message when the template cannot work, otherwise ''. Missing loops are NOT a problem any more. */
export function billTemplateProblem(html: string): string {
  const src = html ?? '';
  if (!src.trim()) return 'The template is empty.';
  if (src.includes('{{#sheets}}') && !src.includes('{{#invoices}}'))
    return 'This template has {{#sheets}} but no {{#invoices}}. Remove {{#sheets}} (it is added automatically) or add {{#invoices}} inside it.';
  const count = (re: RegExp) => (src.match(re) ?? []).length;
  for (const name of ['sheets', 'invoices', 'items', 'showSummary', 'summaryRows', 'customerRows']) {
    const open = count(new RegExp('\\{\\{#' + name + '\\}\\}', 'g')), close = count(new RegExp('\\{\\{/' + name + '\\}\\}', 'g'));
    if (open !== close) return `{{#${name}}} is opened ${open} time(s) but closed ${close} time(s). Every {{#tag}} needs a matching {{/tag}}.`;
  }
  return '';
}

/** Tags a template can use. Shown on the Templates page. */
export const BILL_TAG_HELP = [
  { tag: '(no loop needed)', text: 'Design ONE invoice using the tags below. The app repeats it for every invoice and handles invoices-per-page and page breaks. Advanced: you may write your own {{#sheets}} … {{#invoices}} … {{/invoices}} … {{/sheets}} loops.' },
  { tag: '{{company}} {{companyAddress}}', text: 'Your company name and address (from the Bill Generator form).' },
  { tag: '{{invoiceNo}} {{invoiceDate}}', text: 'Inside the invoice loop.' },
  { tag: '{{customerName}} {{customerAddress}}', text: 'Inside the invoice loop.' },
  { tag: '{{#items}} {{sno}} {{description}} {{quantity}} {{price}} {{lineTotal}} {{/items}}', text: 'Line items of one invoice.' },
  { tag: '{{#hasSecure}} {{secureLabel}}: {{secureValue}} {{/hasSecure}}', text: 'Optional protected value of one invoice (for example a tax ID). It prints in full only when the PDFs are locked with a password; otherwise only the last 4 characters show.' },
  { tag: '{{subtotal}} {{tax}} {{total}} {{taxLabel}}', text: 'Totals of one invoice (already formatted with the currency).' },
  { tag: '{{slot}} {{layoutClass}} {{invoiceClass}} {{sheetClass}}', text: 'Optional. Only for hand-written loops; added automatically otherwise. invoiceClass/sheetClass are "long"/"long-sheet" for invoices with too many rows for one page, so their rows continue on the next page.' },
  { tag: '{{#showSummary}} … {{/showSummary}}', text: 'The consolidated invoice section (only printed when ticked).' },
  { tag: '{{#summaryRows}} {{#customerRows}} {{invoiceCount}} {{grandSubtotal}} {{grandTax}} {{grandTotal}} {{generatedOn}}', text: 'Data for the consolidated invoice.' }
];

/** Fake data used by the "Preview with sample data" button on the Templates page. */
export function sampleBillData(): Record<string, any> {
  const mk = (no: string, cust: string, rows: [string, number, number][]) => {
    const items = rows.map((r, i) => ({ sno: i + 1, description: r[0], quantity: String(r[1]), price: '₹ ' + r[2].toFixed(2), lineTotal: '₹ ' + (r[1] * r[2]).toFixed(2) }));
    const t = rows.reduce((s, r) => s + r[1] * r[2], 0).toFixed(2);
    return { invoiceNo: no, invoiceDate: '2026-10-01', customerName: cust, customerAddress: '12 Main Road, Salem', items, subtotal: '₹ ' + t, tax: '₹ 0.00', total: '₹ ' + t };
  };
  const inv = [
    mk('INV-001', 'Ravi Stores', [['Rice 25kg', 2, 1450], ['Oil 5L', 1, 780]]),
    mk('INV-002', 'Lakshmi Traders', [['Sugar 50kg', 1, 2100]])
  ];
  return {
    company: 'Your Company Name', companyAddress: 'Salem, Tamil Nadu', taxLabel: 'Tax',
    sheets: [{ invoices: inv }], layoutClass: '', slot: '', showSummary: true,
    generatedOn: '2026-10-14', invoiceCount: 2,
    summaryRows: inv, customerRows: [{ customerName: 'Ravi Stores', count: 1, total: '₹ 3,680.00' }, { customerName: 'Lakshmi Traders', count: 1, total: '₹ 2,100.00' }],
    grandSubtotal: '₹ 5,780.00', grandTax: '₹ 0.00', grandTotal: '₹ 5,780.00'
  };
}

/** Lets multi-line addresses keep their line breaks in the PDF (HTML would otherwise collapse them). */
export function keepAddressBreaks(html: string): string {
  return (html ?? '').replace(/\{\{\s*(customerAddress|companyAddress|billAddress|clientAddress|address)\s*\}\}/g,
    '<span style="white-space:pre-line">{{$1}}</span>');
}

