using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.Postgres;

public sealed class PostgresTemplateRepository : ITemplateRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresTemplateRepository(
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
                SELECT id, organization_id, template_key, name, description, status, current_version_id, created_at_utc, updated_at_utc
                FROM pdf.pdf_templates
                WHERE organization_id = @orgId AND id = @id;
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
                SELECT id, organization_id, template_key, name, description, status, current_version_id, created_at_utc, updated_at_utc
                FROM pdf.pdf_templates
                WHERE organization_id = @orgId AND template_key = @key;
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
                SELECT id, organization_id, template_key, name, description, status, current_version_id, created_at_utc, updated_at_utc
                FROM pdf.pdf_templates
                WHERE organization_id = @orgId
                ORDER BY name ASC
                OFFSET @skip LIMIT @take;
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
                INSERT INTO pdf.pdf_templates (id, organization_id, template_key, name, description, status, current_version_id, created_at_utc, updated_at_utc)
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
                UPDATE pdf.pdf_templates
                SET name = @name, description = @desc, updated_at_utc = now()
                WHERE organization_id = @orgId AND id = @id;
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
                UPDATE pdf.pdf_templates
                SET status = @status, updated_at_utc = now()
                WHERE organization_id = @orgId AND id = @id;
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
                UPDATE pdf.pdf_templates
                SET current_version_id = @verId, updated_at_utc = now()
                WHERE organization_id = @orgId AND id = @id;
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
            Id = reader.GetGuid(reader.GetOrdinal("id")),
            OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
            Key = reader.GetString(reader.GetOrdinal("template_key")),
            Name = reader.GetString(reader.GetOrdinal("name")),
            Description = reader.IsDBNull(reader.GetOrdinal("description")) ? null : reader.GetString(reader.GetOrdinal("description")),
            Status = (TemplateStatus)reader.GetInt16(reader.GetOrdinal("status")),
            CurrentVersionId = reader.IsDBNull(reader.GetOrdinal("current_version_id")) ? null : reader.GetGuid(reader.GetOrdinal("current_version_id")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc")),
            UpdatedAtUtc = reader.IsDBNull(reader.GetOrdinal("updated_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at_utc"))
        };
    }
}

