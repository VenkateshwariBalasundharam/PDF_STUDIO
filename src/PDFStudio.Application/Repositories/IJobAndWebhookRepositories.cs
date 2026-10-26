using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Application.Repositories;

public interface IJobRepository
{
    Task<Guid> CreateAsync(PdfJob job, CancellationToken cancellationToken = default);
    Task<PdfJob?> GetByIdAsync(Guid organizationId, Guid jobId, CancellationToken cancellationToken = default);
    Task<PdfJob?> GetByNumberAsync(Guid organizationId, string jobNumber, CancellationToken cancellationToken = default);
    Task<PdfJob?> GetByIdempotencyKeyAsync(Guid organizationId, string idempotencyKey, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PdfJob>> ListAsync(Guid organizationId, JobStatus? status = null, int skip = 0, int take = 50, CancellationToken cancellationToken = default);
    Task<PdfJob?> ClaimNextAsync(string workerId, TimeSpan leaseDuration, CancellationToken cancellationToken = default);
    Task ExtendLeaseAsync(Guid jobId, string workerId, TimeSpan leaseDuration, CancellationToken cancellationToken = default);
    Task CompleteAsync(Guid jobId, string? resultJson, DateTimeOffset completedAtUtc, CancellationToken cancellationToken = default);
    Task FailAsync(Guid jobId, string errorMessage, int attemptCount, DateTimeOffset? nextRetryAtUtc, bool isFinal, CancellationToken cancellationToken = default);
    Task CancelAsync(Guid organizationId, Guid jobId, CancellationToken cancellationToken = default);
    Task<int> ReclaimExpiredLeasesAsync(CancellationToken cancellationToken = default);
}

public interface IJobItemRepository
{
    Task AddBatchAsync(IReadOnlyList<PdfJobItem> items, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PdfJobItem>> ListByJobAsync(Guid organizationId, Guid jobId, CancellationToken cancellationToken = default);
    Task UpdateStatusAsync(Guid organizationId, Guid itemId, JobStatus status, string? resultJson, string? errorMessage, CancellationToken cancellationToken = default);
}

public interface IWebhookRepository
{
    Task<Webhook?> GetByIdAsync(Guid organizationId, Guid webhookId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Webhook>> ListAsync(Guid organizationId, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(Webhook webhook, CancellationToken cancellationToken = default);
    Task UpdateAsync(Webhook webhook, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid organizationId, Guid webhookId, CancellationToken cancellationToken = default);
}

public interface IWebhookOutbox
{
    Task EnqueueEventAsync(WebhookEvent evt, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<WebhookEvent>> ClaimDueEventsAsync(int batchSize = 50, CancellationToken cancellationToken = default);
    Task MarkDeliveredAsync(Guid eventId, int statusCode, CancellationToken cancellationToken = default);
    Task MarkFailedAsync(Guid eventId, int statusCode, string error, DateTimeOffset? nextAttemptAtUtc, bool isDeadLetter, CancellationToken cancellationToken = default);
}

