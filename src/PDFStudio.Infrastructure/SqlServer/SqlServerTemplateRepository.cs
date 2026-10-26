using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.SqlServer;

public sealed class SqlServerTemplateRepository : ITemplateRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public SqlServerTemplateRepository(
        IDbConnectionFactory connectionFactory,
        ITransactionManager transactionManager)
    {
        _connectionFactory = connectionFactory;
        _transactionManager = transactionManager;
    }

    private async Task<(DbConnection connection, bool dispose)> GetConnectionAsync(CancellationToken ct)
    {
        if (_transactionManager.CurrentTransaction is not null)
            return (_transactionManager.CurrentTransaction.Connection!, false);

        var conn = await _connectionFactory.CreateConnectionAsync(ct);
        return (conn, true);
    }

    public async Task<PdfTemplate?> GetByIdAsync(Guid organizationId, Guid templateId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT Id, OrganizationId, TemplateKey, Name, Description, Status, CurrentVersionId, CreatedAtUtc, UpdatedAtUtc
                FROM pdf.PdfTemplates
                WHERE OrganizationId = @orgId AND Id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", templateId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapTemplate(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<PdfTemplate?> GetByKeyAsync(Guid organizationId, string key, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT Id, OrganizationId, TemplateKey, Name, Description, Status, CurrentVersionId, CreatedAtUtc, UpdatedAtUtc
                FROM pdf.PdfTemplates
                WHERE OrganizationId = @orgId AND TemplateKey = @key;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@key", key, DbType.String);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapTemplate(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<PdfTemplate>> ListAsync(Guid organizationId, int skip = 0, int take = 50, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT Id, OrganizationId, TemplateKey, Name, Description, Status, CurrentVersionId, CreatedAtUtc, UpdatedAtUtc
                FROM pdf.PdfTemplates
                WHERE OrganizationId = @orgId
                ORDER BY Name ASC
                OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@skip", skip, DbType.Int32);
            DbHelper.AddParameter(cmd, "@take", take, DbType.Int32);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<PdfTemplate>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(MapTemplate(reader));
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Guid> CreateAsync(PdfTemplate template, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.PdfTemplates (Id, OrganizationId, TemplateKey, Name, Description, Status, CurrentVersionId, CreatedAtUtc, UpdatedAtUtc)
                VALUES (@id, @orgId, @key, @name, @desc, @status, @currentVer, @created, @updated);
                """;

            if (template.Id == Guid.Empty)
                template.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", template.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", template.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@key", template.Key, DbType.String);
            DbHelper.AddParameter(cmd, "@name", template.Name, DbType.String);
            DbHelper.AddParameter(cmd, "@desc", template.Description, DbType.String);
            DbHelper.AddParameter(cmd, "@status", (short)template.Status, DbType.Int16);
            DbHelper.AddParameter(cmd, "@currentVer", template.CurrentVersionId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@created", template.CreatedAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@updated", template.UpdatedAtUtc ?? template.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return template.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task UpdateAsync(PdfTemplate template, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.PdfTemplates
                SET Name = @name, Description = @desc, UpdatedAtUtc = SYSUTCDATETIME()
                WHERE OrganizationId = @orgId AND Id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", template.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", template.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@name", template.Name, DbType.String);
            DbHelper.AddParameter(cmd, "@desc", template.Description, DbType.String);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task SetStatusAsync(Guid organizationId, Guid templateId, TemplateStatus status, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.PdfTemplates
                SET Status = @status, UpdatedAtUtc = SYSUTCDATETIME()
                WHERE OrganizationId = @orgId AND Id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", templateId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@status", (short)status, DbType.Int16);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task SetCurrentVersionAsync(Guid organizationId, Guid templateId, Guid versionId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.PdfTemplates
                SET CurrentVersionId = @verId, UpdatedAtUtc = SYSUTCDATETIME()
                WHERE OrganizationId = @orgId AND Id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", templateId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@verId", versionId, DbType.Guid);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    private static PdfTemplate MapTemplate(DbDataReader reader)
    {
        return new PdfTemplate
        {
            Id = reader.GetGuid(reader.GetOrdinal("Id")),
            OrganizationId = reader.GetGuid(reader.GetOrdinal("OrganizationId")),
            Key = reader.GetString(reader.GetOrdinal("TemplateKey")),
            Name = reader.GetString(reader.GetOrdinal("Name")),
            Description = reader.IsDBNull(reader.GetOrdinal("Description")) ? null : reader.GetString(reader.GetOrdinal("Description")),
            Status = (TemplateStatus)reader.GetInt16(reader.GetOrdinal("Status")),
            CurrentVersionId = reader.IsDBNull(reader.GetOrdinal("CurrentVersionId")) ? null : reader.GetGuid(reader.GetOrdinal("CurrentVersionId")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAtUtc")),
            UpdatedAtUtc = reader.IsDBNull(reader.GetOrdinal("UpdatedAtUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("UpdatedAtUtc"))
        };
    }
}

