using PdfSharp.Pdf;
using PdfSharp.Pdf.IO;
using PuppeteerSharp;
using PuppeteerSharp.Media;
using PDFStudio.Application.Engines;

namespace PDFStudio.PdfEngine.Services;

public sealed class ChromiumPdfEngine : IPdfEngine
{
    private static IBrowser? _browserInstance;
    private static readonly SemaphoreSlim _browserLock = new(1, 1);

    private static async Task<IBrowser> EnsureBrowserAsync(CancellationToken cancellationToken)
    {
        if (_browserInstance != null && !_browserInstance.IsClosed)
        {
            return _browserInstance;
        }

        await _browserLock.WaitAsync(cancellationToken);
        try
        {
            if (_browserInstance != null && !_browserInstance.IsClosed)
            {
                return _browserInstance;
            }

            // Prefer a browser that is already installed (Chrome or Edge): no download, no antivirus scan of a new exe.
            // Set PDFSTUDIO_CHROME_PATH to force a specific chrome.exe / msedge.exe.
            var executablePath = FindInstalledBrowser();
            if (executablePath is null)
            {
                var browserFetcher = new BrowserFetcher();
                await browserFetcher.DownloadAsync();
            }

            _browserInstance = await Puppeteer.LaunchAsync(new LaunchOptions
            {
                Headless = true,
                ExecutablePath = executablePath,
                Timeout = 120000,
                Args = BuildLaunchArgs()
            });

            return _browserInstance;
        }
        finally
        {
            _browserLock.Release();
        }
    }

    private static string? FindInstalledBrowser()
    {
        var fromEnv = Environment.GetEnvironmentVariable("PDFSTUDIO_CHROME_PATH");
        if (!string.IsNullOrWhiteSpace(fromEnv) && File.Exists(fromEnv))
        {
            return fromEnv;
        }

        if (!OperatingSystem.IsWindows())
        {
            return null;
        }

        var pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        var candidates = new[]
        {
            Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe")
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static string[] BuildLaunchArgs()
    {
        var args = new List<string>
        {
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-first-run"
        };

        // These two flags are for Linux containers only; they make Chrome crash on Windows.
        if (OperatingSystem.IsLinux())
        {
            args.Add("--no-zygote");
            args.Add("--single-process");
        }

        return args.ToArray();
    }

    private static PaperFormat ResolveFormat(string? size) =>
        (size ?? "A4").Trim().ToUpperInvariant() switch
        {
            "A3" => PaperFormat.A3,
            "A5" => PaperFormat.A5,
            "LETTER" => PaperFormat.Letter,
            "LEGAL" => PaperFormat.Legal,
            "TABLOID" => PaperFormat.Tabloid,
            _ => PaperFormat.A4
        };

    public async Task<byte[]> GenerateAsync(
        PdfGenerationRequest request,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var browser = await EnsureBrowserAsync(cancellationToken);
        await using var page = await browser.NewPageAsync();

        // Enforce SSRF protection: block non-data remote network requests
        await page.SetRequestInterceptionAsync(true);
        page.Request += (sender, e) =>
        {
            var url = e.Request.Url;
            if (url.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("blob:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("about:", StringComparison.OrdinalIgnoreCase))
            {
                e.Request.ContinueAsync();
            }
            else
            {
                // Disallow arbitrary remote requests during PDF rendering
                e.Request.AbortAsync();
            }
        };

        var html = WrapHtmlDocument(request);
        await page.SetContentAsync(html, new NavigationOptions
        {
            WaitUntil = new[] { WaitUntilNavigation.Load },
            Timeout = 30000
        });

        var pdfOptions = new PdfOptions
        {
            Format = ResolveFormat(request.Settings?.Size),
            PrintBackground = request.Settings?.PrintBackground ?? true,
            Landscape = request.Settings?.Orientation.Equals("Landscape", StringComparison.OrdinalIgnoreCase) ?? false,
            DisplayHeaderFooter = !string.IsNullOrWhiteSpace(request.HeaderHtml) || !string.IsNullOrWhiteSpace(request.FooterHtml),
            HeaderTemplate = string.IsNullOrWhiteSpace(request.HeaderHtml) ? "<span></span>" : request.HeaderHtml,
            FooterTemplate = string.IsNullOrWhiteSpace(request.FooterHtml) ? "<span></span>" : request.FooterHtml,
            Scale = (decimal)(request.Settings?.Scale ?? 1.0),
            MarginOptions = new MarginOptions
            {
                Top = $"{request.Settings?.MarginTopMm ?? 10}mm",
                Bottom = $"{request.Settings?.MarginBottomMm ?? 10}mm",
                Left = $"{request.Settings?.MarginLeftMm ?? 10}mm",
                Right = $"{request.Settings?.MarginRightMm ?? 10}mm"
            }
        };

        var pdfBytes = await page.PdfDataAsync(pdfOptions);
        return pdfBytes;
    }

    public Task<byte[]> MergeAsync(
        IReadOnlyList<byte[]> documents,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        using var targetDoc = new PdfDocument();

        foreach (var docBytes in documents)
        {
            cancellationToken.ThrowIfCancellationRequested();

            using var inStream = new MemoryStream(docBytes);
            using var sourceDoc = PdfReader.Open(inStream, PdfDocumentOpenMode.Import);

            for (int i = 0; i < sourceDoc.PageCount; i++)
            {
                targetDoc.AddPage(sourceDoc.Pages[i]);
            }
        }

        using var outStream = new MemoryStream();
        targetDoc.Save(outStream);
        return Task.FromResult(outStream.ToArray());
    }

    public Task<byte[]> SplitAsync(
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

    private static string WrapHtmlDocument(PdfGenerationRequest request)
    {
        var styles = request.DefaultStylesCss ?? "";
        return $$"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                        -webkit-print-color-adjust: exact;
                    }
                    {{styles}}
                </style>
            </head>
            <body>
                {{request.HtmlContent}}
            </body>
            </html>
            """;
    }
}