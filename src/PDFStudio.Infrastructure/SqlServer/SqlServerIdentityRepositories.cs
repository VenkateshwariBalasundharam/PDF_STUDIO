using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.SqlServer;

public sealed class SqlServerOrganizationRepository : IOrganizationRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public SqlServerOrganizationRepository(
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

    public async Task<Organization?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "SELECT Id, Code, Name, Status, CreatedAtUtc, UpdatedAtUtc FROM pdf.Organizations WHERE Id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", id, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapOrg(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Organization?> GetByCodeAsync(string code, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "SELECT Id, Code, Name, Status, CreatedAtUtc, UpdatedAtUtc FROM pdf.Organizations WHERE Code = @code;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@code", code, DbType.String);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapOrg(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<Organization>> ListAsync(CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "SELECT Id, Code, Name, Status, CreatedAtUtc, UpdatedAtUtc FROM pdf.Organizations ORDER BY Name ASC;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<Organization>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(MapOrg(reader));
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Guid> CreateAsync(Organization org, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.Organizations (Id, Code, Name, Status, CreatedAtUtc, UpdatedAtUtc)
                VALUES (@id, @code, @name, @status, @created, @updated);
                """;

            if (org.Id == Guid.Empty)
                org.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", org.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@code", org.Code, DbType.String);
            DbHelper.AddParameter(cmd, "@name", org.Name, DbType.String);
            DbHelper.AddParameter(cmd, "@status", (short)org.Status, DbType.Int16);
            DbHelper.AddParameter(cmd, "@created", org.CreatedAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@updated", org.UpdatedAtUtc ?? org.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return org.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task UpdateStatusAsync(Guid id, OrganizationStatus status, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.Organizations SET Status = @status, UpdatedAtUtc = SYSUTCDATETIME() WHERE Id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@status", (short)status, DbType.Int16);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    private static Organization MapOrg(DbDataReader reader)
    {
        return new Organization
        {
            Id = reader.GetGuid(reader.GetOrdinal("Id")),
            Code = reader.GetString(reader.GetOrdinal("Code")),
            Name = reader.GetString(reader.GetOrdinal("Name")),
            Status = (OrganizationStatus)reader.GetInt16(reader.GetOrdinal("Status")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAtUtc")),
            UpdatedAtUtc = reader.IsDBNull(reader.GetOrdinal("UpdatedAtUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("UpdatedAtUtc"))
        };
    }
}

public sealed class SqlServerApiKeyRepository : IApiKeyRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public SqlServerApiKeyRepository(
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

    public async Task<ApiKey?> FindByPrefixAsync(string keyPrefix, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT Id, OrganizationId, ApiClientId, KeyPrefix, CONVERT(varchar(64), KeyHash, 2) AS KeyHashHex,
                       Status, ExpiresAtUtc, LastUsedAtUtc, CreatedAtUtc
                FROM pdf.ApiKeys
                WHERE KeyPrefix = @prefix;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@prefix", keyPrefix, DbType.String);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return new ApiKey
            {
                Id = reader.GetGuid(reader.GetOrdinal("Id")),
                OrganizationId = reader.GetGuid(reader.GetOrdinal("OrganizationId")),
                ApiClientId = reader.GetGuid(reader.GetOrdinal("ApiClientId")),
                KeyPrefix = reader.GetString(reader.GetOrdinal("KeyPrefix")),
                KeyHash = reader.GetString(reader.GetOrdinal("KeyHashHex")),
                Status = (ApiKeyStatus)reader.GetInt16(reader.GetOrdinal("Status")),
                ExpiresAtUtc = reader.IsDBNull(reader.GetOrdinal("ExpiresAtUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("ExpiresAtUtc")),
                LastUsedAtUtc = reader.IsDBNull(reader.GetOrdinal("LastUsedAtUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("LastUsedAtUtc")),
                CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAtUtc"))
            };
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<ApiKey>> ListByClientAsync(Guid organizationId, Guid apiClientId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT Id, OrganizationId, ApiClientId, KeyPrefix, CONVERT(varchar(64), KeyHash, 2) AS KeyHashHex,
                       Status, ExpiresAtUtc, LastUsedAtUtc, CreatedAtUtc
                FROM pdf.ApiKeys
                WHERE OrganizationId = @orgId AND ApiClientId = @clientId
                ORDER BY CreatedAtUtc DESC;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@clientId", apiClientId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<ApiKey>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(new ApiKey
                {
                    Id = reader.GetGuid(reader.GetOrdinal("Id")),
                    OrganizationId = reader.GetGuid(reader.GetOrdinal("OrganizationId")),
                    ApiClientId = reader.GetGuid(reader.GetOrdinal("ApiClientId")),
                    KeyPrefix = reader.GetString(reader.GetOrdinal("KeyPrefix")),
                    KeyHash = reader.GetString(reader.GetOrdinal("KeyHashHex")),
                    Status = (ApiKeyStatus)reader.GetInt16(reader.GetOrdinal("Status")),
                    ExpiresAtUtc = reader.IsDBNull(reader.GetOrdinal("ExpiresAtUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("ExpiresAtUtc")),
                    LastUsedAtUtc = reader.IsDBNull(reader.GetOrdinal("LastUsedAtUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("LastUsedAtUtc")),
                    CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CreatedAtUtc"))
                });
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Guid> CreateAsync(ApiKey apiKey, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.ApiKeys (
                    Id, OrganizationId, ApiClientId, Name, KeyPrefix, KeyHash,
                    Status, ExpiresAtUtc, CreatedAtUtc
                ) VALUES (
                    @id, @orgId, @clientId, @name, @prefix, CONVERT(varbinary(64), @hashHex, 2),
                    @status, @exp, @created
                );
                """;

            if (apiKey.Id == Guid.Empty)
                apiKey.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", apiKey.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", apiKey.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@clientId", apiKey.ApiClientId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@name", $"Key-{apiKey.KeyPrefix}", DbType.String);
            DbHelper.AddParameter(cmd, "@prefix", apiKey.KeyPrefix, DbType.String);
            DbHelper.AddParameter(cmd, "@hashHex", apiKey.KeyHash, DbType.String);
            DbHelper.AddParameter(cmd, "@status", (short)apiKey.Status, DbType.Int16);
            DbHelper.AddParameter(cmd, "@exp", apiKey.ExpiresAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@created", apiKey.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return apiKey.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task RevokeAsync(Guid organizationId, Guid apiKeyId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.ApiKeys SET Status = 2, RevokedAtUtc = SYSUTCDATETIME() WHERE OrganizationId = @orgId AND Id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", apiKeyId, DbType.Guid);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task TouchLastUsedAsync(Guid apiKeyId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.ApiKeys SET LastUsedAtUtc = SYSUTCDATETIME() WHERE Id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", apiKeyId, DbType.Guid);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }
}

