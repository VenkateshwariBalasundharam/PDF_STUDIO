using PdfSharp.Fonts;

namespace PDFStudio.PdfEngine.Fonts;

public sealed class DefaultFontResolver : IFontResolver
{
    private static readonly Lazy<DefaultFontResolver> _instance = new(() => new DefaultFontResolver());
    public static DefaultFontResolver Instance => _instance.Value;

    private DefaultFontResolver() { }

    public static void EnsureInitialized()
    {
        if (GlobalFontSettings.FontResolver == null)
        {
            GlobalFontSettings.FontResolver = Instance;
        }
    }

    public byte[]? GetFont(string faceName)
    {
        // Check Windows Fonts folder for Arial / Tahoma / Segoe UI
        var windir = Environment.GetFolderPath(Environment.SpecialFolder.Fonts);
        string[] candidates = faceName.ToLowerInvariant() switch
        {
            var f when f.Contains("bold") => ["arialbd.ttf", "segoeui.ttf", "tahoma.ttf"],
            _ => ["arial.ttf", "segoeui.ttf", "tahoma.ttf"]
        };

        foreach (var fontFile in candidates)
        {
            var fontPath = Path.Combine(windir, fontFile);
            if (File.Exists(fontPath))
            {
                return File.ReadAllBytes(fontPath);
            }
        }

        // Fallback: search any .ttf in font directory
        if (Directory.Exists(windir))
        {
            var firstTtf = Directory.GetFiles(windir, "*.ttf").FirstOrDefault();
            if (firstTtf != null)
            {
                return File.ReadAllBytes(firstTtf);
            }
        }

        return null;
    }

    public FontResolverInfo? ResolveTypeface(string familyName, bool isBold, bool isItalic)
    {
        // Map common fonts to Arial font face
        var faceName = isBold ? "Arial#Bold" : "Arial#Regular";
        return new FontResolverInfo(faceName);
    }
}

