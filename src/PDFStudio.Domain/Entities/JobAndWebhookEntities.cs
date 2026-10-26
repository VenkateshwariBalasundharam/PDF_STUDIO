using PDFStudio.Domain.Common;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Domain.Entities;

public sealed class PdfJob : TenantEntity
{
    public string JobNumber { get; set; } = string.Empty;
    public JobType JobType { get; set; } = JobType.Generate;
    public JobStatus Status { get; set; } = JobStatus.Queued;
    public int Priority { get; set; } = 100;
    public string? IdempotencyKey { get; set; }
    public string PayloadJson { get; set; } = string.Empty;
    public string? ResultJson { get; set; }
    public string? ErrorMessage { get; set; }
    public int AttemptCount { get; set; }
    public int MaxAttempts { get; set; } = 5;
    public DateTimeOffset? LockedUntilUtc { get; set; }
    public string? LockedByWorker { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }

    public bool IsTerminal => Status is JobStatus.Completed or JobStatus.Failed or JobStatus.Cancelled or JobStatus.Expired;

    public void MarkProcessing(string workerId, DateTimeOffset leaseExpiration)
    {
        if (Status != JobStatus.Queued && Status != JobStatus.Processing)
            throw new InvalidOperationException($"Cannot transition to Processing from status {Status}.");

        Status = JobStatus.Processing;
        LockedByWorker = workerId;
        LockedUntilUtc = leaseExpiration;
        AttemptCount++;
    }

    public void MarkCompleted(string? resultJson, DateTimeOffset completedAt)
    {
        Status = JobStatus.Completed;
        ResultJson = resultJson;
        CompletedAtUtc = completedAt;
        LockedUntilUtc = null;
        LockedByWorker = null;
    }

    public void MarkFailed(string errorMessage, bool canRetry, DateTimeOffset? nextRetryAt = null)
    {
        ErrorMessage = errorMessage;
        LockedUntilUtc = nextRetryAt;
        LockedByWorker = null;

        if (!canRetry || AttemptCount >= MaxAttempts)
        {
            Status = JobStatus.Failed;
            CompletedAtUtc = DateTimeOffset.UtcNow;
        }
        else
        {
            Status = JobStatus.Queued; // Return to queue for next attempt
        }
    }

    public void Cancel()
    {
        if (IsTerminal)
            throw new InvalidOperationException($"Cannot cancel a job that is already in terminal state {Status}.");

        Status = JobStatus.Cancelled;
        CompletedAtUtc = DateTimeOffset.UtcNow;
        LockedUntilUtc = null;
        LockedByWorker = null;
    }
}

public sealed class PdfJobItem : TenantEntity
{
    public Guid JobId { get; set; }
    public int ItemIndex { get; set; }
    public JobStatus Status { get; set; } = JobStatus.Queued;
    public string? ItemPayloadJson { get; set; }
    public string? ResultJson { get; set; }
    public string? ErrorMessage { get; set; }
}

public sealed class Webhook : TenantEntity
{
    public string Url { get; set; } = string.Empty;
    public string SecretKeyEncrypted { get; set; } = string.Empty;
    public string EventsJson { get; set; } = "[]";
    public bool IsActive { get; set; } = true;
}

public sealed class WebhookEvent : TenantEntity
{
    public Guid WebhookId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = string.Empty;
    public WebhookEventStatus Status { get; set; } = WebhookEventStatus.Pending;
    public int AttemptCount { get; set; }
    public DateTimeOffset? NextAttemptAtUtc { get; set; }
    public int? LastResponseStatusCode { get; set; }
    public string? LastError { get; set; }
}

