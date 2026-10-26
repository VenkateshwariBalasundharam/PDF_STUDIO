using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.SqlServer;

/// <summary>Maps the StorageObject entity onto pdf.StorageObjects (see db/sqlserver/001_schema.sql).</summary>
public sealed class SqlServerStorageObjectRepository : IStorageObjectRepository
{
    private const string Columns =
        "Id, OrganizationId, Provider, Container, ObjectKey, SizeBytes, ContentType, Status, CreatedAtUtc, DeletedAtUtc";

    public SqlServerStorageObjectRepository(IDbConnectionFactory connectionFactory, ITransactionManager transactionManager)
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

    public async Task<Guid> CreateAsync(StorageObject storageObject, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.StorageObjects (
                    Id, OrganizationId, Provider, Container, ObjectKey, SizeBytes, ContentType, Status, CreatedAtUtc
                ) VALUES (
                    @id, @orgId, @provider, NULL, @objectKey, @sizeBytes, @contentType, @status, @createdAtUtc
                );
                """;

            if (storageObject.Id == Guid.Empty)
                storageObject.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", storageObject.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", storageObject.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@provider", storageObject.StorageProvider, DbType.AnsiString);
            DbHelper.AddParameter(cmd, "@objectKey", storageObject.StorageKey, DbType.String);
            DbHelper.AddParameter(cmd, "@sizeBytes", storageObject.SizeBytes, DbType.Int64);
            DbHelper.AddParameter(cmd, "@contentType", storageObject.ContentType, DbType.AnsiString);
            DbHelper.AddParameter(cmd, "@status", (byte)storageObject.Status, DbType.Byte);
            DbHelper.AddParameter(cmd, "@createdAtUtc", storageObject.CreatedAtUtc.UtcDateTime, DbType.DateTime2);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return storageObject.Id;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<StorageObject?> GetByIdAsync(Guid organizationId, Guid storageObjectId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT {Columns}
                FROM pdf.StorageObjects
                WHERE OrganizationId = @orgId AND Id = @id;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", storageObjectId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task MarkPendingDeleteAsync(Guid organizationId, Guid storageObjectId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.StorageObjects
                SET Status = 2
                WHERE OrganizationId = @orgId AND Id = @id AND Status = 1;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", storageObjectId, DbType.Guid);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<IReadOnlyList<StorageObject>> ListPendingDeleteAsync(int batchSize = 100, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT TOP (@batch) {Columns}
                FROM pdf.StorageObjects
                WHERE Status = 2
                ORDER BY CreatedAtUtc ASC;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@batch", batchSize, DbType.Int32);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<StorageObject>();
            while (await reader.ReadAsync(cancellationToken))
                list.Add(Map(reader));
            return list;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task DeletePermanentlyAsync(Guid storageObjectId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "DELETE FROM pdf.StorageObjects WHERE Id = @id AND Status = 2;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", storageObjectId, DbType.Guid);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    private static StorageObject Map(DbDataReader reader) => new()
    {
        Id = reader.GetGuid(reader.GetOrdinal("Id")),
        OrganizationId = reader.GetGuid(reader.GetOrdinal("OrganizationId")),
        StorageProvider = reader.GetString(reader.GetOrdinal("Provider")),
        StorageKey = reader.GetString(reader.GetOrdinal("ObjectKey")),
        SizeBytes = reader.GetInt64(reader.GetOrdinal("SizeBytes")),
        ContentType = reader.GetString(reader.GetOrdinal("ContentType")),
        Status = (StorageStatus)reader.GetSmall("Status"),
        CreatedAtUtc = reader.GetUtc("CreatedAtUtc")
    };
}
