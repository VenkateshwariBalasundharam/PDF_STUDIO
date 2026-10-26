using PdfSharp.Drawing;
using PdfSharp.Pdf;
using PDFStudio.Application.Engines;
using PDFStudio.PdfEngine.Services;

namespace PDFStudio.UnitTests;

public class PdfManipulatorTests
{
    private static byte[] CreateSamplePdf(int pageCount = 2)
    {
        PDFStudio.PdfEngine.Fonts.DefaultFontResolver.EnsureInitialized();
        using var doc = new PdfDocument();
        for (int i = 0; i < pageCount; i++)
        {
            var page = doc.AddPage();
            using var gfx = XGraphics.FromPdfPage(page);
            var font = new XFont("Arial", 20, XFontStyleEx.Regular);
            gfx.DrawString($"Page {i + 1}", font, XBrushes.Black, new XPoint(100, 100));
        }

        using var ms = new MemoryStream();
        doc.Save(ms);
        return ms.ToArray();
    }

    [Fact]
    public async Task MergeAsync_CombinesMultiplePdfs()
    {
        var engine = new ChromiumPdfEngine();
        var doc1 = CreateSamplePdf(1);
        var doc2 = CreateSamplePdf(2);

        var merged = await engine.MergeAsync([doc1, doc2]);

        Assert.NotNull(merged);
        Assert.True(merged.Length > doc1.Length);
    }

    [Fact]
    public async Task SplitAsync_ExtractsRequestedPages()
    {
        var engine = new ChromiumPdfEngine();
        var doc = CreateSamplePdf(3);

        var split = await engine.SplitAsync(doc, [2]);

        Assert.NotNull(split);
        Assert.True(split.Length > 0);
    }

    [Fact]
    public async Task WatermarkAsync_AppliesWatermark()
    {
        var manipulator = new PdfSharpManipulator();
        var doc = CreateSamplePdf(1);

        var watermarked = await manipulator.WatermarkAsync(doc, new WatermarkOptions(
            Text: "CONFIDENTIAL",
            Opacity: 0.5,
            RotationAngleDegrees: 45,
            FontSize: 36));

        Assert.NotNull(watermarked);
        Assert.True(watermarked.Length > doc.Length);
    }

    [Fact]
    public async Task StampAsync_AppliesStamp()
    {
        var manipulator = new PdfSharpManipulator();
        var doc = CreateSamplePdf(1);

        var stamped = await manipulator.StampAsync(doc, new StampOptions(
            Text: "APPROVED",
            Position: "BottomRight"));

        Assert.NotNull(stamped);
        Assert.True(stamped.Length > 0);
    }

    [Fact]
    public async Task ProtectAsync_AppliesPasswordProtection()
    {
        var security = new PdfSharpSecurityService();
        var doc = CreateSamplePdf(1);

        var protectedPdf = await security.ProtectAsync(doc, new PdfProtectionOptions(
            UserPassword: "user123",
            OwnerPassword: "owner123",
            AllowPrinting: false,
            AllowModifying: false,
            AllowCopying: false));

        Assert.NotNull(protectedPdf);
        Assert.True(protectedPdf.Length > 0);
    }
}
