using System.Data;
using System.Data.Common;
using System.Text.Json;
using PDFStudio.Application.Persistence;

namespace PDFStudio.JobEngine.Templates;

public sealed record TemplateContent(
    Guid Id,
    string Key,
    string Name,
    string Html,
    string? Css,
    string? HeaderHtml,
    string? FooterHtml,
    string? PageSettingsJson);

public interface ITemplateContentService
{
    Task<TemplateContent?> GetCurrentAsync(Guid organizationId, string keyOrId, CancellationToken ct = default);
    Task<IReadOnlyList<string>> ListKeysAsync(Guid organizationId, CancellationToken ct = default);
}

/// <summary>
/// Reads the CURRENT (published) version of a template straight from PostgreSQL.
/// Shared by the Public API (synchronous render) and the Worker (background jobs).
/// </summary>
public sealed class TemplateContentService : ITemplateContentService
{
    private readonly IDbConnectionFactory _connectionFactory;

    public TemplateContentService(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<TemplateContent?> GetCurrentAsync(Guid organizationId, string keyOrId, CancellationToken ct = default)
    {
        const string sql = """
            SELECT t.id, t.template_key, t.name, v.html_content, v.css_content, v.header_html, v.footer_html, v.page_settings_json::text
            FROM pdf.pdf_templates t
            JOIN pdf.pdf_template_versions v
              ON v.organization_id = t.organization_id AND v.id = t.current_version_id
            WHERE t.organization_id = @orgId
              AND t.status = 1
              AND (t.template_key = @key OR t.id::text = @key)
            LIMIT 1;
            """;

        await using var conn = await _connectionFactory.CreateConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        AddParam(cmd, "@orgId", organizationId, DbType.Guid);
        AddParam(cmd, "@key", keyOrId, DbType.String);

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new TemplateContent(
            Id: reader.GetGuid(0),
            Key: reader.GetString(1),
            Name: reader.GetString(2),
            Html: reader.GetString(3),
            Css: reader.IsDBNull(4) ? null : reader.GetString(4),
            HeaderHtml: reader.IsDBNull(5) ? null : reader.GetString(5),
            FooterHtml: reader.IsDBNull(6) ? null : reader.GetString(6),
            PageSettingsJson: reader.IsDBNull(7) ? null : reader.GetString(7));
    }

    public async Task<IReadOnlyList<string>> ListKeysAsync(Guid organizationId, CancellationToken ct = default)
    {
        const string sql = """
            SELECT template_key
            FROM pdf.pdf_templates
            WHERE organization_id = @orgId AND status = 1 AND current_version_id IS NOT NULL
            ORDER BY template_key;
            """;

        await using var conn = await _connectionFactory.CreateConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        AddParam(cmd, "@orgId", organizationId, DbType.Guid);

        var keys = new List<string>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            keys.Add(reader.GetString(0));
        }
        return keys;
    }

    private static void AddParam(DbCommand cmd, string name, object value, DbType type)
    {
        var p = cmd.CreateParameter();
        p.ParameterName = name;
        p.Value = value;
        p.DbType = type;
        cmd.Parameters.Add(p);
    }
}

/// <summary>Reads the margins ("top": "20mm" ...) out of a template's page_settings_json.</summary>
public static class TemplatePageSettings
{
    public static (double? Top, double? Right, double? Bottom, double? Left) ParseMargins(string? pageSettingsJson)
    {
        if (string.IsNullOrWhiteSpace(pageSettingsJson))
        {
            return (null, null, null, null);
        }

        try
        {
            using var doc = JsonDocument.Parse(pageSettingsJson);
            if (!doc.RootElement.TryGetProperty("margins", out var m) || m.ValueKind != JsonValueKind.Object)
            {
                return (null, null, null, null);
            }

            return (ReadMm(m, "top"), ReadMm(m, "right"), ReadMm(m, "bottom"), ReadMm(m, "left"));
        }
        catch (JsonException)
        {
            return (null, null, null, null);
        }
    }

    private static double? ReadMm(JsonElement margins, string name)
    {
        if (!margins.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var text = (v.GetString() ?? string.Empty).Trim().ToLowerInvariant().Replace("mm", string.Empty);
        return double.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n)
            ? n
            : null;
    }
}
