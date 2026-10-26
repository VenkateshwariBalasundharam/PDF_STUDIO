using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using PDFStudio.Application.Engines;

namespace PDFStudio.PdfEngine.Services;

public sealed class PdfSharpManipulator : IPdfManipulator
{
    public PdfSharpManipulator()
    {
        PDFStudio.PdfEngine.Fonts.DefaultFontResolver.EnsureInitialized();
    }
    public Task<byte[]> WatermarkAsync(
        byte[] document,
        WatermarkOptions options,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        using var inStream = new MemoryStream(document);
        using var pdfDocument = PdfReader.Open(inStream, PdfDocumentOpenMode.Modify);

        var font = new XFont("Helvetica", options.FontSize, XFontStyleEx.Bold);
        var color = ParseColorWithOpacity(options.ColorHex, options.Opacity);
        var brush = new XSolidBrush(color);

        foreach (var page in pdfDocument.Pages)
        {
            cancellationToken.ThrowIfCancellationRequested();

            using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
            var size = gfx.MeasureString(options.Text, font);

            // Center of page
            var cx = page.Width.Point / 2;
            var cy = page.Height.Point / 2;

            gfx.TranslateTransform(cx, cy);
            gfx.RotateTransform(options.RotationAngleDegrees);
            gfx.TranslateTransform(-cx, -cy);

            gfx.DrawString(
                options.Text,
                font,
                brush,
                new XPoint(cx - (size.Width / 2), cy + (size.Height / 4)));
        }

        using var outStream = new MemoryStream();
        pdfDocument.Save(outStream);
        return Task.FromResult(outStream.ToArray());
    }

    public Task<byte[]> StampAsync(
        byte[] document,
        StampOptions options,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        using var inStream = new MemoryStream(document);
        using var pdfDocument = PdfReader.Open(inStream, PdfDocumentOpenMode.Modify);

        var font = new XFont("Helvetica", 14, XFontStyleEx.Bold);
        var color = ParseColorWithOpacity(options.ColorHex, options.Opacity);
        var brush = new XSolidBrush(color);

        foreach (var page in pdfDocument.Pages)
        {
            cancellationToken.ThrowIfCancellationRequested();

            using var gfx = XGraphics.FromPdfPage(page, XGraphicsPdfPageOptions.Append);
            var size = gfx.MeasureString(options.Text, font);

            double x = page.Width.Point - size.Width - 30;
            double y = page.Height.Point - 30;

            if (options.Position.Equals("TopLeft", StringComparison.OrdinalIgnoreCase))
            {
                x = 30;
                y = 40;
            }
            else if (options.Position.Equals("TopRight", StringComparison.OrdinalIgnoreCase))
            {
                x = page.Width.Point - size.Width - 30;
                y = 40;
            }
            else if (options.Position.Equals("BottomLeft", StringComparison.OrdinalIgnoreCase))
            {
                x = 30;
                y = page.Height.Point - 30;
            }

            gfx.DrawString(options.Text, font, brush, new XPoint(x, y));
        }

        using var outStream = new MemoryStream();
        pdfDocument.Save(outStream);
        return Task.FromResult(outStream.ToArray());
    }

    public Task<byte[]> RotatePagesAsync(
        byte[] document,
        IReadOnlyList<int> pages,
        int rotationAngleDegrees,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        using var inStream = new MemoryStream(document);
        using var pdfDocument = PdfReader.Open(inStream, PdfDocumentOpenMode.Modify);

        var pageSet = pages.ToHashSet();

        for (int i = 0; i < pdfDocument.Pages.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var pageNum = i + 1;
            if (pageSet.Count == 0 || pageSet.Contains(pageNum))
            {
                var currentAngle = pdfDocument.Pages[i].Rotate;
                pdfDocument.Pages[i].Rotate = (currentAngle + rotationAngleDegrees) % 360;
            }
        }

        using var outStream = new MemoryStream();
        pdfDocument.Save(outStream);
        return Task.FromResult(outStream.ToArray());
    }

    public Task<byte[]> ExtractPagesAsync(
        byte[] document,
        IReadOnlyList<int> pages,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        using var inStream = new MemoryStream(document);
        using var sourceDoc = PdfReader.Open(inStream, PdfDocumentOpenMode.Import);
        using var targetDoc = new PdfDocument();

        foreach (var pageNum in pages)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (pageNum >= 1 && pageNum <= sourceDoc.PageCount)
            {
                targetDoc.AddPage(sourceDoc.Pages[pageNum - 1]);
            }
        }

        using var outStream = new MemoryStream();
        targetDoc.Save(outStream);
        return Task.FromResult(outStream.ToArray());
    }

    private static XColor ParseColorWithOpacity(string hexColor, double opacity)
    {
        hexColor = hexColor.TrimStart('#');
        if (hexColor.Length == 6)
        {
            byte r = Convert.ToByte(hexColor[..2], 16);
            byte g = Convert.ToByte(hexColor.Substring(2, 2), 16);
            byte b = Convert.ToByte(hexColor.Substring(4, 2), 16);
            return XColor.FromArgb((int)(Math.Clamp(opacity, 0.0, 1.0) * 255), r, g, b);
        }

        return XColor.FromArgb((int)(Math.Clamp(opacity, 0.0, 1.0) * 255), 128, 128, 128);
    }
}
