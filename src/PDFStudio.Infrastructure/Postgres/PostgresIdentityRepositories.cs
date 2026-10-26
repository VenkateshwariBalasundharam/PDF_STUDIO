using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.Postgres;

public sealed class PostgresOrganizationRepository : IOrganizationRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresOrganizationRepository(
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
            const string sql = "SELECT id, code, name, status, created_at_utc, updated_at_utc FROM pdf.organizations WHERE id = @id;";
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
            const string sql = "SELECT id, code, name, status, created_at_utc, updated_at_utc FROM pdf.organizations WHERE code = @code;";
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
            const string sql = "SELECT id, code, name, status, created_at_utc, updated_at_utc FROM pdf.organizations ORDER BY name ASC;";
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
                INSERT INTO pdf.organizations (id, code, name, status, created_at_utc, updated_at_utc)
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
            const string sql = "UPDATE pdf.organizations SET status = @status, updated_at_utc = now() WHERE id = @id;";
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
            Id = reader.GetGuid(reader.GetOrdinal("id")),
            Code = reader.GetString(reader.GetOrdinal("code")),
            Name = reader.GetString(reader.GetOrdinal("name")),
            Status = (OrganizationStatus)reader.GetInt16(reader.GetOrdinal("status")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc")),
            UpdatedAtUtc = reader.IsDBNull(reader.GetOrdinal("updated_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("updated_at_utc"))
        };
    }
}

public sealed class PostgresApiKeyRepository : IApiKeyRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresApiKeyRepository(
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
                SELECT id, organization_id, api_client_id, key_prefix, encode(key_hash, 'hex') AS key_hash_hex,
                       status, expires_at_utc, last_used_at_utc, created_at_utc
                FROM pdf.api_keys
                WHERE key_prefix = @prefix;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@prefix", keyPrefix, DbType.String);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return new ApiKey
            {
                Id = reader.GetGuid(reader.GetOrdinal("id")),
                OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
                ApiClientId = reader.GetGuid(reader.GetOrdinal("api_client_id")),
                KeyPrefix = reader.GetString(reader.GetOrdinal("key_prefix")),
                KeyHash = reader.GetString(reader.GetOrdinal("key_hash_hex")),
                Status = (ApiKeyStatus)reader.GetInt16(reader.GetOrdinal("status")),
                ExpiresAtUtc = reader.IsDBNull(reader.GetOrdinal("expires_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("expires_at_utc")),
                LastUsedAtUtc = reader.IsDBNull(reader.GetOrdinal("last_used_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("last_used_at_utc")),
                CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc"))
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
                SELECT id, organization_id, api_client_id, key_prefix, encode(key_hash, 'hex') AS key_hash_hex,
                       status, expires_at_utc, last_used_at_utc, created_at_utc
                FROM pdf.api_keys
                WHERE organization_id = @orgId AND api_client_id = @clientId
                ORDER BY created_at_utc DESC;
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
                    Id = reader.GetGuid(reader.GetOrdinal("id")),
                    OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
                    ApiClientId = reader.GetGuid(reader.GetOrdinal("api_client_id")),
                    KeyPrefix = reader.GetString(reader.GetOrdinal("key_prefix")),
                    KeyHash = reader.GetString(reader.GetOrdinal("key_hash_hex")),
                    Status = (ApiKeyStatus)reader.GetInt16(reader.GetOrdinal("status")),
                    ExpiresAtUtc = reader.IsDBNull(reader.GetOrdinal("expires_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("expires_at_utc")),
                    LastUsedAtUtc = reader.IsDBNull(reader.GetOrdinal("last_used_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("last_used_at_utc")),
                    CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc"))
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
                INSERT INTO pdf.api_keys (
                    id, organization_id, api_client_id, name, key_prefix, key_hash,
                    status, expires_at_utc, created_at_utc
                ) VALUES (
                    @id, @orgId, @clientId, @name, @prefix, decode(@hashHex, 'hex'),
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
            const string sql = "UPDATE pdf.api_keys SET status = 2, revoked_at_utc = now() WHERE organization_id = @orgId AND id = @id;";
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
            const string sql = "UPDATE pdf.api_keys SET last_used_at_utc = now() WHERE id = @id;";
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

public sealed class PostgresApiClientRepository : IApiClientRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresApiClientRepository(
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

    public async Task<ApiClient?> GetByIdAsync(Guid organizationId, Guid clientId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, name, client_type, status, rate_limit_per_minute, created_at_utc
                FROM pdf.api_clients
                WHERE organization_id = @orgId AND id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", clientId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return new ApiClient
            {
                Id = reader.GetGuid(reader.GetOrdinal("id")),
                OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
                Name = reader.GetString(reader.GetOrdinal("name")),
                ClientType = (ClientType)reader.GetInt16(reader.GetOrdinal("client_type")),
                Status = (ApiClientStatus)reader.GetInt16(reader.GetOrdinal("status")),
                RateLimitPerMinute = reader.GetInt32(reader.GetOrdinal("rate_limit_per_minute")),
                CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc"))
            };
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<ApiClient>> ListAsync(Guid organizationId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, name, client_type, status, rate_limit_per_minute, created_at_utc
                FROM pdf.api_clients
                WHERE organization_id = @orgId
                ORDER BY name ASC;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<ApiClient>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(new ApiClient
                {
                    Id = reader.GetGuid(reader.GetOrdinal("id")),
                    OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
                    Name = reader.GetString(reader.GetOrdinal("name")),
                    ClientType = (ClientType)reader.GetInt16(reader.GetOrdinal("client_type")),
                    Status = (ApiClientStatus)reader.GetInt16(reader.GetOrdinal("status")),
                    RateLimitPerMinute = reader.GetInt32(reader.GetOrdinal("rate_limit_per_minute")),
                    CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("created_at_utc"))
                });
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<Guid> CreateAsync(ApiClient client, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.api_clients (id, organization_id, name, client_type, status, rate_limit_per_minute, created_at_utc)
                VALUES (@id, @orgId, @name, @type, @status, @rateLimit, @created);
                """;

            if (client.Id == Guid.Empty)
                client.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", client.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", client.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@name", client.Name, DbType.String);
            DbHelper.AddParameter(cmd, "@type", (short)client.ClientType, DbType.Int16);
            DbHelper.AddParameter(cmd, "@status", (short)client.Status, DbType.Int16);
            DbHelper.AddParameter(cmd, "@rateLimit", client.RateLimitPerMinute, DbType.Int32);
            DbHelper.AddParameter(cmd, "@created", client.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return client.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task UpdateStatusAsync(Guid organizationId, Guid clientId, ApiClientStatus status, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = "UPDATE pdf.api_clients SET status = @status WHERE organization_id = @orgId AND id = @id;";
            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", clientId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@status", (short)status, DbType.Int16);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<string>> GetScopesAsync(Guid organizationId, Guid clientId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT s.code
                FROM pdf.api_client_scopes cs
                INNER JOIN pdf.api_scopes s ON cs.api_scope_id = s.id
                WHERE cs.organization_id = @orgId AND cs.api_client_id = @clientId;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@clientId", clientId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<string>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(reader.GetString(0));
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task SetScopesAsync(Guid organizationId, Guid clientId, IReadOnlyList<string> scopes, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string deleteSql = "DELETE FROM pdf.api_client_scopes WHERE organization_id = @orgId AND api_client_id = @clientId;";
            await using var delCmd = DbHelper.CreateCommand(conn, deleteSql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(delCmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(delCmd, "@clientId", clientId, DbType.Guid);
            await delCmd.ExecuteNonQueryAsync(cancellationToken);

            foreach (var scope in scopes)
            {
                const string insertSql = """
                    INSERT INTO pdf.api_client_scopes (organization_id, api_client_id, api_scope_id)
                    SELECT @orgId, @clientId, id FROM pdf.api_scopes WHERE code = @scope;
                    """;
                await using var insCmd = DbHelper.CreateCommand(conn, insertSql, _transactionManager.CurrentTransaction);
                DbHelper.AddParameter(insCmd, "@orgId", organizationId, DbType.Guid);
                DbHelper.AddParameter(insCmd, "@clientId", clientId, DbType.Guid);
                DbHelper.AddParameter(insCmd, "@scope", scope, DbType.String);
                await insCmd.ExecuteNonQueryAsync(cancellationToken);
            }
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }
}

