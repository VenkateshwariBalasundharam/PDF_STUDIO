using System.Text.Json;
using PDFStudio.Application.Engines;
using PDFStudio.Domain.Entities;
using PDFStudio.TemplateEngine.Sanitization;
using PDFStudio.TemplateEngine.Validation;
using Stubble.Core;
using Stubble.Core.Builders;

namespace PDFStudio.TemplateEngine.Services;

public sealed class MustacheTemplateRenderer : ITemplateRenderer
{
    private readonly StubbleVisitorRenderer _renderer;

    public MustacheTemplateRenderer()
    {
        _renderer = new StubbleBuilder()
            .Configure(settings =>
            {
                settings.SetIgnoreCaseOnKeyLookup(true);
            })
            .Build();
    }

    public Task<string> RenderAsync(
        string templateHtml,
        object? dataModel,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        // 1. Sanitize the HTML template to strip executable script payloads
        var sanitizedHtml = HtmlSanitizer.Sanitize(templateHtml);

        // 2. Normalize JSON data model into dictionary/object graph for Stubble
        object modelToRender = dataModel switch
        {
            null => new Dictionary<string, object>(),
            JsonElement jsonElement => ConvertJsonElement(jsonElement),
            string jsonString when !string.IsNullOrWhiteSpace(jsonString) => ParseJsonStringToModel(jsonString),
            _ => dataModel
        };

        // 3. Render Mustache tags
        var rendered = _renderer.Render(sanitizedHtml, modelToRender);

        return Task.FromResult(rendered);
    }

    public Task<IReadOnlyList<string>> ValidateDataAsync(
        IReadOnlyList<PdfTemplateField> fields,
        string jsonData,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var errors = TemplateFieldValidator.Validate(fields, jsonData);
        return Task.FromResult(errors);
    }

    private static object ConvertJsonElement(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                foreach (var prop in element.EnumerateObject())
                {
                    dict[prop.Name] = ConvertJsonElement(prop.Value);
                }
                return dict;

            case JsonValueKind.Array:
                var list = new List<object>();
                foreach (var item in element.EnumerateArray())
                {
                    list.Add(ConvertJsonElement(item));
                }
                return list;

            case JsonValueKind.String:
                return element.GetString() ?? string.Empty;

            case JsonValueKind.Number:
                if (element.TryGetInt64(out var l))
                    return l;
                return element.GetDouble();

            case JsonValueKind.True:
                return true;

            case JsonValueKind.False:
                return false;

            case JsonValueKind.Null:
            default:
                return string.Empty;
        }
    }

    private static object ParseJsonStringToModel(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return ConvertJsonElement(doc.RootElement.Clone());
        }
        catch
        {
            return new Dictionary<string, object>();
        }
    }
}

