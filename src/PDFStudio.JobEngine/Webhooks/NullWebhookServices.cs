using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;

namespace PDFStudio.JobEngine.Webhooks;

/// <summary>
/// Do-nothing webhook storage. It lets the Worker run when no database-backed webhook
/// repository is registered: jobs are processed normally and no webhook events are sent.
/// A real implementation registered earlier replaces these (they are added with TryAdd).
/// </summary>
public sealed class NullWebhookOutbox : IWebhookOutbox
{
    public Task EnqueueEventAsync(WebhookEvent evt, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public Task<IReadOnlyList<WebhookEvent>> ClaimDueEventsAsync(int batchSize = 50, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<WebhookEvent>>(Array.Empty<WebhookEvent>());

    public Task MarkDeliveredAsync(Guid eventId, int statusCode, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public Task MarkFailedAsync(Guid eventId, int statusCode, string error, DateTimeOffset? nextAttemptAtUtc, bool isDeadLetter, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}

public sealed class NullWebhookRepository : IWebhookRepository
{
    public Task<Webhook?> GetByIdAsync(Guid organizationId, Guid webhookId, CancellationToken cancellationToken = default) =>
        Task.FromResult<Webhook?>(null);

    public Task<IReadOnlyList<Webhook>> ListAsync(Guid organizationId, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<Webhook>>(Array.Empty<Webhook>());

    public Task<Guid> CreateAsync(Webhook webhook, CancellationToken cancellationToken = default) =>
        Task.FromResult(webhook.Id);

    public Task UpdateAsync(Webhook webhook, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;

    public Task DeleteAsync(Guid organizationId, Guid webhookId, CancellationToken cancellationToken = default) =>
        Task.CompletedTask;
}
