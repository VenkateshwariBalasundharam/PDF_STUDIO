using System.Data.Common;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using PDFStudio.Application.Persistence;

namespace PDFStudio.Infrastructure.Persistence;

public sealed class SqlServerDbConnectionFactory : IDbConnectionFactory
{
    private readonly string _connectionString;

    public SqlServerDbConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("SqlServer")
            ?? configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException("SQL Server connection string is not configured.");
    }

    public SqlServerDbConnectionFactory(string connectionString)
    {
        _connectionString = connectionString ?? throw new ArgumentNullException(nameof(connectionString));
    }

    public string ProviderName => "SqlServer";

    public async Task<DbConnection> CreateConnectionAsync(CancellationToken cancellationToken = default)
    {
        var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }
}

