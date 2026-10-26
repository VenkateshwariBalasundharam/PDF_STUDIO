using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.Services;

public sealed class SequenceService : ISequenceService
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public SequenceService(
        IDbConnectionFactory connectionFactory,
        ITransactionManager transactionManager)
    {
        _connectionFactory = connectionFactory;
        _transactionManager = transactionManager;
    }

    public async Task<string> NextDocumentNumberAsync(Guid organizationId, CancellationToken cancellationToken = default)
    {
        long seq = await GetNextSequenceValueAsync("document_number_seq", "DocumentNumberSeq", cancellationToken);
        return $"DOC-{seq}";
    }

    public async Task<string> NextJobNumberAsync(Guid organizationId, CancellationToken cancellationToken = default)
    {
        long seq = await GetNextSequenceValueAsync("job_number_seq", "JobNumberSeq", cancellationToken);
        return $"JOB-{seq}";
    }

    private async Task<long> GetNextSequenceValueAsync(
        string pgSeqName,
        string sqlServerSeqName,
        CancellationToken cancellationToken)
    {
        DbConnection connection;
        DbTransaction? tx = _transactionManager.CurrentTransaction;

        if (tx is not null)
        {
            connection = tx.Connection!;
        }
        else
        {
            connection = await _connectionFactory.CreateConnectionAsync(cancellationToken);
        }

        try
        {
            string sql = _connectionFactory.ProviderName.Equals("PostgreSql", StringComparison.OrdinalIgnoreCase)
                ? $"SELECT nextval('pdf.{pgSeqName}');"
                : $"SELECT NEXT VALUE FOR pdf.{sqlServerSeqName};";

            await using var cmd = DbHelper.CreateCommand(connection, sql, tx);
            object? result = await cmd.ExecuteScalarAsync(cancellationToken);
            return Convert.ToInt64(result);
        }
        finally
        {
            if (tx is null)
            {
                await connection.DisposeAsync();
            }
        }
    }
}

