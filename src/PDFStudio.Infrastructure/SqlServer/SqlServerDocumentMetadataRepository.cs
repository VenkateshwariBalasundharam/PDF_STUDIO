using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.SqlServer;

public sealed class SqlServerDocumentMetadataRepository : IDocumentMetadataRepository
{
    public SqlServerDocumentMetadataRepository(IDbConnectionFactory connectionFactory, ITransactionManager transactionManager)
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

    public async Task<IReadOnlyDictionary<string, string>> GetMetadataAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT MetaKey, MetaValue
                FROM pdf.DocumentMetadata
                WHERE OrganizationId = @orgId AND DocumentId = @docId;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@docId", documentId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var dict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            while (await reader.ReadAsync(cancellationToken))
                dict[reader.GetString(0)] = reader.IsDBNull(1) ? string.Empty : reader.GetString(1);
            return dict;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task SetMetadataAsync(Guid organizationId, Guid documentId, IReadOnlyDictionary<string, string> metadata, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        DbTransaction? ownTx = null;
        try
        {
            // Replace-all must be atomic: join the ambient transaction, or open our own.
            var tx = _transactionManager.CurrentTransaction;
            if (tx is null)
            {
                ownTx = await conn.BeginTransactionAsync(cancellationToken);
                tx = ownTx;
            }

            const string deleteSql = "DELETE FROM pdf.DocumentMetadata WHERE OrganizationId = @orgId AND DocumentId = @docId;";
            await using (var delCmd = DbHelper.CreateCommand(conn, deleteSql, tx))
            {
                DbHelper.AddParameter(delCmd, "@orgId", organizationId, DbType.Guid);
                DbHelper.AddParameter(delCmd, "@docId", documentId, DbType.Guid);
                await delCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            const string insertSql = """
                INSERT INTO pdf.DocumentMetadata (OrganizationId, DocumentId, MetaKey, MetaValue)
                VALUES (@orgId, @docId, @key, @val);
                """;
            foreach (var kvp in metadata)
            {
                await using var insCmd = DbHelper.CreateCommand(conn, insertSql, tx);
                DbHelper.AddParameter(insCmd, "@orgId", organizationId, DbType.Guid);
                DbHelper.AddParameter(insCmd, "@docId", documentId, DbType.Guid);
                DbHelper.AddParameter(insCmd, "@key", kvp.Key, DbType.AnsiString);
                DbHelper.AddParameter(insCmd, "@val", kvp.Value, DbType.String);
                await insCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            if (ownTx is not null)
                await ownTx.CommitAsync(cancellationToken);
        }
        catch
        {
            if (ownTx is not null)
                await ownTx.RollbackAsync(CancellationToken.None);
            throw;
        }
        finally
        {
            if (ownTx is not null) await ownTx.DisposeAsync();
            if (dispose) await conn.DisposeAsync();
        }
    }
}
