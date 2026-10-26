using System.Data.Common;
using Microsoft.Extensions.Configuration;
using Npgsql;
using PDFStudio.Application.Persistence;

namespace PDFStudio.Infrastructure.Persistence;

public sealed class PostgresDbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public PostgresDbConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("PostgreSql")
            ?? configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("PostgreSQL connection string is not configured.");
    }

    public PostgresDbConnectionFactory(string connectionString)
    {
        _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
    }

    public string ProviderName => "PostgreSql";

    public async Task<DbConnection> CreateConnectionAsync(CancellationToken cancellationToken = default)
    {
        var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}

