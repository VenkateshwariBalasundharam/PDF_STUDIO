using System.Text.Json;
using Microsoft.Extensions.Logging;
using PDFStudio.Application.Engines;
using PDFStudio.Application.Repositories;
using PDFStudio.DocumentEngine.Services;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.JobEngine.Templates;

namespace PDFStudio.JobEngine.Workers;

public interface IJobProcessor
{
    Task<bool> ProcessNextJobAsync(string workerId, CancellationToken cancellationToken = default);
}

public sealed class JobProcessor : IJobProcessor
{
    private readonly IJobQueue _jobQueue;
    private readonly ITemplateContentService _templateContent;
    private readonly ITemplateRenderer _templateRenderer;
    private readonly IPdfEngine _pdfEngine;
    private readonly IDocumentService _documentService;
    private readonly IWebhookOutbox? _webhookOutbox;
    private readonly IWebhookRepository? _webhookRepo;
    private readonly ILogger<JobProcessor> _logger;

    public JobProcessor(
        IJobQueue jobQueue,
        ITemplateContentService templateContent,
        ITemplateRenderer templateRenderer,
        IPdfEngine pdfEngine,
        IDocumentService documentService,
        ILogger<JobProcessor> logger,
        IWebhookOutbox? webhookOutbox = null,
        IWebhookRepository? webhookRepo = null)
    {
        _jobQueue = jobQueue;
        _templateContent = templateContent;
        _templateRenderer = templateRenderer;
        _pdfEngine = pdfEngine;
        _documentService = documentService;
        _logger = logger;
        _webhookOutbox = webhookOutbox;
        _webhookRepo = webhookRepo;
    }

    public async Task<bool> ProcessNextJobAsync(string workerId, CancellationToken cancellationToken = default)
    {
        var job = await _jobQueue.ClaimNextAsync(workerId, TimeSpan.FromMinutes(2), cancellationToken);
        if (job == null)
        {
            return false;
        }

        _logger.LogInformation("Worker {WorkerId} claimed Job {JobNumber} (Type: {JobType})", workerId, job.JobNumber, job.JobType);

        try
        {
            if (job.JobType == JobType.Generate)
            {
                await ProcessGenerateJobAsync(job, cancellationToken);
            }
            else
            {
                // Unsupported job type placeholder
                await _jobQueue.CompleteAsync(job.Id, JsonSerializer.Serialize(new { status = "skipped", reason = "unsupported_type" }), cancellationToken);
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error occurred processing job {JobNumber}", job.JobNumber);
            // Bad template ID / bad payload will never succeed on retry, so fail them straight away
            var permanent = ex is KeyNotFoundException or ArgumentException or JsonException;
            var canRetry = !permanent && job.AttemptCount < job.MaxAttempts;
            await _jobQueue.FailAsync(job.Id, ex.Message, canRetry, cancellationToken);
            return true;
        }
    }

    private async Task ProcessGenerateJobAsync(PdfJob job, CancellationToken cancellationToken)
    {
        using var jsonDoc = JsonDocument.Parse(job.PayloadJson);
        var root = jsonDoc.RootElement;

        string? Str(string name) =>
            root.ValueKind == JsonValueKind.Object && root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
                ? p.GetString()
                : null;

        bool? Bool(string name) =>
            root.ValueKind == JsonValueKind.Object && root.TryGetProperty(name, out var p) &&
            (p.ValueKind == JsonValueKind.True || p.ValueKind == JsonValueKind.False)
                ? p.GetBoolean()
                : null;

        var templateKey = Str("templateId");
        var htmlContent = Str("htmlContent");

        // Optional JSON data used to fill {{tags}}
        object? model = null;
        if (root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty("data", out var dataEl) &&
            dataEl.ValueKind == JsonValueKind.Object)
        {
            model = dataEl.Clone();
        }

        string html;
        string? css = null;
        string? headerHtml = null;
        string? footerHtml = null;
        string? templateName = null;
        Guid? templateId = null;
        (double? Top, double? Right, double? Bottom, double? Left) margins = (null, null, null, null);

        if (!string.IsNullOrWhiteSpace(templateKey))
        {
            // Template mode: use the template's real published version (HTML, CSS, header, footer, margins)
            var template = await _templateContent.GetCurrentAsync(job.OrganizationId, templateKey.Trim(), cancellationToken);
            if (template is null)
            {
                var keys = await _templateContent.ListKeysAsync(job.OrganizationId, cancellationToken);
                var hint = keys.Count > 0 ? $" Available templates: {string.Join(", ", keys)}." : string.Empty;
                throw new KeyNotFoundException($"Template '{templateKey}' was not found or has no published version.{hint}");
            }

            html = await _templateRenderer.RenderAsync(template.Html, model, cancellationToken);
            css = template.Css;
            headerHtml = template.HeaderHtml;
            footerHtml = template.FooterHtml;
            templateName = template.Name;
            templateId = template.Id;
            margins = TemplatePageSettings.ParseMargins(template.PageSettingsJson);
        }
        else if (!string.IsNullOrWhiteSpace(htmlContent))
        {
            // Raw HTML mode: fill {{tags}} only when data was sent
            html = model is not null
                ? await _templateRenderer.RenderAsync(htmlContent, model, cancellationToken)
                : htmlContent;
        }
        else
        {
            throw new ArgumentException("Payload must contain a 'templateId' or 'htmlContent'.");
        }

        var settings = new PageSettings(
            Orientation: string.IsNullOrWhiteSpace(Str("orientation")) ? "Portrait" : Str("orientation")!,
            Size: string.IsNullOrWhiteSpace(Str("pageSize")) ? "A4" : Str("pageSize")!,
            MarginTopMm: margins.Top ?? 10,
            MarginBottomMm: margins.Bottom ?? 10,
            MarginLeftMm: margins.Left ?? 10,
            MarginRightMm: margins.Right ?? 10,
            PrintBackground: Bool("printBackground") ?? true);

        // Generate PDF bytes via Chromium
        var pdfBytes = await _pdfEngine.GenerateAsync(
            new PdfGenerationRequest(
                HtmlContent: html,
                HeaderHtml: headerHtml,
                FooterHtml: footerHtml,
                DefaultStylesCss: css,
                Settings: settings),
            cancellationToken);

        // Persist Document & Storage
        var title = Str("title");
        if (string.IsNullOrWhiteSpace(title))
        {
            title = $"{templateName ?? "Generated PDF"} (Job {job.JobNumber})";
        }

        var doc = await _documentService.CreateDocumentAsync(
            organizationId: job.OrganizationId,
            title: title,
            pdfBytes: pdfBytes,
            generatedFromTemplateId: templateId,
            generatedFromJobId: job.Id,
            cancellationToken: cancellationToken);

        // Mark Job Complete
        var resultJson = JsonSerializer.Serialize(new
        {
            documentId = doc.DocumentNumber,
            fileSizeBytes = pdfBytes.Length,
            status = "completed"
        });

        await _jobQueue.CompleteAsync(job.Id, resultJson, cancellationToken);
        _logger.LogInformation("Job {JobNumber} completed successfully. Produced document {DocumentNumber}", job.JobNumber, doc.DocumentNumber);

        // Enqueue Webhook Event if configured
        if (_webhookOutbox != null && _webhookRepo != null)
        {
            var webhooks = await _webhookRepo.ListAsync(job.OrganizationId, cancellationToken);
            foreach (var hook in webhooks.Where(w => w.IsActive && w.EventsJson.Contains("job.completed", StringComparison.OrdinalIgnoreCase)))
            {
                await _webhookOutbox.EnqueueEventAsync(new WebhookEvent
                {
                    Id = Guid.NewGuid(),
                    OrganizationId = job.OrganizationId,
                    WebhookId = hook.Id,
                    EventType = "job.completed",
                    PayloadJson = JsonSerializer.Serialize(new
                    {
                        @event = "job.completed",
                        jobId = job.JobNumber,
                        documentId = doc.DocumentNumber,
                        status = "completed",
                        timestamp = DateTimeOffset.UtcNow
                    }),
                    Status = WebhookEventStatus.Pending,
                    AttemptCount = 0,
                    CreatedAtUtc = DateTimeOffset.UtcNow,
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                }, cancellationToken);
            }
        }
    }
}

