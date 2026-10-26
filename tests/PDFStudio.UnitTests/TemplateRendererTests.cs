using System.Text.Json;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.TemplateEngine.Sanitization;
using PDFStudio.TemplateEngine.Services;

namespace PDFStudio.UnitTests;

public class TemplateRendererTests
{
    [Fact]
    public async Task RenderAsync_ReplacesMustacheVariables()
    {
        var renderer = new MustacheTemplateRenderer();
        var template = "<h1>Hello {{customer.name}}</h1><p>Invoice: {{invoiceNo}}</p>";
        var model = new
        {
            customer = new { name = "Acme Global" },
            invoiceNo = "INV-2026-001"
        };

        var result = await renderer.RenderAsync(template, model);

        Assert.Contains("Hello Acme Global", result);
        Assert.Contains("Invoice: INV-2026-001", result);
    }

    [Fact]
    public async Task RenderAsync_RendersSectionLoops()
    {
        var renderer = new MustacheTemplateRenderer();
        var template = "<ul>{{#items}}<li>{{name}}: ${{price}}</li>{{/items}}</ul>";
        var model = new
        {
            items = new[]
            {
                new { name = "Item A", price = 10 },
                new { name = "Item B", price = 25 }
            }
        };

        var result = await renderer.RenderAsync(template, model);

        Assert.Contains("<li>Item A: $10</li>", result);
        Assert.Contains("<li>Item B: $25</li>", result);
    }

    [Fact]
    public async Task RenderAsync_StripsDangerousScriptsAndHandlers()
    {
        var renderer = new MustacheTemplateRenderer();
        var template = @"<h1>Title</h1><script>alert('pwned')</script><button onclick=""doBad()"">Click</button><a href=""javascript:malicious()"">Link</a>";

        var result = await renderer.RenderAsync(template, new { });

        Assert.DoesNotContain("<script>", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("alert('pwned')", result);
        Assert.DoesNotContain("onclick", result, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript:", result, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ValidateDataAsync_DetectsMissingRequiredFieldsAndTypeMismatches()
    {
        var renderer = new MustacheTemplateRenderer();
        var fields = new List<PdfTemplateField>
        {
            new() { FieldName = "companyName", DataType = TemplateFieldDataType.String, IsRequired = true },
            new() { FieldName = "amount", DataType = TemplateFieldDataType.Number, IsRequired = true },
            new() { FieldName = "items", DataType = TemplateFieldDataType.Array, IsRequired = false }
        };

        var invalidJson = """
            {
                "amount": "not-a-number"
            }
            """;

        var errors = await renderer.ValidateDataAsync(fields, invalidJson);

        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Contains("companyName") && e.Contains("required"));
        Assert.Contains(errors, e => e.Contains("amount") && e.Contains("number"));
    }
}

