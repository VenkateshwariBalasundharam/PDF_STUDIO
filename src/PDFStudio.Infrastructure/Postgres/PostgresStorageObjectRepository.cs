using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.Postgres;

/// <summary>Maps the StorageObject entity onto pdf.storage_objects (see db/postgres/001_schema.sql).</summary>
public sealed class PostgresStorageObjectRepository : IStorageObjectRepository
{
    private const string Columns =
        "id, organization_id, provider, container, object_key, size_bytes, content_type, status, created_at_utc, deleted_at_utc";

    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresStorageObjectRepository(
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

    public async Task<Guid> CreateAsync(StorageObject storageObject, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.storage_objects (
                    id, organization_id, provider, container, object_key, size_bytes, content_type, status, created_at_utc
                ) VALUES (
                    @id, @orgId, @provider, NULL, @objectKey, @sizeBytes, @contentType, @status, @createdAtUtc
                );
                """;

            if (storageObject.Id == Guid.Empty)
                storageObject.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", storageObject.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", storageObject.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@provider", storageObject.StorageProvider, DbType.String);
            DbHelper.AddParameter(cmd, "@objectKey", storageObject.StorageKey, DbType.String);
            DbHelper.AddParameter(cmd, "@sizeBytes", storageObject.SizeBytes, DbType.Int64);
            DbHelper.AddParameter(cmd, "@contentType", storageObject.ContentType, DbType.String);
            DbHelper.AddParameter(cmd, "@status", (short)storageObject.Status, DbType.Int16);
            DbHelper.AddParameter(cmd, "@createdAtUtc", storageObject.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return storageObject.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<StorageObject?> GetByIdAsync(Guid organizationId, Guid storageObjectId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT {Columns}
                FROM pdf.storage_objects
                WHERE organization_id = @orgId AND id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", storageObjectId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task MarkPendingDeleteAsync(Guid organizationId, Guid storageObjectId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.storage_objects
                SET status = 2
                WHERE organization_id = @orgId AND id = @id AND status = 1;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", storageObjectId, DbType.Guid);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<StorageObject>> ListPendingDeleteAsync(int batchSize = 100, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT {Columns}
                FROM pdf.storage_objects
                WHERE status = 2
                ORDER BY created_at_utc ASC
                LIMIT @batch;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@batch", batchSize, DbType.Int32);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<StorageObject>();
            while (await reader.ReadAsync(cancellationToken))
                list.Add(Map(reader));
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task DeletePermanentlyAsync(Guid storageObjectId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "DELETE FROM pdf.storage_objects WHERE id = @id AND status = 2;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", storageObjectId, DbType.Guid);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    private static StorageObject Map(DbDataReader reader) => new()
    {
        Id = reader.GetGuid(reader.GetOrdinal("id")),
        OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
        StorageProvider = reader.GetString(reader.GetOrdinal("provider")),
        StorageKey = reader.GetString(reader.GetOrdinal("object_key")),
        SizeBytes = reader.GetInt64(reader.GetOrdinal("size_bytes")),
        ContentType = reader.GetString(reader.GetOrdinal("content_type")),
        Status = (StorageStatus)reader.GetInt16(reader.GetOrdinal("status")),
        CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc"))
    };
}
