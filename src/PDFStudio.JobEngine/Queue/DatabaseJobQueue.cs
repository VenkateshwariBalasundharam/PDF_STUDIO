using PDFStudio.Application.Engines;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.JobEngine.Queue;

public sealed class DatabaseJobQueue : IJobQueue
{
    private readonly IJobRepository _jobRepo;
    private readonly ISequenceService _seqService;

    public DatabaseJobQueue(
        IJobRepository jobRepo,
        ISequenceService seqService)
    {
        _jobRepo = jobRepo;
        _seqService = seqService;
    }

    public async Task<PdfJob> EnqueueAsync(
        Guid organizationId,
        JobType jobType,
        string payloadJson,
        int priority = 100,
        string? idempotencyKey = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!string.IsNullOrWhiteSpace(idempotencyKey))
        {
            var existing = await _jobRepo.GetByIdempotencyKeyAsync(organizationId, idempotencyKey, cancellationToken);
            if (existing != null)
            {
                return existing;
            }
        }

        var jobNumber = await _seqService.NextJobNumberAsync(organizationId, cancellationToken);
        var jobId = Guid.NewGuid();

        var job = new PdfJob
        {
            Id = jobId,
            OrganizationId = organizationId,
            JobNumber = jobNumber,
            JobType = jobType,
            Status = JobStatus.Queued,
            Priority = priority,
            IdempotencyKey = idempotencyKey,
            PayloadJson = payloadJson,
            AttemptCount = 0,
            MaxAttempts = 5,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

        await _jobRepo.CreateAsync(job, cancellationToken);
        return job;
    }

    public Task<PdfJob?> ClaimNextAsync(
        string workerId,
        TimeSpan leaseDuration,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _jobRepo.ClaimNextAsync(workerId, leaseDuration, cancellationToken);
    }

    public Task CompleteAsync(
        Guid jobId,
        string? resultJson,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return _jobRepo.CompleteAsync(jobId, resultJson, DateTimeOffset.UtcNow, cancellationToken);
    }

    public Task FailAsync(
        Guid jobId,
        string errorMessage,
        bool canRetry,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        // error_message column is varchar(1000)
        if (errorMessage.Length > 900)
        {
            errorMessage = errorMessage[..900];
        }

        var nextRetry = canRetry ? DateTimeOffset.UtcNow.AddSeconds(15) : (DateTimeOffset?)null;
        return _jobRepo.FailAsync(jobId, errorMessage, 1, nextRetry, isFinal: !canRetry, cancellationToken);
    }
}

