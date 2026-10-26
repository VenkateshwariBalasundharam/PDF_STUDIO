using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.SqlServer;

public sealed class SqlServerDocumentVersionRepository : IDocumentVersionRepository
{
    private const string Columns =
        "Id, OrganizationId, DocumentId, VersionNumber, StorageObjectId, PageCount, SizeBytes, Sha256, CreatedAtUtc";

    public SqlServerDocumentVersionRepository(IDbConnectionFactory connectionFactory, ITransactionManager transactionManager)
    {
        _connectionFactory = connectionFactory;
        _transactionManager = transactionManager;
    }

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

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
            const string sql = $"""
                SELECT {Columns}
                FROM pdf.DocumentVersions
                WHERE OrganizationId = @orgId AND Id = @verId;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@verId", versionId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<DocumentVersion?> GetLatestAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT TOP (1) {Columns}
                FROM pdf.DocumentVersions
                WHERE OrganizationId = @orgId AND DocumentId = @docId
                ORDER BY VersionNumber DESC;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@docId", documentId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<IReadOnlyList<DocumentVersion>> ListByDocumentAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT {Columns}
                FROM pdf.DocumentVersions
                WHERE OrganizationId = @orgId AND DocumentId = @docId
                ORDER BY VersionNumber ASC;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@docId", documentId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<DocumentVersion>();
            while (await reader.ReadAsync(cancellationToken))
                list.Add(Map(reader));
            return list;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<Guid> CreateAsync(DocumentVersion version, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.DocumentVersions (
                    Id, OrganizationId, DocumentId, VersionNumber, StorageObjectId, PageCount, SizeBytes, Sha256, CreatedAtUtc
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
            DbHelper.AddParameter(cmd, "@sha256", version.Sha256Checksum, DbType.AnsiStringFixedLength);
            DbHelper.AddParameter(cmd, "@createdUtc", version.CreatedAtUtc.UtcDateTime, DbType.DateTime2);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return version.Id;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    private static DocumentVersion Map(DbDataReader reader) => new()
    {
        Id = reader.GetGuid(reader.GetOrdinal("Id")),
        OrganizationId = reader.GetGuid(reader.GetOrdinal("OrganizationId")),
        DocumentId = reader.GetGuid(reader.GetOrdinal("DocumentId")),
        VersionNumber = reader.GetInt32(reader.GetOrdinal("VersionNumber")),
        StorageObjectId = reader.GetGuid(reader.GetOrdinal("StorageObjectId")),
        PageCount = reader.IsDBNull(reader.GetOrdinal("PageCount")) ? 0 : reader.GetInt32(reader.GetOrdinal("PageCount")),
        FileSizeBytes = reader.GetInt64(reader.GetOrdinal("SizeBytes")),
        Sha256Checksum = reader.IsDBNull(reader.GetOrdinal("Sha256")) ? string.Empty : reader.GetString(reader.GetOrdinal("Sha256")),
        CreatedAtUtc = reader.GetUtc("CreatedAtUtc")
    };
}
