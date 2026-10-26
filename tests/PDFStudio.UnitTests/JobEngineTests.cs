using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using PDFStudio.Application.Engines;
using PDFStudio.Application.Repositories;
using PDFStudio.DocumentEngine.Services;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.JobEngine.Queue;
using PDFStudio.JobEngine.Workers;

namespace PDFStudio.UnitTests;

public class JobEngineTests
{
    private class MockJobRepository : IJobRepository
    {
        private readonly List<PdfJob> _jobs = new();

        public Task<Guid> CreateAsync(PdfJob job, CancellationToken cancellationToken = default)
        {
            _jobs.Add(job);
            return Task.FromResult(job.Id);
        }

        public Task<PdfJob?> GetByIdAsync(Guid organizationId, Guid jobId, CancellationToken cancellationToken = default) =>
            Task.FromResult(_jobs.FirstOrDefault(j => j.OrganizationId == organizationId && j.Id == jobId));

        public Task<PdfJob?> GetByNumberAsync(Guid organizationId, string jobNumber, CancellationToken cancellationToken = default) =>
            Task.FromResult(_jobs.FirstOrDefault(j => j.OrganizationId == organizationId && j.JobNumber == jobNumber));

        public Task<PdfJob?> GetByIdempotencyKeyAsync(Guid organizationId, string idempotencyKey, CancellationToken cancellationToken = default) =>
            Task.FromResult(_jobs.FirstOrDefault(j => j.OrganizationId == organizationId && j.IdempotencyKey == idempotencyKey));

        public Task<IReadOnlyList<PdfJob>> ListAsync(Guid organizationId, JobStatus? status = null, int skip = 0, int take = 50, CancellationToken cancellationToken = default) =>
            Task.FromResult<IReadOnlyList<PdfJob>>(_jobs.Where(j => j.OrganizationId == organizationId && (!status.HasValue || j.Status == status.Value)).ToList());

        public Task<PdfJob?> ClaimNextAsync(string workerId, TimeSpan leaseDuration, CancellationToken cancellationToken = default)
        {
            var job = _jobs.FirstOrDefault(j => j.Status == JobStatus.Queued);
            if (job != null)
            {
                job.Status = JobStatus.Processing;
                job.LockedByWorker = workerId;
                job.LockedUntilUtc = DateTimeOffset.UtcNow.Add(leaseDuration);
            }
            return Task.FromResult(job);
        }

        public Task ExtendLeaseAsync(Guid jobId, string workerId, TimeSpan leaseDuration, CancellationToken cancellationToken = default) => Task.CompletedTask;

        public Task CompleteAsync(Guid jobId, string? resultJson, DateTimeOffset completedAtUtc, CancellationToken cancellationToken = default)
        {
            var job = _jobs.FirstOrDefault(j => j.Id == jobId);
            if (job != null)
            {
                job.Status = JobStatus.Completed;
                job.ResultJson = resultJson;
                job.CompletedAtUtc = completedAtUtc;
            }
            return Task.CompletedTask;
        }

        public Task FailAsync(Guid jobId, string errorMessage, int attemptCount, DateTimeOffset? nextRetryAtUtc, bool isFinal, CancellationToken cancellationToken = default)
        {
            var job = _jobs.FirstOrDefault(j => j.Id == jobId);
            if (job != null)
            {
                job.Status = isFinal ? JobStatus.Failed : JobStatus.Queued;
                job.ErrorMessage = errorMessage;
            }
            return Task.CompletedTask;
        }

        public Task CancelAsync(Guid organizationId, Guid jobId, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<int> ReclaimExpiredLeasesAsync(CancellationToken cancellationToken = default) => Task.FromResult(0);
    }

    private class MockSequenceService : ISequenceService
    {
        private int _jobSeq = 1000;
        private int _docSeq = 1000;
        public Task<string> NextDocumentNumberAsync(Guid organizationId, CancellationToken cancellationToken = default) =>
            Task.FromResult($"DOC-{++_docSeq}");
        public Task<string> NextJobNumberAsync(Guid organizationId, CancellationToken cancellationToken = default) =>
            Task.FromResult($"JOB-{++_jobSeq}");
    }

    [Fact]
    public async Task EnqueueAndClaim_TransitionsJobToProcessing()
    {
        var jobRepo = new MockJobRepository();
        var seqService = new MockSequenceService();
        var queue = new DatabaseJobQueue(jobRepo, seqService);

        var orgId = Guid.NewGuid();
        var enqueued = await queue.EnqueueAsync(
            organizationId: orgId,
            jobType: JobType.Generate,
            payloadJson: JsonSerializer.Serialize(new { templateId = "invoice-default" }));

        Assert.NotNull(enqueued);
        Assert.Equal(JobStatus.Queued, enqueued.Status);

        var claimed = await queue.ClaimNextAsync("worker-1", TimeSpan.FromMinutes(2));

        Assert.NotNull(claimed);
        Assert.Equal(enqueued.Id, claimed.Id);
        Assert.Equal(JobStatus.Processing, claimed.Status);
    }

    [Fact]
    public async Task Enqueue_WithSameIdempotencyKey_ReturnsExistingJob()
    {
        var jobRepo = new MockJobRepository();
        var seqService = new MockSequenceService();
        var queue = new DatabaseJobQueue(jobRepo, seqService);

        var orgId = Guid.NewGuid();
        var job1 = await queue.EnqueueAsync(orgId, JobType.Generate, "{}", idempotencyKey: "unique-key-1");
        var job2 = await queue.EnqueueAsync(orgId, JobType.Generate, "{}", idempotencyKey: "unique-key-1");

        Assert.Equal(job1.Id, job2.Id);
        Assert.Equal(job1.JobNumber, job2.JobNumber);
    }
}

