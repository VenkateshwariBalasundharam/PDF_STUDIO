using System.Data.Common;

namespace PDFStudio.Infrastructure.SqlServer;

/// <summary>
/// SQL Server stores UTC timestamps as datetime2 (no offset). SqlDataReader cannot always
/// return datetime2 as DateTimeOffset, so read DateTime and tag it as UTC.
/// </summary>
internal static class SqlServerReaderExtensions
{
    public static DateTimeOffset GetUtc(this DbDataReader reader, string column)
    {
        var value = reader.GetDateTime(reader.GetOrdinal(column));
        return new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    }

    public static DateTimeOffset? GetUtcOrNull(this DbDataReader reader, string column)
    {
        var ordinal = reader.GetOrdinal(column);
        if (reader.IsDBNull(ordinal)) return null;
        return new DateTimeOffset(DateTime.SpecifyKind(reader.GetDateTime(ordinal), DateTimeKind.Utc));
    }

    /// <summary>tinyint/smallint columns come back as byte/short; normalise to short.</summary>
    public static short GetSmall(this DbDataReader reader, string column)
        => Convert.ToInt16(reader.GetValue(reader.GetOrdinal(column)));
}
