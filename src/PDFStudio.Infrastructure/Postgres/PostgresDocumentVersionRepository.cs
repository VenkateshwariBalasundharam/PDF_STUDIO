using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.Postgres;

public sealed class PostgresDocumentVersionRepository : IDocumentVersionRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresDocumentVersionRepository(
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

    public async Task<DocumentVersion?> GetByIdAsync(Guid organizationId, Guid versionId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, document_id, version_number, storage_object_id, page_count, size_bytes, sha256, created_at_utc
                FROM pdf.document_versions
                WHERE organization_id = @orgId AND id = @verId;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@verId", versionId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapVersion(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<DocumentVersion?> GetLatestAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, document_id, version_number, storage_object_id, page_count, size_bytes, sha256, created_at_utc
                FROM pdf.document_versions
                WHERE organization_id = @orgId AND document_id = @docId
                ORDER BY version_number DESC
                LIMIT 1;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@docId", documentId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapVersion(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<DocumentVersion>> ListByDocumentAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, document_id, version_number, storage_object_id, page_count, size_bytes, sha256, created_at_utc
                FROM pdf.document_versions
                WHERE organization_id = @orgId AND document_id = @docId
                ORDER BY version_number ASC;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@docId", documentId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<DocumentVersion>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(MapVersion(reader));
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Guid> CreateAsync(DocumentVersion version, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.document_versions (
                    id, organization_id, document_id, version_number, storage_object_id, page_count, size_bytes, sha256, created_at_utc
                ) VALUES (
                    @id, @orgId, @docId, @verNum, @storageId, @pageCount, @fileSize, @sha256, @createdUtc
                );
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", version.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", version.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@docId", version.DocumentId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@verNum", version.VersionNumber, DbType.Int32);
            DbHelper.AddParameter(cmd, "@storageId", version.StorageObjectId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@pageCount", version.PageCount, DbType.Int32);
            DbHelper.AddParameter(cmd, "@fileSize", version.FileSizeBytes, DbType.Int64);
            DbHelper.AddParameter(cmd, "@sha256", version.Sha256Checksum, DbType.String);
            DbHelper.AddParameter(cmd, "@createdUtc", version.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return version.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    private static DocumentVersion MapVersion(DbDataReader reader)
    {
        return new DocumentVersion
        {
            Id = reader.GetGuid(reader.GetOrdinal("id")),
            OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
            DocumentId = reader.GetGuid(reader.GetOrdinal("document_id")),
            VersionNumber = reader.GetInt32(reader.GetOrdinal("version_number")),
            StorageObjectId = reader.GetGuid(reader.GetOrdinal("storage_object_id")),
            PageCount = reader.IsDBNull(reader.GetOrdinal("page_count")) ? 0 : reader.GetInt32(reader.GetOrdinal("page_count")),
            FileSizeBytes = reader.GetInt64(reader.GetOrdinal("size_bytes")),
            Sha256Checksum = reader.IsDBNull(reader.GetOrdinal("sha256")) ? string.Empty : reader.GetString(reader.GetOrdinal("sha256")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc"))
        };
    }
}

