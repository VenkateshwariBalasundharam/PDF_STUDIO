using System.Data;
using System.Data.Common;
using PDFStudio.Application.Persistence;

namespace PDFStudio.JobEngine.Queue;

public interface IJobMaintenanceService
{
    /// <summary>Deletes jobs that are finished (completed, failed, cancelled, expired). Returns how many were removed.</summary>
    Task<int> ClearFinishedAsync(Guid organizationId, CancellationToken ct = default);

    /// <summary>Deletes every job of the tenant, including queued and stuck processing ones. Returns how many were removed.</summary>
    Task<int> ClearAllAsync(Guid organizationId, CancellationToken ct = default);
}

public sealed class JobMaintenanceService : IJobMaintenanceService
{
    private readonly IDbConnectionFactory _connectionFactory;

    public JobMaintenanceService(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public Task<int> ClearFinishedAsync(Guid organizationId, CancellationToken ct = default) =>
        // status: 3 Completed, 4 Failed, 5 Cancelled, 6 Expired (queued and processing jobs are kept)
        DeleteAsync("DELETE FROM pdf.pdf_jobs WHERE organization_id = @orgId AND status IN (3, 4, 5, 6);", organizationId, ct);

    public Task<int> ClearAllAsync(Guid organizationId, CancellationToken ct = default) =>
        DeleteAsync("DELETE FROM pdf.pdf_jobs WHERE organization_id = @orgId;", organizationId, ct);

    private async Task<int> DeleteAsync(string sql, Guid organizationId, CancellationToken ct)
    {

        await using var conn = await _connectionFactory.CreateConnectionAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;

        DbParameter p = cmd.CreateParameter();
        p.ParameterName = "@orgId";
        p.Value = organizationId;
        p.DbType = DbType.Guid;
        cmd.Parameters.Add(p);

        return await cmd.ExecuteNonQueryAsync(ct);
    }
}
