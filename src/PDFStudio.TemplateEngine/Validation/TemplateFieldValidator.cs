using System.Text.Json;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.TemplateEngine.Validation;

public static class TemplateFieldValidator
{
    public static IReadOnlyList<string> Validate(IReadOnlyList<PdfTemplateField> fields, string jsonData)
    {
        var errors = new List<string>();

        if (fields == null || fields.Count == 0)
        {
            return errors;
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(jsonData) ? "{}" : jsonData);
        }
        catch (JsonException ex)
        {
            errors.Add($"Invalid JSON payload: {ex.Message}");
            return errors;
        }

        using (doc)
        {
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                errors.Add("Root of template data must be a JSON object.");
                return errors;
            }

            foreach (var field in fields)
            {
                var hasProperty = root.TryGetProperty(field.FieldName, out var prop);

                if (!hasProperty || prop.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                {
                    if (field.IsRequired && string.IsNullOrEmpty(field.DefaultValue))
                    {
                        errors.Add($"Field '{field.FieldName}' is required but was not provided or is null.");
                    }
                    continue;
                }

                // Verify data type compatibility
                switch (field.DataType)
                {
                    case TemplateFieldDataType.String:
                        if (prop.ValueKind != JsonValueKind.String)
                            errors.Add($"Field '{field.FieldName}' must be a string.");
                        break;

                    case TemplateFieldDataType.Number:
                        if (prop.ValueKind != JsonValueKind.Number)
                            errors.Add($"Field '{field.FieldName}' must be a number.");
                        break;

                    case TemplateFieldDataType.Boolean:
                        if (prop.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                            errors.Add($"Field '{field.FieldName}' must be a boolean.");
                        break;

                    case TemplateFieldDataType.Date:
                        if (prop.ValueKind != JsonValueKind.String || !DateTimeOffset.TryParse(prop.GetString(), out _))
                            errors.Add($"Field '{field.FieldName}' must be a valid ISO-8601 date string.");
                        break;

                    case TemplateFieldDataType.Array:
                        if (prop.ValueKind != JsonValueKind.Array)
                            errors.Add($"Field '{field.FieldName}' must be a JSON array.");
                        break;

                    case TemplateFieldDataType.Object:
                        if (prop.ValueKind != JsonValueKind.Object)
                            errors.Add($"Field '{field.FieldName}' must be a JSON object.");
                        break;
                }
            }
        }

        return errors;
    }
}

