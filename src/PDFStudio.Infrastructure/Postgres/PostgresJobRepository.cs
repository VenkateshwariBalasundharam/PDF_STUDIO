using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.Postgres;

public sealed class PostgresJobRepository : IJobRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public PostgresJobRepository(
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

    public async Task<Guid> CreateAsync(PdfJob job, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                INSERT INTO pdf.pdf_jobs (
                    id, organization_id, public_id, job_type, status, priority, idempotency_key,
                    request_payload, result_json, error_message, attempt_count, max_attempts,
                    locked_until_utc, locked_by, completed_at_utc, queued_at_utc
                ) VALUES (
                    @id, @orgId, @pubId, @jobType, @status, @priority, @idemKey,
                    CAST(@payload AS jsonb), CAST(@result AS jsonb), @error, @attempts, @maxAttempts,
                    @lockedUntil, @lockedBy, @completed, @created
                );
                """;

            if (job.Id == Guid.Empty)
                job.Id = Guid.NewGuid();

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@id", job.Id, DbType.Guid);
            DbHelper.AddParameter(cmd, "@orgId", job.OrganizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@pubId", job.JobNumber, DbType.String);
            DbHelper.AddParameter(cmd, "@jobType", (short)job.JobType, DbType.Int16);
            DbHelper.AddParameter(cmd, "@status", (short)job.Status, DbType.Int16);
            DbHelper.AddParameter(cmd, "@priority", job.Priority, DbType.Int32);
            DbHelper.AddParameter(cmd, "@idemKey", job.IdempotencyKey, DbType.String);
            DbHelper.AddParameter(cmd, "@payload", job.PayloadJson, DbType.String);
            DbHelper.AddParameter(cmd, "@result", job.ResultJson, DbType.String);
            DbHelper.AddParameter(cmd, "@error", job.ErrorMessage, DbType.String);
            DbHelper.AddParameter(cmd, "@attempts", job.AttemptCount, DbType.Int32);
            DbHelper.AddParameter(cmd, "@maxAttempts", job.MaxAttempts, DbType.Int32);
            DbHelper.AddParameter(cmd, "@lockedUntil", job.LockedUntilUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@lockedBy", job.LockedByWorker, DbType.String);
            DbHelper.AddParameter(cmd, "@completed", job.CompletedAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@created", job.CreatedAtUtc, DbType.DateTimeOffset);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
            return job.Id;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<PdfJob?> GetByIdAsync(Guid organizationId, Guid jobId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, public_id, job_type, status, priority, idempotency_key,
                       request_payload, result_json, error_message, attempt_count, max_attempts,
                       locked_until_utc, locked_by, completed_at_utc, queued_at_utc
                FROM pdf.pdf_jobs
                WHERE organization_id = @orgId AND id = @id;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@id", jobId, DbType.Guid);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapJob(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<PdfJob?> GetByNumberAsync(Guid organizationId, string jobNumber, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, public_id, job_type, status, priority, idempotency_key,
                       request_payload, result_json, error_message, attempt_count, max_attempts,
                       locked_until_utc, locked_by, completed_at_utc, queued_at_utc
                FROM pdf.pdf_jobs
                WHERE organization_id = @orgId AND public_id = @jobNo;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@jobNo", jobNumber, DbType.String);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapJob(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<PdfJob?> GetByIdempotencyKeyAsync(Guid organizationId, string idempotencyKey, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                SELECT id, organization_id, public_id, job_type, status, priority, idempotency_key,
                       request_payload, result_json, error_message, attempt_count, max_attempts,
                       locked_until_utc, locked_by, completed_at_utc, queued_at_utc
                FROM pdf.pdf_jobs
                WHERE organization_id = @orgId AND idempotency_key = @key;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@key", idempotencyKey, DbType.String);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                return null;

            return MapJob(reader);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<IReadOnlyList<PdfJob>> ListAsync(Guid organizationId, JobStatus? status = null, int skip = 0, int take = 50, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            var sql = """
                SELECT id, organization_id, public_id, job_type, status, priority, idempotency_key,
                       request_payload, result_json, error_message, attempt_count, max_attempts,
                       locked_until_utc, locked_by, completed_at_utc, queued_at_utc
                FROM pdf.pdf_jobs
                WHERE organization_id = @orgId
                """;

            if (status.HasValue)
                sql += " AND status = @status";

            sql += " ORDER BY queued_at_utc DESC OFFSET @skip LIMIT @take;";

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@skip", skip, DbType.Int32);
            DbHelper.AddParameter(cmd, "@take", take, DbType.Int32);

            if (status.HasValue)
                DbHelper.AddParameter(cmd, "@status", (short)status.Value, DbType.Int16);

            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            var list = new List<PdfJob>();
            while (await reader.ReadAsync(cancellationToken))
            {
                list.Add(MapJob(reader));
            }
            return list;
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<PdfJob?> ClaimNextAsync(string workerId, TimeSpan leaseDuration, CancellationToken cancellationToken = default)
    {
        var conn = await _connectionFactory.CreateConnectionAsync(cancellationToken);
        try
        {
            await using var tx = await conn.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);

            const string selectSql = """
                SELECT id
                FROM pdf.pdf_jobs
                WHERE status = 1 AND (locked_until_utc IS NULL OR locked_until_utc < now())
                ORDER BY priority ASC, queued_at_utc ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED;
                """;

            await using var selectCmd = DbHelper.CreateCommand(conn, selectSql, tx);
            object? rawId = await selectCmd.ExecuteScalarAsync(cancellationToken);

            if (rawId is null or DBNull)
            {
                await tx.RollbackAsync(cancellationToken);
                return null;
            }

            var jobId = (Guid)rawId;
            var leaseUntil = DateTimeOffset.UtcNow.Add(leaseDuration);

            const string updateSql = """
                UPDATE pdf.pdf_jobs
                SET status = 2,
                    locked_by = @workerId,
                    locked_until_utc = @leaseUntil,
                    attempt_count = attempt_count + 1
                WHERE id = @jobId
                RETURNING id, organization_id, public_id, job_type, status, priority, idempotency_key,
                          request_payload, result_json, error_message, attempt_count, max_attempts,
                          locked_until_utc, locked_by, completed_at_utc, queued_at_utc;
                """;

            await using var updateCmd = DbHelper.CreateCommand(conn, updateSql, tx);
            DbHelper.AddParameter(updateCmd, "@workerId", workerId, DbType.String);
            DbHelper.AddParameter(updateCmd, "@leaseUntil", leaseUntil, DbType.DateTimeOffset);
            DbHelper.AddParameter(updateCmd, "@jobId", jobId, DbType.Guid);

            await using var reader = await updateCmd.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
            {
                await tx.RollbackAsync(cancellationToken);
                return null;
            }

            var claimedJob = MapJob(reader);
            await reader.CloseAsync();
            await tx.CommitAsync(cancellationToken);
            return claimedJob;
        }
        finally
        {
            await conn.DisposeAsync();
        }
    }

    public async Task ExtendLeaseAsync(Guid jobId, string workerId, TimeSpan leaseDuration, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.pdf_jobs
                SET locked_until_utc = now() + @leaseSec * interval '1 second'
                WHERE id = @jobId AND locked_by = @workerId AND status = 2;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@leaseSec", leaseDuration.TotalSeconds, DbType.Double);
            DbHelper.AddParameter(cmd, "@jobId", jobId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@workerId", workerId, DbType.String);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task CompleteAsync(Guid jobId, string? resultJson, DateTimeOffset completedAtUtc, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.pdf_jobs
                SET status = 3,
                    result_json = CAST(@result AS jsonb),
                    completed_at_utc = @completed,
                    locked_until_utc = NULL,
                    locked_by = NULL
                WHERE id = @jobId;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@result", resultJson, DbType.String);
            DbHelper.AddParameter(cmd, "@completed", completedAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@jobId", jobId, DbType.Guid);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task FailAsync(Guid jobId, string errorMessage, int attemptCount, DateTimeOffset? nextRetryAtUtc, bool isFinal, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.pdf_jobs
                SET status = CASE WHEN @isFinal THEN 4 ELSE 1 END,
                    error_message = @error,
                    locked_until_utc = @nextRetry,
                    locked_by = NULL,
                    completed_at_utc = CASE WHEN @isFinal THEN now() ELSE NULL END
                WHERE id = @jobId;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@isFinal", isFinal, DbType.Boolean);
            DbHelper.AddParameter(cmd, "@error", errorMessage, DbType.String);
            DbHelper.AddParameter(cmd, "@nextRetry", nextRetryAtUtc, DbType.DateTimeOffset);
            DbHelper.AddParameter(cmd, "@jobId", jobId, DbType.Guid);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task CancelAsync(Guid organizationId, Guid jobId, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.pdf_jobs
                SET status = 5,
                    completed_at_utc = now(),
                    locked_until_utc = NULL,
                    locked_by = NULL
                WHERE organization_id = @orgId AND id = @jobId AND status IN (1, 2);
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@orgId", organizationId, DbType.Guid);
            DbHelper.AddParameter(cmd, "@jobId", jobId, DbType.Guid);

            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    public async Task<int> ReclaimExpiredLeasesAsync(CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.pdf_jobs
                SET status = 1,
                    locked_by = NULL,
                    locked_until_utc = NULL
                WHERE status = 2 AND locked_until_utc < now();
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            return await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            if (dispose) await conn.DisposeAsync();
        }
    }

    private static PdfJob MapJob(DbDataReader reader)
    {
        return new PdfJob
        {
            Id = reader.GetGuid(reader.GetOrdinal("id")),
            OrganizationId = reader.GetGuid(reader.GetOrdinal("organization_id")),
            JobNumber = reader.GetString(reader.GetOrdinal("public_id")),
            JobType = (JobType)reader.GetInt16(reader.GetOrdinal("job_type")),
            Status = (JobStatus)reader.GetInt16(reader.GetOrdinal("status")),
            Priority = reader.GetInt32(reader.GetOrdinal("priority")),
            IdempotencyKey = reader.IsDBNull(reader.GetOrdinal("idempotency_key")) ? null : reader.GetString(reader.GetOrdinal("idempotency_key")),
            PayloadJson = reader.GetString(reader.GetOrdinal("request_payload")),
            ResultJson = reader.IsDBNull(reader.GetOrdinal("result_json")) ? null : reader.GetString(reader.GetOrdinal("result_json")),
            ErrorMessage = reader.IsDBNull(reader.GetOrdinal("error_message")) ? null : reader.GetString(reader.GetOrdinal("error_message")),
            AttemptCount = reader.GetInt32(reader.GetOrdinal("attempt_count")),
            MaxAttempts = reader.GetInt32(reader.GetOrdinal("max_attempts")),
            LockedUntilUtc = reader.IsDBNull(reader.GetOrdinal("locked_until_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("locked_until_utc")),
            LockedByWorker = reader.IsDBNull(reader.GetOrdinal("locked_by")) ? null : reader.GetString(reader.GetOrdinal("locked_by")),
            CompletedAtUtc = reader.IsDBNull(reader.GetOrdinal("completed_at_utc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("completed_at_utc")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("queued_at_utc"))
        };
    }
}

