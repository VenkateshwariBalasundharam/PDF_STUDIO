using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure.Persistence;

namespace PDFStudio.Infrastructure.SqlServer;

public sealed class SqlServerJobRepository : IJobRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ITransactionManager _transactionManager;

    public SqlServerJobRepository(
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
                INSERT INTO pdf.PdfJobs (
                    Id, OrganizationId, PublicId, JobType, Status, Priority, IdempotencyKey,
                    RequestPayload, ResultJson, ErrorMessage, AttemptCount, MaxAttempts,
                    LockedUntilUtc, LockedBy, CompletedAtUtc, QueuedAtUtc
                ) VALUES (
                    @id, @orgId, @pubId, @jobType, @status, @priority, @idemKey,
                    @payload, @result, @error, @attempts, @maxAttempts,
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
                SELECT Id, OrganizationId, PublicId, JobType, Status, Priority, IdempotencyKey,
                       RequestPayload, ResultJson, ErrorMessage, AttemptCount, MaxAttempts,
                       LockedUntilUtc, LockedBy, CompletedAtUtc, QueuedAtUtc
                FROM pdf.PdfJobs
                WHERE OrganizationId = @orgId AND Id = @id;
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
                SELECT Id, OrganizationId, PublicId, JobType, Status, Priority, IdempotencyKey,
                       RequestPayload, ResultJson, ErrorMessage, AttemptCount, MaxAttempts,
                       LockedUntilUtc, LockedBy, CompletedAtUtc, QueuedAtUtc
                FROM pdf.PdfJobs
                WHERE OrganizationId = @orgId AND PublicId = @jobNo;
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
                SELECT Id, OrganizationId, PublicId, JobType, Status, Priority, IdempotencyKey,
                       RequestPayload, ResultJson, ErrorMessage, AttemptCount, MaxAttempts,
                       LockedUntilUtc, LockedBy, CompletedAtUtc, QueuedAtUtc
                FROM pdf.PdfJobs
                WHERE OrganizationId = @orgId AND IdempotencyKey = @key;
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
                SELECT Id, OrganizationId, PublicId, JobType, Status, Priority, IdempotencyKey,
                       RequestPayload, ResultJson, ErrorMessage, AttemptCount, MaxAttempts,
                       LockedUntilUtc, LockedBy, CompletedAtUtc, QueuedAtUtc
                FROM pdf.PdfJobs
                WHERE OrganizationId = @orgId
                """;

            if (status.HasValue)
                sql += " AND Status = @status";

            sql += " ORDER BY CreatedAtUtc DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;";

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
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            var leaseUntil = DateTimeOffset.UtcNow.Add(leaseDuration);

            const string sql = """
                WITH cte AS (
                    SELECT TOP(1) *
                    FROM pdf.PdfJobs WITH (UPDLOCK, READPAST, ROWLOCK)
                    WHERE Status = 1 AND (LockedUntilUtc IS NULL OR LockedUntilUtc < SYSUTCDATETIME())
                    ORDER BY Priority ASC, QueuedAtUtc ASC
                )
                UPDATE cte
                SET Status = 2,
                    LockedBy = @workerId,
                    LockedUntilUtc = @leaseUntil,
                    AttemptCount = AttemptCount + 1
                OUTPUT inserted.Id, inserted.OrganizationId, inserted.PublicId, inserted.JobType,
                       inserted.Status, inserted.Priority, inserted.IdempotencyKey,
                       inserted.RequestPayload, inserted.ResultJson, inserted.ErrorMessage,
                       inserted.AttemptCount, inserted.MaxAttempts, inserted.LockedUntilUtc,
                       inserted.LockedBy, inserted.CompletedAtUtc, inserted.QueuedAtUtc;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@workerId", workerId, DbType.String);
            DbHelper.AddParameter(cmd, "@leaseUntil", leaseUntil, DbType.DateTimeOffset);

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

    public async Task ExtendLeaseAsync(Guid jobId, string workerId, TimeSpan leaseDuration, CancellationToken cancellationToken = default)
    {
        var (conn, dispose) = await GetConnectionAsync(cancellationToken);
        try
        {
            const string sql = """
                UPDATE pdf.PdfJobs
                SET LockedUntilUtc = DATEADD(second, @leaseSec, SYSUTCDATETIME())
                WHERE Id = @jobId AND LockedBy = @workerId AND Status = 2;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@leaseSec", (int)leaseDuration.TotalSeconds, DbType.Int32);
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
                UPDATE pdf.PdfJobs
                SET Status = 3,
                    ResultJson = @result,
                    CompletedAtUtc = @completed,
                    LockedUntilUtc = NULL,
                    LockedBy = NULL
                WHERE Id = @jobId;
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
                UPDATE pdf.PdfJobs
                SET Status = CASE WHEN @isFinal = 1 THEN 4 ELSE 1 END,
                    ErrorMessage = @error,
                    LockedUntilUtc = @nextRetry,
                    LockedBy = NULL,
                    CompletedAtUtc = CASE WHEN @isFinal = 1 THEN SYSUTCDATETIME() ELSE NULL END
                WHERE Id = @jobId;
                """;

            await using var cmd = DbHelper.CreateCommand(conn, sql, _transactionManager.CurrentTransaction);
            DbHelper.AddParameter(cmd, "@isFinal", isFinal ? 1 : 0, DbType.Int32);
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
                UPDATE pdf.PdfJobs
                SET Status = 5,
                    CompletedAtUtc = SYSUTCDATETIME(),
                    LockedUntilUtc = NULL,
                    LockedBy = NULL
                WHERE OrganizationId = @orgId AND Id = @jobId AND Status IN (1, 2);
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
                UPDATE pdf.PdfJobs
                SET Status = 1,
                    LockedBy = NULL,
                    LockedUntilUtc = NULL
                WHERE Status = 2 AND LockedUntilUtc < SYSUTCDATETIME();
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
            Id = reader.GetGuid(reader.GetOrdinal("Id")),
            OrganizationId = reader.GetGuid(reader.GetOrdinal("OrganizationId")),
            JobNumber = reader.GetString(reader.GetOrdinal("PublicId")),
            JobType = (JobType)reader.GetInt16(reader.GetOrdinal("JobType")),
            Status = (JobStatus)reader.GetInt16(reader.GetOrdinal("Status")),
            Priority = reader.GetInt32(reader.GetOrdinal("Priority")),
            IdempotencyKey = reader.IsDBNull(reader.GetOrdinal("IdempotencyKey")) ? null : reader.GetString(reader.GetOrdinal("IdempotencyKey")),
            PayloadJson = reader.GetString(reader.GetOrdinal("RequestPayload")),
            ResultJson = reader.IsDBNull(reader.GetOrdinal("ResultJson")) ? null : reader.GetString(reader.GetOrdinal("ResultJson")),
            ErrorMessage = reader.IsDBNull(reader.GetOrdinal("ErrorMessage")) ? null : reader.GetString(reader.GetOrdinal("ErrorMessage")),
            AttemptCount = reader.GetInt32(reader.GetOrdinal("AttemptCount")),
            MaxAttempts = reader.GetInt32(reader.GetOrdinal("MaxAttempts")),
            LockedUntilUtc = reader.IsDBNull(reader.GetOrdinal("LockedUntilUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("LockedUntilUtc")),
            LockedByWorker = reader.IsDBNull(reader.GetOrdinal("LockedBy")) ? null : reader.GetString(reader.GetOrdinal("LockedBy")),
            CompletedAtUtc = reader.IsDBNull(reader.GetOrdinal("CompletedAtUtc")) ? null : reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("CompletedAtUtc")),
            CreatedAtUtc = reader.GetFieldValue<DateTimeOffset>(reader.GetOrdinal("QueuedAtUtc"))
        };
    }
}

