using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PDFStudio.JobEngine.Webhooks;
using PDFStudio.JobEngine.Workers;

namespace PDFStudio.Worker;

public sealed class PdfProcessingWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PdfProcessingWorker> _logger;
    private readonly string _workerId;
    private DateTimeOffset _nextRetentionCleanupTime = DateTimeOffset.UtcNow;

    public PdfProcessingWorker(
        IServiceProvider serviceProvider,
        ILogger<PdfProcessingWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _workerId = $"worker-{Environment.MachineName}-{Guid.NewGuid():N}"[..24];
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PDFStudio Worker started with Worker ID: {WorkerId}", _workerId);

        while (!stoppingToken.IsCancellationRequested)
        {
            var processedJob = false;
            try
            {
                await using var scope = _serviceProvider.CreateAsyncScope();
                var processor = scope.ServiceProvider.GetRequiredService<IJobProcessor>();

                // 1. Process pending background PDF generation jobs
                processedJob = await processor.ProcessNextJobAsync(_workerId, stoppingToken);

                // 2. Dispatch pending webhooks from outbox (a webhook problem must never stop PDF jobs)
                try
                {
                    var webhookDispatcher = scope.ServiceProvider.GetRequiredService<IWebhookDispatcher>();
                    await webhookDispatcher.DispatchPendingWebhooksAsync(stoppingToken);
                }
                catch (Exception webhookEx) when (webhookEx is not OperationCanceledException)
                {
                    _logger.LogWarning(webhookEx, "Webhook dispatch failed; will retry on the next cycle.");
                }

                // 3. Periodic document retention and expiry cleanup (every hour)
                if (DateTimeOffset.UtcNow >= _nextRetentionCleanupTime)
                {
                    var docService = scope.ServiceProvider.GetService<PDFStudio.DocumentEngine.Services.IDocumentService>();
                    if (docService != null)
                    {
                        var cleanedCount = await docService.CleanupExpiredDocumentsAsync(stoppingToken);
                        if (cleanedCount > 0)
                        {
                            _logger.LogInformation("Cleaned up {CleanedCount} expired documents based on retention rules.", cleanedCount);
                        }
                    }
                    _nextRetentionCleanupTime = DateTimeOffset.UtcNow.AddHours(1);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error during worker processing loop.");
            }

            // If we processed a job, poll immediately for the next; otherwise back off briefly
            var delayMs = processedJob ? 100 : 2000;
            await Task.Delay(delayMs, stoppingToken);
        }

        _logger.LogInformation("PDFStudio Worker stopping.");
    }
}

