using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.Postgres;

public sealed class PostgresDocumentRepository : IDocumentRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresDocumentRepository(
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

    public async Task<Document?> GetByIdAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, public_id, title, status, is_favorite, expires_at_utc, current_version_id, created_at_utc, updated_at_utc
                FROM pdf.documents
                WHERE organization_id = @orgId AND id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", documentId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapDocument(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Document?> GetByNumberAsync(Guid organizationId, string documentNumber, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, public_id, title, status, is_favorite, expires_at_utc, current_version_id, created_at_utc, updated_at_utc
                FROM pdf.documents
                WHERE organization_id = @orgId AND public_id = @docNo;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@docNo", documentNumber, DbType.String);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapDocument(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<Document>> ListAsync(
        Guid organizationId,
        DocumentStatus? statusFilter = null,
        bool? favoriteOnly = null,
        int skip = 0,
        int take = 50,
        CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            var sql = """
                SELECT id, organization_id, public_id, title, status, is_favorite, expires_at_utc, current_version_id, created_at_utc, updated_at_utc
                FROM pdf.documents
                WHERE organization_id = @orgId
                """;

            if (statusFilter.HasValue)
                sql += " AND status = @status";
            if (favoriteOnly == true)
                sql += " AND is_favorite = true";

            sql += " ORDER BY created_at_utc DESC OFFSET @skip LIMIT @take;";

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@skip", skip, DbType.Int32);
            DbHelper.AddParameter(cmd, "@take", take, DbType.Int32);

            if (statusFilter.HasValue)
                DbHelper.AddParameter(cmd, "@status", (short)statusFilter.Value, DbType.Int16);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<Document>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(MapDocument(reader));
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Guid> CreateAsync(Document document, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.documents (id, organization_id, public_id, title, status, is_favorite, expires_at_utc, current_version_id, created_at_utc, updated_at_utc)
                VALUES (@id, @orgId, @pubId, @title, @status, @fav, @exp, @curVer, @created, @updated);
                """;

            if (document.Id == Guid.Empty)
                document.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", document.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", document.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@pubId", document.DocumentNumber, DbType.String);
            DbHelper.AddParameter(cmd, "@title", document.Title, DbType.String);
            DbHelper.AddParameter(cmd, "@status", (short)document.Status, DbType.Int16);
            DbHelper.AddParameter(cmd, "@fav", document.IsFavorite, DbType.Boolean);
            DbHelper.AddParameter(cmd, "@exp", document.ExpiresAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@curVer", document.CurrentVersionId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@created", document.CreatedAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@updated", document.UpdatedAtUtc ?? document.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return document.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task SetStatusAsync(Guid organizationId, Guid documentId, DocumentStatus status, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.documents SET status = @status, updated_at_utc = now() WHERE organization_id = @orgId AND id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", documentId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@status", (short)status, DbType.Int16);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task SetFavoriteAsync(Guid organizationId, Guid documentId, bool isFavorite, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.documents SET is_favorite = @fav, updated_at_utc = now() WHERE organization_id = @orgId AND id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", documentId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@fav", isFavorite, DbType.Boolean);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task SetCurrentVersionAsync(Guid organizationId, Guid documentId, Guid versionId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.documents SET current_version_id = @verId, updated_at_utc = now() WHERE organization_id = @orgId AND id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", documentId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@verId", versionId, DbType.Guid);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<Document>> ListExpiredAsync(DateTimeOffset thresholdUtc, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, public_id, title, status, is_favorite, expires_at_utc, current_version_id, created_at_utc, updated_at_utc
                FROM pdf.documents
                WHERE expires_at_utc <= @thresh AND status = 1;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@thresh", thresholdUtc, DbType.DateTimeOffset);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<Document>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(MapDocument(reader));
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    private static Document MapDocument(DbDataReader reader)
    {
        return new Document
        {
            Id = reader.GetGuid(reader.GetOrdinal("id")),
            OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
            DocumentNumber = reader.GetString(reader.GetOrdinal("public_id")),
            Title = reader.GetString(reader.GetOrdinal("title")),
            Status = (DocumentStatus)reader.GetInt16(reader.GetOrdinal("status")),
            IsFavorite = reader.GetBoolean(reader.GetOrdinal("is_favorite")),
            ExpiresAtUtc = reader.IsDBNull(reader.GetOrdinal("expires_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("expires_at_utc")),
            CurrentVersionId = reader.IsDBNull(reader.GetOrdinal("current_version_id")) ? null : reader.GetGuid(reader.GetOrdinal("current_version_id")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc")),
            UpdatedAtUtc = reader.IsDBNull(reader.GetOrdinal("updated_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at_utc"))
        };
    }
}

