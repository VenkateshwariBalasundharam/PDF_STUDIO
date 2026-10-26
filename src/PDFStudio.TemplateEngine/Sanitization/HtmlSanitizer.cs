using System.Text.RegularExpressions;

namespace PDFStudio.TemplateEngine.Sanitization;

public static partial class HtmlSanitizer
{
    // Strip <script>...</script>
    [GeneratedRegex(@"<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ScriptTagsRegex();

    // Strip inline javascript: protocols in href / src attributes
    [GeneratedRegex(@"javascript\s*:", RegexOptions.IgnoreCase)]
    private static partial Regex JavascriptProtocolRegex();

    // Strip inline event handlers: onclick, onerror, onload, etc.
    [GeneratedRegex(@"\son\w+\s*=\s*(?:'[^']*'|""[^""]*""|[^\s>]+)", RegexOptions.IgnoreCase)]
    private static partial Regex InlineEventHandlersRegex();

    // Strip remote @import CSS declarations (prevent SSRF during template execution)
    [GeneratedRegex(@"@import\s+[^;]+;", RegexOptions.IgnoreCase)]
    private static partial Regex CssRemoteImportRegex();

    // Strip <iframe...>, <object...>, <embed...>
    [GeneratedRegex(@"<(iframe|object|embed)\b[^<]*(?:(?!<\/(iframe|object|embed)>)<[^<]*)*<\/(iframe|object|embed)>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex EmbeddedFramesRegex();

    public static string Sanitize(string htmlContent)
    {
        if (string.IsNullOrWhiteSpace(htmlContent))
            return string.Empty;

        var cleaned = ScriptTagsRegex().Replace(htmlContent, string.Empty);
        cleaned = EmbeddedFramesRegex().Replace(cleaned, string.Empty);
        cleaned = InlineEventHandlersRegex().Replace(cleaned, string.Empty);
        cleaned = JavascriptProtocolRegex().Replace(cleaned, "blocked-script:");
        cleaned = CssRemoteImportRegex().Replace(cleaned, string.Empty);

        return cleaned;
    }
}

