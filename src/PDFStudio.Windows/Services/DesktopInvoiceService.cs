using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using PDFStudio.Application.Engines;
using PDFStudio.PdfEngine.Services;

namespace PDFStudio.Windows.Services;

public sealed record InvoiceLineItem(string Description, int Quantity, decimal Price)
{
    public decimal Total => Quantity * Price;
}

public sealed record DesktopInvoiceModel(
    string InvoiceNo,
    string InvoiceDate,
    string CustomerName,
    string CustomerAddress,
    List<InvoiceLineItem> Items);

public sealed class DesktopInvoiceService
{
    private readonly ChromiumPdfEngine _pdfEngine = new();

    public string GenerateItemBreakdownSvg(DesktopInvoiceModel inv)
    {
        var validItems = inv.Items.Where(i => !string.IsNullOrWhiteSpace(i.Description) && i.Total > 0).ToList();
        if (validItems.Count <= 1) return "";
        var total = validItems.Sum(i => i.Total);
        if (total <= 0) return "";

        var colors = new[] { "#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b" };
        const int W = 460, barH = 14;
        decimal curX = 0;
        var rects = new StringBuilder();
        var legend = new StringBuilder();

        for (int i = 0; i < validItems.Count; i++)
        {
            var item = validItems[i];
            var pct = item.Total / total;
            var segW = Math.Max(2m, Math.Round(pct * W, 1));
            var col = colors[i % colors.Length];
            rects.Append($@"<rect x=""{curX:F1}"" y=""2"" width=""{segW:F1}"" height=""{barH}"" fill=""{col}"" stroke=""#ffffff"" stroke-width=""0.5""/>");
            curX += segW;

            var desc = item.Description.Length > 16 ? item.Description.Substring(0, 14) + "…" : item.Description;
            legend.Append($@"<span style=""display:inline-flex;align-items:center;margin-right:10px;font-size:7.5pt;color:#475569;""><span style=""display:inline-block;width:7px;height:7px;border-radius:2px;background:{col};margin-right:3px;""></span>{WebUtility.HtmlEncode(desc)} ({(pct * 100):F0}%)</span>");
        }

        return $@"<div style=""margin:10px 0 6px 0; border:1px solid #cbd5e1; border-radius:4px; padding:6px 8px; background:transparent;"">
  <div style=""font-size:7.5pt; font-weight:bold; color:#1f2937; margin-bottom:3px; text-transform:uppercase; letter-spacing:0.5px;"">Line Items Stack Breakdown</div>
  <svg viewBox=""0 0 {W} 18"" width=""100%"" height=""18"" style=""display:block;border-radius:2px;overflow:hidden;background:transparent;border:1px solid #cbd5e1;"">{rects}</svg>
  <div style=""margin-top:3px;display:flex;flex-wrap:wrap;"">{legend}</div>
</div>";
    }

    public (string Svg, string Legend) GenerateStackedChart(List<DesktopInvoiceModel> invoices, string grouping = "Customer", string chartStyle = "stacked-bar")
    {
        var rawDates = invoices
            .Select(i => i.InvoiceDate)
            .Where(d => !string.IsNullOrWhiteSpace(d))
            .Distinct()
            .OrderBy(d => d)
            .ToList();

        if (rawDates.Count == 0)
        {
            rawDates.Add(DateTime.Now.ToString("yyyy-MM-dd"));
        }

        var displayDates = rawDates.Count > 10 ? rawDates.TakeLast(10).ToList() : rawDates;
        var colors = new[] { "#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b" };

        var catTotals = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);

        if (grouping.Equals("Product", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var inv in invoices)
            {
                foreach (var item in inv.Items)
                {
                    var desc = string.IsNullOrWhiteSpace(item.Description) ? "Item" : item.Description.Trim();
                    catTotals[desc] = catTotals.GetValueOrDefault(desc, 0) + item.Total;
                }
            }
        }
        else
        {
            foreach (var inv in invoices)
            {
                var cust = string.IsNullOrWhiteSpace(inv.CustomerName) ? "Customer" : inv.CustomerName.Trim();
                catTotals[cust] = catTotals.GetValueOrDefault(cust, 0) + inv.Items.Sum(x => x.Total);
            }
        }

        var sortedCats = catTotals.OrderByDescending(kv => kv.Value).ToList();
        var topCount = Math.Min(4, sortedCats.Count);
        var categories = sortedCats.Take(topCount).Select(c => c.Key).ToList();
        var hasOthers = sortedCats.Count > topCount;
        if (hasOthers) categories.Add("Others");

        var series = new decimal[categories.Count, displayDates.Count];
        var dailyTotals = new decimal[displayDates.Count];

        foreach (var inv in invoices)
        {
            var dIdx = displayDates.IndexOf(inv.InvoiceDate);
            if (dIdx < 0) continue;

            if (grouping.Equals("Product", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var item in inv.Items)
                {
                    var desc = string.IsNullOrWhiteSpace(item.Description) ? "Item" : item.Description.Trim();
                    var cIdx = categories.IndexOf(desc);
                    if (cIdx < 0 && hasOthers) cIdx = categories.IndexOf("Others");
                    if (cIdx >= 0)
                    {
                        series[cIdx, dIdx] += item.Total;
                        dailyTotals[dIdx] += item.Total;
                    }
                }
            }
            else
            {
                var cust = string.IsNullOrWhiteSpace(inv.CustomerName) ? "Customer" : inv.CustomerName.Trim();
                var cIdx = categories.IndexOf(cust);
                if (cIdx < 0 && hasOthers) cIdx = categories.IndexOf("Others");
                if (cIdx >= 0)
                {
                    var tot = inv.Items.Sum(x => x.Total);
                    series[cIdx, dIdx] += tot;
                    dailyTotals[dIdx] += tot;
                }
            }
        }

        const int W = 750, H = 160;
        const int padL = 50, padR = 15, padT = 18, padB = 28;
        const int plotW = W - padL - padR, plotH = H - padT - padB;
        var maxVal = dailyTotals.Length > 0 ? dailyTotals.Max() : 100m;
        if (maxVal <= 0) maxVal = 100m;
        var maxY = Math.Ceiling(maxVal * 1.15m / 1000m) * 1000m;
        if (maxY <= 0) maxY = 1000m;

        var sb = new StringBuilder();

        // Y Gridlines
        const int ySteps = 3;
        for (int i = 0; i <= ySteps; i++)
        {
            var v = (maxY / ySteps) * i;
            var y = padT + plotH - (double)(i / (double)ySteps) * plotH;
            sb.Append($@"<line x1=""{padL}"" y1=""{y:F1}"" x2=""{W - padR}"" y2=""{y:F1}"" stroke=""#e2e8f0"" stroke-width=""1"" stroke-dasharray=""{(i == 0 ? "none" : "3,3")}""/>");
            var label = v >= 1000 ? $"{(v / 1000m):F0}k" : $"{v:F0}";
            sb.Append($@"<text x=""{padL - 6}"" y=""{y + 3:F1}"" font-family=""Segoe UI,Arial,sans-serif"" font-size=""8"" fill=""#64748b"" text-anchor=""end"">₹{label}</text>");
        }

        var colW = (double)plotW / displayDates.Count;

        // X Labels
        for (int d = 0; d < displayDates.Count; d++)
        {
            var x = padL + d * colW + colW / 2;
            var dt = displayDates[d];
            var dateStr = dt.Length > 5 ? dt.Substring(5) : dt;
            sb.Append($@"<text x=""{x:F1}"" y=""{H - 10}"" font-family=""Segoe UI,Arial,sans-serif"" font-size=""8"" fill=""#64748b"" text-anchor=""middle"">{dateStr}</text>");
        }

        if (chartStyle.Equals("stacked-area", StringComparison.OrdinalIgnoreCase))
        {
            var baseline = new decimal[displayDates.Count];
            for (int s = 0; s < categories.Count; s++)
            {
                var topPts = new List<string>();
                var botPts = new List<string>();
                for (int d = 0; d < displayDates.Count; d++)
                {
                    var x = padL + d * colW + colW / 2;
                    var bVal = baseline[d];
                    var tVal = bVal + series[s, d];
                    var yBot = padT + plotH - (double)(bVal / maxY) * plotH;
                    var yTop = padT + plotH - (double)(tVal / maxY) * plotH;
                    topPts.Add($"{x:F1},{yTop:F1}");
                    botPts.Insert(0, $"{x:F1},{yBot:F1}");
                    baseline[d] = tVal;
                }
                var dStr = $"M {string.Join(" L ", topPts)} L {string.Join(" L ", botPts)} Z";
                var col = colors[s % colors.Length];
                sb.Append($@"<path d=""{dStr}"" fill=""{col}"" fill-opacity=""0.8"" stroke=""{col}"" stroke-width=""1.2""/>");
            }
        }
        else if (chartStyle.Equals("multi-line", StringComparison.OrdinalIgnoreCase))
        {
            for (int s = 0; s < categories.Count; s++)
            {
                var pts = new List<string>();
                var circles = new StringBuilder();
                var col = colors[s % colors.Length];
                for (int d = 0; d < displayDates.Count; d++)
                {
                    var x = padL + d * colW + colW / 2;
                    var val = series[s, d];
                    var y = padT + plotH - (double)(val / maxY) * plotH;
                    pts.Add($"{x:F1},{y:F1}");
                    circles.Append($@"<circle cx=""{x:F1}"" cy=""{y:F1}"" r=""3.5"" fill=""{col}"" stroke=""#ffffff"" stroke-width=""1.5""/>");
                }
                sb.Append($@"<polyline points=""{string.Join(" ", pts)}"" fill=""none"" stroke=""{col}"" stroke-width=""2.5"" stroke-linecap=""round"" stroke-linejoin=""round""/>");
                sb.Append(circles);
            }
        }
        else if (chartStyle.Equals("cumulative", StringComparison.OrdinalIgnoreCase))
        {
            decimal runTot = 0;
            var cumVals = new decimal[displayDates.Count];
            for (int d = 0; d < displayDates.Count; d++)
            {
                runTot += dailyTotals[d];
                cumVals[d] = runTot;
            }
            var maxCum = Math.Max(cumVals.Length > 0 ? cumVals.Max() : 100m, 100m);
            var cumMaxY = Math.Ceiling(maxCum * 1.15m / 1000m) * 1000m;
            if (cumMaxY <= 0) cumMaxY = 1000m;

            var pts = new List<string>();
            var areaPts = new List<string> { $"{padL},{padT + plotH}" };
            for (int d = 0; d < displayDates.Count; d++)
            {
                var x = padL + d * colW + colW / 2;
                var y = padT + plotH - (double)(cumVals[d] / cumMaxY) * plotH;
                pts.Add($"{x:F1},{y:F1}");
                areaPts.Add($"{x:F1},{y:F1}");
            }
            var lastX = padL + (displayDates.Count - 1) * colW + colW / 2;
            areaPts.Add($"{lastX:F1},{padT + plotH}");

            sb.Append($@"<polygon points=""{string.Join(" ", areaPts)}"" fill=""#2563eb"" fill-opacity=""0.18""/>");
            sb.Append($@"<polyline points=""{string.Join(" ", pts)}"" fill=""none"" stroke=""#2563eb"" stroke-width=""3"" stroke-linecap=""round""/>");

            for (int d = 0; d < displayDates.Count; d++)
            {
                var x = padL + d * colW + colW / 2;
                var y = padT + plotH - (double)(cumVals[d] / cumMaxY) * plotH;
                sb.Append($@"<circle cx=""{x:F1}"" cy=""{y:F1}"" r=""4"" fill=""#2563eb"" stroke=""#ffffff"" stroke-width=""2""/>");
                var cTot = cumVals[d];
                var lbl = cTot >= 1000 ? $"{(cTot / 1000m):F1}k" : $"{cTot:F0}";
                sb.Append($@"<text x=""{x:F1}"" y=""{y - 7:F1}"" font-family=""Segoe UI,Arial,sans-serif"" font-size=""7.5"" font-weight=""bold"" fill=""#1e293b"" text-anchor=""middle"">₹{lbl}</text>");
            }
        }
        else
        {
            // Default: stacked-bar
            var barW = Math.Min(32, Math.Max(10, colW * 0.6));
            for (int d = 0; d < displayDates.Count; d++)
            {
                var x = padL + d * colW + (colW - barW) / 2;
                var currentY = (double)(padT + plotH);

                for (int s = 0; s < categories.Count; s++)
                {
                    var val = series[s, d];
                    if (val <= 0) continue;
                    var segH = (double)(val / maxY) * plotH;
                    currentY -= segH;
                    var col = colors[s % colors.Length];
                    sb.Append($@"<rect x=""{x:F1}"" y=""{currentY:F1}"" width=""{barW:F1}"" height=""{segH:F1}"" fill=""{col}"" rx=""1""/>");
                }

                if (dailyTotals[d] > 0)
                {
                    var tot = dailyTotals[d];
                    var totTxt = tot >= 1000 ? $"{(tot / 1000m):F1}k" : $"{tot:F0}";
                    sb.Append($@"<text x=""{x + barW / 2:F1}"" y=""{currentY - 3:F1}"" font-family=""Segoe UI,Arial,sans-serif"" font-size=""7"" font-weight=""bold"" fill=""#334155"" text-anchor=""middle"">₹{totTxt}</text>");
                }
            }
        }

        var svg = $@"<svg viewBox=""0 0 {W} {H}"" width=""100%"" height=""{H}"" preserveAspectRatio=""xMidYMid meet"" style=""display:block"">{sb}</svg>";

        var legend = chartStyle.Equals("cumulative", StringComparison.OrdinalIgnoreCase)
            ? @"<span style=""display:inline-flex; align-items:center; margin-right:10px; font-size:7.5pt; color:#334155;""><span style=""display:inline-block; width:8px; height:8px; border-radius:2px; background:#2563eb; margin-right:4px;""></span>Cumulative Total Volume</span>"
            : string.Join("", categories.Select((cat, idx) =>
                $@"<span style=""display:inline-flex; align-items:center; margin-right:10px; font-size:7.5pt; color:#334155;""><span style=""display:inline-block; width:8px; height:8px; border-radius:2px; background:{colors[idx % colors.Length]}; margin-right:4px;""></span>{WebUtility.HtmlEncode(cat)}</span>"
            ));

        return (svg, legend);
    }

    public string BuildInvoiceHtml(
        string company,
        string companyAddress,
        string currency,
        DesktopInvoiceModel inv,
        bool enableWatermark,
        string watermarkText,
        int watermarkOpacity,
        bool enableChart)
    {
        var subtotal = inv.Items.Sum(x => x.Total);
        var tax = Math.Round(subtotal * 0.18m, 2);
        var total = subtotal + tax;

        var itemChartBlock = enableChart ? GenerateItemBreakdownSvg(inv) : "";

        var watermarkHtml = "";
        if (enableWatermark)
        {
            var text = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(watermarkText) ? company : watermarkText);
            var op = Math.Max(0.02, Math.Min(0.35, watermarkOpacity / 100.0));
            watermarkHtml = $@"
<style>
  .pdf-watermark-container {{
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 99999; display: flex; align-items: center; justify-content: center;
  }}
  .pdf-watermark-inner {{
    transform: rotate(-30deg); opacity: {op:F2}; text-align: center; user-select: none;
    font-family: Arial, sans-serif; font-size: 38pt; font-weight: 800; letter-spacing: 3px;
    text-transform: uppercase; color: #111827;
  }}
</style>
<div class=""pdf-watermark-container"">
  <div class=""pdf-watermark-inner"">{text}</div>
</div>";
        }

        var sbRows = new StringBuilder();
        int sno = 1;
        foreach (var item in inv.Items)
        {
            sbRows.Append($@"<tr>
  <td style=""width:36px; text-align:center;"">{sno++}</td>
  <td>{WebUtility.HtmlEncode(item.Description)}</td>
  <td style=""text-align:right;"">{item.Quantity}</td>
  <td style=""text-align:right;"">{currency} {item.Price:N2}</td>
  <td style=""text-align:right;"">{currency} {item.Total:N2}</td>
</tr>");
        }

        return $@"<!DOCTYPE html>
<html>
<head>
<meta charset=""utf-8"">
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: Segoe UI, Arial, sans-serif; font-size: 11pt; color: #1f2937; margin: 0; padding: 20px; }}
  .invoice {{ border: 1px solid #111; padding: 16px; border-radius: 6px; }}
  .head {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f2937; padding-bottom: 10px; margin-bottom: 14px; }}
  .head h1 {{ font-size: 20pt; margin: 0 0 3px 0; color: #0f172a; }}
  .muted {{ color: #6b7280; font-size: 9.5pt; }}
  .right {{ text-align: right; }}
  .title {{ font-size: 18pt; font-weight: bold; letter-spacing: 2px; color: #111827; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
  th {{ background: transparent; text-align: left; padding: 6px 8px; border-bottom: 2px solid #1f2937; font-size: 10pt; }}
  td {{ padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }}
  .totals-wrap {{ display: flex; justify-content: flex-end; align-items: flex-end; margin-top: 14px; }}
  table.totals {{ width: 45%; margin-left: auto; }}
  table.totals td {{ border-bottom: none; padding: 3px 8px; }}
  table.totals tr.grand td {{ border-top: 2px solid #1f2937; font-weight: bold; font-size: 12pt; }}
  .foot {{ margin-top: 24px; color: #6b7280; font-size: 9pt; text-align: center; }}
</style>
{watermarkHtml}
</head>
<body>
<div class=""invoice"">
  <div class=""head"">
    <div>
      <h1>{WebUtility.HtmlEncode(company)}</h1>
      <div class=""muted"">{WebUtility.HtmlEncode(companyAddress)}</div>
    </div>
    <div class=""right"">
      <div class=""title"">INVOICE</div>
      <div>No: <b>{WebUtility.HtmlEncode(inv.InvoiceNo)}</b></div>
      <div>Date: {WebUtility.HtmlEncode(inv.InvoiceDate)}</div>
    </div>
  </div>

  <div style=""margin-bottom: 14px;"">
    <div class=""muted"">Billed to:</div>
    <b>{WebUtility.HtmlEncode(inv.CustomerName)}</b>
    <div>{WebUtility.HtmlEncode(inv.CustomerAddress)}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style=""width:36px; text-align:center;"">#</th>
        <th>Description</th>
        <th style=""text-align:right;"">Qty</th>
        <th style=""text-align:right;"">Price</th>
        <th style=""text-align:right;"">Amount</th>
      </tr>
    </thead>
    <tbody>
      {sbRows}
    </tbody>
  </table>

  {itemChartBlock}

  <div class=""totals-wrap"">
    <table class=""totals"">
      <tr><td>Subtotal</td><td style=""text-align:right;"">{currency} {subtotal:N2}</td></tr>
      <tr><td>GST (18%)</td><td style=""text-align:right;"">{currency} {tax:N2}</td></tr>
      <tr class=""grand""><td>Total</td><td style=""text-align:right;"">{currency} {total:N2}</td></tr>
    </table>
  </div>

  <div class=""foot"">Thank you for your business &bull; Computer Generated Invoice</div>
</div>
</body>
</html>";
    }

    public string BuildConsolidatedReportHtml(
        string company,
        string companyAddress,
        string currency,
        List<DesktopInvoiceModel> invoices,
        bool enableWatermark,
        string watermarkText,
        int watermarkOpacity,
        bool enableChart,
        string chartGrouping,
        string chartType = "stacked-bar")
    {
        var grandSubtotal = invoices.Sum(i => i.Items.Sum(x => x.Total));
        var grandTax = Math.Round(grandSubtotal * 0.18m, 2);
        var grandTotal = grandSubtotal + grandTax;
        var avgOrder = invoices.Count > 0 ? grandTotal / invoices.Count : 0m;

        var byCust = invoices.GroupBy(i => i.CustomerName).OrderByDescending(g => g.Sum(x => x.Items.Sum(it => it.Total))).FirstOrDefault();
        var topCustName = byCust?.Key ?? "—";
        var topCustTotal = byCust?.Sum(x => x.Items.Sum(it => it.Total)) ?? 0m;
        var topShare = grandSubtotal > 0 ? $"{(topCustTotal / grandSubtotal * 100):F1}%" : "0%";

        var byDate = invoices.GroupBy(i => i.InvoiceDate).OrderByDescending(g => g.Sum(x => x.Items.Sum(it => it.Total))).FirstOrDefault();
        var peakDate = byDate?.Key ?? "—";
        var peakDateTotal = byDate?.Sum(x => x.Items.Sum(it => it.Total)) ?? 0m;

        var (chartSvg, chartLegend) = enableChart ? GenerateStackedChart(invoices, chartGrouping, chartType) : ("", "");

        var watermarkHtml = "";
        if (enableWatermark)
        {
            var text = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(watermarkText) ? company : watermarkText);
            var op = Math.Max(0.02, Math.Min(0.35, watermarkOpacity / 100.0));
            watermarkHtml = $@"
<style>
  .pdf-watermark-container {{
    position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 99999; display: flex; align-items: center; justify-content: center;
  }}
  .pdf-watermark-inner {{
    transform: rotate(-30deg); opacity: {op:F2}; text-align: center; user-select: none;
    font-family: Arial, sans-serif; font-size: 42pt; font-weight: 800; letter-spacing: 3px;
    text-transform: uppercase; color: #111827;
  }}
</style>
<div class=""pdf-watermark-container"">
  <div class=""pdf-watermark-inner"">{text}</div>
</div>";
        }

        var sbRows = new StringBuilder();
        foreach (var inv in invoices)
        {
            var tot = inv.Items.Sum(x => x.Total) * 1.18m;
            sbRows.Append($@"<tr>
  <td>{WebUtility.HtmlEncode(inv.InvoiceNo)}</td>
  <td>{WebUtility.HtmlEncode(inv.CustomerName)}</td>
  <td>{WebUtility.HtmlEncode(inv.InvoiceDate)}</td>
  <td style=""text-align:right;"">{inv.Items.Count}</td>
  <td style=""text-align:right;"">{currency} {tot:N2}</td>
</tr>");
        }

        var chartBlock = enableChart ? $@"
<div style=""border: 1px solid #cbd5e1; border-radius: 4px; background: transparent; padding: 12px; margin-bottom: 16px;"">
  <div style=""display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;"">
    <div>
      <div style=""font-size:9.5pt; font-weight:bold; color:#1e293b;"">Day-to-Day Billing Breakdown (by {WebUtility.HtmlEncode(chartGrouping)})</div>
      <div style=""font-size:7.5pt; color:#64748b;"">Daily sales volume stacked across billing cycle</div>
    </div>
    <div style=""display:flex; gap:8px; font-size:7.5pt; color:#334155; flex-wrap:wrap;"">
      {chartLegend}
    </div>
  </div>
  {chartSvg}
</div>" : "";

        return $@"<!DOCTYPE html>
<html>
<head>
<meta charset=""utf-8"">
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: Segoe UI, Arial, sans-serif; font-size: 10pt; color: #1f2937; margin: 0; padding: 24px; }}
  .head {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f2937; padding-bottom: 10px; margin-bottom: 14px; }}
  .head h1 {{ font-size: 20pt; margin: 0 0 3px 0; color: #0f172a; }}
  .muted {{ color: #6b7280; font-size: 9pt; }}
  .right {{ text-align: right; }}
  .title {{ font-size: 16pt; font-weight: bold; letter-spacing: 2px; color: #111827; }}
  
  .kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0 16px 0; }}
  .kpi-card {{ background: transparent; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 10px; }}
  .kpi-label {{ font-size: 7.5pt; font-weight: 600; text-transform: uppercase; color: #4b5563; }}
  .kpi-val {{ font-size: 12pt; font-weight: bold; color: #111827; margin-top: 2px; }}
  .kpi-sub {{ font-size: 7pt; color: #4b5563; margin-top: 2px; }}

  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; }}
  th {{ background: transparent; text-align: left; padding: 6px 8px; border-bottom: 2px solid #1f2937; font-size: 9pt; }}
  td {{ padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }}
  .totals {{ width: 45%; margin-left: auto; margin-top: 14px; }}
  .totals td {{ border-bottom: none; padding: 3px 8px; }}
  .totals tr.grand td {{ border-top: 2px solid #1f2937; font-weight: bold; font-size: 11pt; }}
</style>
{watermarkHtml}
</head>
<body>
  <div class=""head"">
    <div>
      <h1>{WebUtility.HtmlEncode(company)}</h1>
      <div class=""muted"">{WebUtility.HtmlEncode(companyAddress)}</div>
    </div>
    <div class=""right"">
      <div class=""title"">CONSOLIDATED INVOICE</div>
      <div>Date: {DateTime.Now:yyyy-MM-dd}</div>
      <div>Invoices: <b>{invoices.Count}</b></div>
    </div>
  </div>

  <div class=""kpi-grid"">
    <div class=""kpi-card"">
      <div class=""kpi-label"">Total Revenue</div>
      <div class=""kpi-val"">{currency} {grandTotal:N2}</div>
      <div class=""kpi-sub"">{invoices.Count} total invoice(s)</div>
    </div>
    <div class=""kpi-card"">
      <div class=""kpi-label"">Average Order Value</div>
      <div class=""kpi-val"">{currency} {avgOrder:N2}</div>
      <div class=""kpi-sub"">Across all orders</div>
    </div>
    <div class=""kpi-card"">
      <div class=""kpi-label"">Top Account</div>
      <div class=""kpi-val"">{WebUtility.HtmlEncode(topCustName)}</div>
      <div class=""kpi-sub"">{currency} {topCustTotal:N2} ({topShare})</div>
    </div>
    <div class=""kpi-card"">
      <div class=""kpi-label"">Peak Billing Date</div>
      <div class=""kpi-val"">{WebUtility.HtmlEncode(peakDate)}</div>
      <div class=""kpi-sub"">{currency} {peakDateTotal:N2} billed</div>
    </div>
  </div>

  {chartBlock}

  <h3 style=""font-size:11pt; margin:16px 0 6px 0;"">All Invoices</h3>
  <table>
    <thead>
      <tr>
        <th>Invoice No</th>
        <th>Customer</th>
        <th>Date</th>
        <th style=""text-align:right;"">Items</th>
        <th style=""text-align:right;"">Total</th>
      </tr>
    </thead>
    <tbody>
      {sbRows}
    </tbody>
  </table>

  <table class=""totals"">
    <tr><td>Subtotal</td><td style=""text-align:right;"">{currency} {grandSubtotal:N2}</td></tr>
    <tr><td>Tax (18%)</td><td style=""text-align:right;"">{currency} {grandTax:N2}</td></tr>
    <tr class=""grand""><td>Grand Total</td><td style=""text-align:right;"">{currency} {grandTotal:N2}</td></tr>
  </table>
</body>
</html>";
    }

    public async Task<string> GeneratePdfFileAsync(string html, string fileNamePrefix)
    {
        var bytes = await _pdfEngine.GenerateAsync(new PdfGenerationRequest(
            HtmlContent: html,
            Settings: new PageSettings(Size: "A4", Orientation: "Portrait", PrintBackground: true, MarginTopMm: 0, MarginBottomMm: 0, MarginLeftMm: 0, MarginRightMm: 0)));

        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "PDFStudio_Generated");
        Directory.CreateDirectory(dir);
        var filePath = Path.Combine(dir, $"{fileNamePrefix}_{DateTime.Now:yyyyMMdd_HHmmss}.pdf");
        await File.WriteAllBytesAsync(filePath, bytes);

        return filePath;
    }

    public void OpenPdf(string filePath)
    {
        if (File.Exists(filePath))
        {
            Process.Start(new ProcessStartInfo(filePath) { UseShellExecute = true });
        }
    }
}

