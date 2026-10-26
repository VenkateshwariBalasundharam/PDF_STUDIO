using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;

namespace PDFStudio.JobEngine.Webhooks;

public interface IWebhookDispatcher
{
    Task DispatchPendingWebhooksAsync(CancellationToken cancellationToken = default);
}

public sealed class WebhookDispatcher : IWebhookDispatcher
{
    private readonly IWebhookOutbox _outbox;
    private readonly IWebhookRepository _webhookRepo;
    private readonly HttpClient _httpClient;
    private readonly ILogger<WebhookDispatcher> _logger;

    public WebhookDispatcher(
        IWebhookOutbox _outbox,
        IWebhookRepository webhookRepo,
        HttpClient httpClient,
        ILogger<WebhookDispatcher> logger)
    {
        this._outbox = _outbox;
        _webhookRepo = webhookRepo;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task DispatchPendingWebhooksAsync(CancellationToken cancellationToken = default)
    {
        var events = await _outbox.ClaimDueEventsAsync(batchSize: 25, cancellationToken);
        if (events == null || events.Count == 0)
        {
            return;
        }

        foreach (var evt in events)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var webhook = await _webhookRepo.GetByIdAsync(evt.OrganizationId, evt.WebhookId, cancellationToken);
                if (webhook == null || !webhook.IsActive)
                {
                    await _outbox.MarkFailedAsync(evt.Id, 410, "Webhook endpoint is disabled or removed.", null, isDeadLetter: true, cancellationToken);
                    continue;
                }

                // SSRF check: ensure URL is HTTPS
                if (!Uri.TryCreate(webhook.Url, UriKind.Absolute, out var targetUri) || targetUri.Scheme != Uri.UriSchemeHttps)
                {
                    await _outbox.MarkFailedAsync(evt.Id, 400, "Webhook target URL must be valid HTTPS.", null, isDeadLetter: true, cancellationToken);
                    continue;
                }

                // Calculate HMAC-SHA256 signature
                var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
                var signaturePayload = $"{timestamp}.{evt.PayloadJson}";
                using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(webhook.SecretKeyEncrypted));
                var signatureHex = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(signaturePayload))).ToLowerInvariant();

                using var request = new HttpRequestMessage(HttpMethod.Post, webhook.Url)
                {
                    Content = new StringContent(evt.PayloadJson, Encoding.UTF8, "application/json")
                };
                request.Headers.Add("X-PDFStudio-Timestamp", timestamp);
                request.Headers.Add("X-PDFStudio-Signature", $"t={timestamp},v1={signatureHex}");
                request.Headers.Add("X-PDFStudio-Event", evt.EventType);

                var response = await _httpClient.SendAsync(request, cancellationToken);
                var statusCode = (int)response.StatusCode;

                if (response.IsSuccessStatusCode)
                {
                    await _outbox.MarkDeliveredAsync(evt.Id, statusCode, cancellationToken);
                    _logger.LogInformation("Webhook event {EventId} delivered to {Url} with status {StatusCode}", evt.Id, webhook.Url, statusCode);
                }
                else
                {
                    var isDeadLetter = evt.AttemptCount >= 5;
                    var nextRetry = isDeadLetter ? (DateTimeOffset?)null : DateTimeOffset.UtcNow.AddSeconds(Math.Pow(2, evt.AttemptCount) * 10);
                    await _outbox.MarkFailedAsync(evt.Id, statusCode, $"HTTP status {statusCode}", nextRetry, isDeadLetter, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to deliver webhook event {EventId}", evt.Id);
                var isDeadLetter = evt.AttemptCount >= 5;
                var nextRetry = isDeadLetter ? (DateTimeOffset?)null : DateTimeOffset.UtcNow.AddSeconds(30);
                await _outbox.MarkFailedAsync(evt.Id, 0, ex.Message, nextRetry, isDeadLetter, cancellationToken);
            }
        }
    }
}

