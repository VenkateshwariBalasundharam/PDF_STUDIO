using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;

namespace PDFStudio.Infrastructure.Persistence;

public sealed class DbTransactionManager : ITransactionManager
{
    private readonly IDbConnectionFactory _connectionFactory;
    private DbConnection? _activeConnection;
    private DbTransaction? _activeTransaction;
    private bool _disposed;

    public DbTransactionManager(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public DbTransaction? CurrentTransaction => _activeTransaction;

    public async Task<DbTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default)
    {
        if (_activeTransaction is not null)
            throw new InvalidOperationException("A transaction is already active in this scope.");

        _activeConnection = await _connectionFactory.CreateConnectionAsync(cancellationToken);
        _activeTransaction = await _activeConnection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        return _activeTransaction;
    }

    public async Task CommitAsync(CancellationToken cancellationToken = default)
    {
        if (_activeTransaction is null)
            throw new InvalidOperationException("No active transaction to commit.");

        try
        {
            await _activeTransaction.CommitAsync(cancellationToken);
        }
        finally
        {
            await CleanupAsync();
        }
    }

    public async Task RollbackAsync(CancellationToken cancellationToken = default)
    {
        if (_activeTransaction is null)
            return;

        try
        {
            await _activeTransaction.RollbackAsync(cancellationToken);
        }
        finally
        {
            await CleanupAsync();
        }
    }

    private async Task CleanupAsync()
    {
        if (_activeTransaction is not null)
        {
            await _activeTransaction.DisposeAsync();
            _activeTransaction = null;
        }

        if (_activeConnection is not null)
        {
            await _activeConnection.DisposeAsync();
            _activeConnection = null;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (!_disposed)
        {
            _disposed = true;
            await CleanupAsync();
        }
    }
}

public static class DbHelper
{
    public static DbCommand CreateCommand(
        DbConnection connection,
        string sql,
        DbTransaction? transaction = null,
        int? commandTimeoutSeconds = 30)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        if (transaction is not null)
            command.Transaction = transaction;

        if (commandTimeoutSeconds.HasValue)
            command.CommandTimeout = commandTimeoutSeconds.Value;

        return command;
    }

    public static void AddParameter(
        DbCommand command,
        string name,
        object? value,
        DbType? dbType = null)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value ?? DBNull.Value;
        if (dbType.HasValue)
            parameter.DbType = dbType.Value;

        command.Parameters.Add(parameter);
    }
}

