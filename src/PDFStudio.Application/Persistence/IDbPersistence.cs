using System.Data.Common;

namespace PDFStudio.Application.Persistence;

public interface IDbConnectionFactory
{
    string ProviderName { get; }
    Task<DbConnection> CreateConnectionAsync(CancellationToken cancellationToken = default);
}

public interface ITransactionManager : IAsyncDisposable
{
    DbTransaction? CurrentTransaction { get; }
    Task<DbTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default);
    Task CommitAsync(CancellationToken cancellationToken = default);
    Task RollbackAsync(CancellationToken cancellationToken = default);
}

