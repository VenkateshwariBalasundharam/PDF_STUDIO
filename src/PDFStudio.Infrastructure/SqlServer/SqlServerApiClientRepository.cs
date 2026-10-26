using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.SqlServer;

public sealed class SqlServerApiClientRepository : IApiClientRepository
{
    private const string Columns = "Id, OrganizationId, Name, ClientType, Status, RateLimitPerMinute, CreatedAtUtc";

    public SqlServerApiClientRepository(IDbConnectionFactory connectionFactory, ITransactionManager transactionManager)
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

    public async Task<ApiClient?> GetByIdAsync(Guid organizationId, Guid clientId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT {Columns}
                FROM pdf.ApiClients
                WHERE OrganizationId = @orgId AND Id = @id;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", clientId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken) ? Map(reader) : null;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<IReadOnlyList<ApiClient>> ListAsync(Guid organizationId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = $"""
                SELECT {Columns}
                FROM pdf.ApiClients
                WHERE OrganizationId = @orgId
                ORDER BY Name ASC;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<ApiClient>();
            while (await reader.ReadAsync(cancellationToken))
                list.Add(Map(reader));
            return list;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<Guid> CreateAsync(ApiClient client, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.ApiClients (Id, OrganizationId, Name, ClientType, Status, RateLimitPerMinute, CreatedAtUtc)
                VALUES (@id, @orgId, @name, @type, @status, @rateLimit, @created);
                """;

            if (client.Id == Guid.Empty)
                client.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", client.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", client.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@name", client.Name, DbType.String);
            DbHelper.AddParameter(cmd, "@type", (byte)client.ClientType, DbType.Byte);
            DbHelper.AddParameter(cmd, "@status", (byte)client.Status, DbType.Byte);
            DbHelper.AddParameter(cmd, "@rateLimit", client.RateLimitPerMinute, DbType.Int32);
            DbHelper.AddParameter(cmd, "@created", client.CreatedAtUtc.UtcDateTime, DbType.DateTime2);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return client.Id;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task UpdateStatusAsync(Guid organizationId, Guid clientId, ApiClientStatus status, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.ApiClients SET Status = @status, UpdatedAtUtc = SYSUTCDATETIME() WHERE OrganizationId = @orgId AND Id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", clientId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@status", (byte)status, DbType.Byte);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task<IReadOnlyList<string>> GetScopesAsync(Guid organizationId, Guid clientId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT s.Code
                FROM pdf.ApiClientScopes cs
                INNER JOIN pdf.ApiScopes s ON cs.ApiScopeId = s.Id
                WHERE cs.OrganizationId = @orgId AND cs.ApiClientId = @clientId;
                """;
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@clientId", clientId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<string>();
            while (await reader.ReadAsync(cancellationToken))
                list.Add(reader.GetString(0));
            return list;
        }
        finally { if (dispose) await conn.DisposeAsync(); }
    }

    public async Task SetScopesAsync(Guid organizationId, Guid clientId, IReadOnlyList<string> scopes, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        DbTransaction? ownTx = null;
        try
        {
            var tx = _transactionManager.CurrentTransaction;
            if (tx is null)
            {
                ownTx = await conn.BeginTransactionAsync(cancellationToken);
                tx = ownTx;
            }

            const string deleteSql = "DELETE FROM pdf.ApiClientScopes WHERE OrganizationId = @orgId AND ApiClientId = @clientId;";
            await using (var delCmd = DbHelper.CreateCommand(conn, deleteSql, tx))
            {
                DbHelper.AddParameter(delCmd, "@orgId", organizationId, DbType.Guid);
                DbHelper.AddParameter(delCmd, "@clientId", clientId, DbType.Guid);
                await delCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            const string insertSql = """
                INSERT INTO pdf.ApiClientScopes (OrganizationId, ApiClientId, ApiScopeId)
                SELECT @orgId, @clientId, Id FROM pdf.ApiScopes WHERE Code = @scope;
                """;
            foreach (var scope in scopes)
            {
                await using var insCmd = DbHelper.CreateCommand(conn, insertSql, tx);
                DbHelper.AddParameter(insCmd, "@orgId", organizationId, DbType.Guid);
                DbHelper.AddParameter(insCmd, "@clientId", clientId, DbType.Guid);
                DbHelper.AddParameter(insCmd, "@scope", scope, DbType.AnsiString);
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

    private static ApiClient Map(DbDataReader reader) => new()
    {
        Id = reader.GetGuid(reader.GetOrdinal("Id")),
        OrganizationId = reader.GetGuid(reader.GetOrdinal("OrganizationId")),
        Name = reader.GetString(reader.GetOrdinal("Name")),
        ClientType = (ClientType)reader.GetSmall("ClientType"),
        Status = (ApiClientStatus)reader.GetSmall("Status"),
        RateLimitPerMinute = reader.GetInt32(reader.GetOrdinal("RateLimitPerMinute")),
        CreatedAtUtc = reader.GetUtc("CreatedAtUtc")
    };
}
