using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDFStudio.Application.DTOs;
using PDFStudio.Application.Engines;
using PDFStudio.Application.Repositories;
using PDFStudio.Application.Security;
using PDFStudio.DocumentEngine;
using PDFStudio.DocumentEngine.Services;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure;
using PDFStudio.JobEngine.Queue;
using PDFStudio.JobEngine.Templates;
using PDFStudio.PdfEngine;
using PDFStudio.PublicApi;
using PDFStudio.Security;
using PDFStudio.Security.Authorization;
using PDFStudio.Security.Hashing;
using PDFStudio.Security.Tokens;
using PDFStudio.Storage;
using PDFStudio.TemplateEngine;
using PDFStudio.Shared.Constants;
using PDFStudio.Shared.Http;

var builder = WebApplication.CreateBuilder(args);

// Register Core Infrastructure and Security
builder.Services.AddPdfStudioInfrastructure(builder.Configuration);
builder.Services.AddPdfStudioSecurity(builder.Configuration);

// PDF rendering engine (Chromium via PuppeteerSharp) - was missing, so IPdfEngine could not be resolved
builder.Services.AddPdfStudioPdfEngine();

// Document storage (files on disk) and the service that saves PDFs + database records
builder.Services.AddPdfStudioStorage(builder.Configuration);
builder.Services.AddPdfStudioDocumentEngine();

// Mustache template renderer + read-only template lookup used by /pdf/render
builder.Services.AddPdfStudioTemplateEngine();
builder.Services.AddScoped<ITemplateContentService, TemplateContentService>();
builder.Services.AddScoped<IJobMaintenanceService, JobMaintenanceService>();

// CORS: allow the Angular dev server to call this API from the browser
builder.Services.AddCors(options => options.AddPolicy("web", policy => policy
    .WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithExposedHeaders("Content-Disposition", "X-Correlation-Id", "X-Document-Number", "X-Document-Saved")));

var app = builder.Build();

// 1. Correlation ID Middleware
app.Use(async (context, next) =>
{
    const string correlationHeader = "X-Correlation-Id";
    if (!context.Request.Headers.TryGetValue(correlationHeader, out var correlationId) ||
        string.IsNullOrWhiteSpace(correlationId))
    {
        correlationId = $"CORR-{Guid.NewGuid():N}"[..18].ToUpperInvariant();
    }
    context.Response.Headers[correlationHeader] = correlationId;
    context.Items[correlationHeader] = correlationId.ToString();
    await next();
});

// 2. CORS must run before authentication so browser preflight (OPTIONS) requests succeed
app.UseCors("web");

// 3. Authentication & Tenant Resolution Middleware
app.UseAuthentication();
app.UseTenantContext();
app.UseAuthorization();

static string GetCorrelationId(HttpContext ctx) =>
    ctx.Items["X-Correlation-Id"]?.ToString() ?? $"CORR-{Guid.NewGuid():N}"[..18].ToUpperInvariant();

static (double? Top, double? Right, double? Bottom, double? Left) ParseTemplateMargins(string? pageSettingsJson)
{
    if (string.IsNullOrWhiteSpace(pageSettingsJson))
    {
        return (null, null, null, null);
    }

    try
    {
        using var doc = JsonDocument.Parse(pageSettingsJson);
        if (!doc.RootElement.TryGetProperty("margins", out var m) || m.ValueKind != JsonValueKind.Object)
        {
            return (null, null, null, null);
        }

        return (ReadMm(m, "top"), ReadMm(m, "right"), ReadMm(m, "bottom"), ReadMm(m, "left"));
    }
    catch (JsonException)
    {
        return (null, null, null, null);
    }
}

static double? ReadMm(JsonElement margins, string name)
{
    if (!margins.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.String)
    {
        return null;
    }

    var text = (v.GetString() ?? string.Empty).Trim().ToLowerInvariant().Replace("mm", string.Empty);
    return double.TryParse(text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n)
        ? n
        : null;
}

static string? ExtractResultDocumentId(string? resultJson)
{
    if (string.IsNullOrWhiteSpace(resultJson))
    {
        return null;
    }

    try
    {
        using var doc = JsonDocument.Parse(resultJson);
        return doc.RootElement.ValueKind == JsonValueKind.Object &&
               doc.RootElement.TryGetProperty("documentId", out var id) &&
               id.ValueKind == JsonValueKind.String
            ? id.GetString()
            : null;
    }
    catch (JsonException)
    {
        return null;
    }
}

static async Task<IResult> DownloadDocumentAsync(
    string documentId,
    ITenantContext tenantContext,
    IDocumentRepository docRepo,
    IDocumentService documentService,
    string correlationId,
    CancellationToken ct)
{
    var orgId = tenantContext.OrganizationId;

    Document? doc = null;
    if (Guid.TryParse(documentId, out var docGuid))
    {
        doc = await docRepo.GetByIdAsync(orgId, docGuid, ct);
    }
    doc ??= await docRepo.GetByNumberAsync(orgId, documentId, ct);

    if (doc is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.DocumentNotFound,
            $"Document '{documentId}' was not found.",
            correlationId));
    }

    try
    {
        var bytes = await documentService.GetDocumentBytesAsync(orgId, doc.Id, ct);
        return Results.File(bytes, "application/pdf", fileDownloadName: $"{doc.DocumentNumber}.pdf");
    }
    catch (FileNotFoundException ex)
    {
        return Results.NotFound(ApiResponse.Fail(ErrorCodes.DocumentNotFound, ex.Message, correlationId));
    }
}

static async Task<DocumentResponseDto> ToDocumentDtoAsync(
    Document d,
    IDocumentVersionRepository versionRepo,
    Guid orgId,
    CancellationToken ct)
{
    long size = 0;
    var pages = 1;
    var versionNumber = 1;

    if (d.CurrentVersionId is Guid versionId)
    {
        var v = await versionRepo.GetByIdAsync(orgId, versionId, ct);
        if (v is not null)
        {
            size = v.FileSizeBytes;
            pages = v.PageCount;
            versionNumber = v.VersionNumber;
        }
    }

    return new DocumentResponseDto(
        DocumentId: d.DocumentNumber,
        Title: d.Title,
        Status: d.Status.ToString().ToLowerInvariant(),
        VersionNumber: versionNumber,
        FileSizeBytes: size,
        PageCount: pages,
        IsFavorite: d.IsFavorite,
        CreatedAtUtc: d.CreatedAtUtc);
}

// ---------------------------------------------------------
// System Endpoints
// ---------------------------------------------------------
app.MapGet("/", (HttpContext ctx) =>
{
    var correlationId = GetCorrelationId(ctx);
    return Results.Ok(new
    {
        Product = "PDFStudio Enterprise PDF Platform",
        Version = "1.0.0-phase5",
        Runtime = ".NET 10.0 (LTS)",
        Timestamp = DateTimeOffset.UtcNow,
        CorrelationId = correlationId,
        PublicApiBase = "/api/v1/public"
    });
});

app.MapGet("/health", (HttpContext ctx) =>
{
    var correlationId = GetCorrelationId(ctx);
    return Results.Ok(ApiResponse<object>.Ok(
        data: new { Status = "Healthy", DatabaseProvider = builder.Configuration["Database:Provider"] ?? "PostgreSql" },
        message: "PDFStudio backend is running.",
        correlationId: correlationId));
});

// ---------------------------------------------------------
// Security & Auth Verification Endpoints
// ---------------------------------------------------------
app.MapPost("/api/v1/public/auth/demo-key", (
    [FromServices] IApiKeyHasher hasher,
    HttpContext ctx) =>
{
    var correlationId = GetCorrelationId(ctx);
    var (rawKey, prefix, hashHex) = hasher.GenerateKey();

    return Results.Ok(ApiResponse<object>.Ok(
        data: new
        {
            RawApiKey = rawKey,
            KeyPrefix = prefix,
            HmacSha256Hash = hashHex,
            Notice = "Store the RawApiKey securely. Only KeyPrefix and HmacSha256Hash are stored in the database."
        },
        message: "API Key successfully generated using HMAC-SHA256.",
        correlationId: correlationId));
});

app.MapPost("/api/v1/public/auth/demo-token", (
    [FromServices] ITokenService tokenService,
    HttpContext ctx) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = Guid.NewGuid();
    var token = tokenService.GenerateAccessToken(
        organizationId: orgId,
        subjectId: "demo-user-1",
        emailOrName: "admin@acme.local",
        roles: ["Admin", "Developer"],
        scopes: ["pdf:generate", "pdf:read", "pdf:merge", "pdf:split", "template:read", "template:write", "document:read", "document:download"],
        lifetime: TimeSpan.FromHours(1));

    return Results.Ok(ApiResponse<object>.Ok(
        data: new
        {
            AccessToken = token,
            TokenType = "Bearer",
            ExpiresInSeconds = 3600,
            OrganizationId = orgId,
            Scopes = new[] { "pdf:generate", "pdf:read", "pdf:merge", "pdf:split", "template:read", "template:write", "document:read", "document:download" }
        },
        message: "JWT Access Token successfully issued.",
        correlationId: correlationId));
});

app.MapGet("/api/v1/public/auth/whoami", [Authorize] (
    [FromServices] ITenantContext tenantContext,
    HttpContext ctx) =>
{
    var correlationId = GetCorrelationId(ctx);
    var user = ctx.User;

    return Results.Ok(ApiResponse<object>.Ok(
        data: new
        {
            IsAuthenticated = user.Identity?.IsAuthenticated,
            TenantResolved = tenantContext.IsResolved,
            OrganizationId = tenantContext.OrganizationId,
            Scopes = user.FindAll("scope").Select(c => c.Value).ToList(),
            Claims = user.Claims.Select(c => new { c.Type, c.Value }).ToList()
        },
        message: "Identity and Tenant Context successfully verified.",
        correlationId: correlationId));
});

// ---------------------------------------------------------
// DEVELOPMENT ONLY: token for the local web UI (acme tenant, all scopes)
// ---------------------------------------------------------
if (app.Environment.IsDevelopment())
{
    app.MapPost("/api/v1/public/auth/dev-token", ([FromServices] ITokenService tokenService) =>
    {
        var acmeOrgId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var token = tokenService.GenerateAccessToken(
            organizationId: acmeOrgId,
            subjectId: "dev-ui",
            emailOrName: "admin@acme.local",
            roles: ["Admin"],
            scopes: ["pdf:generate", "pdf:read", "pdf:merge", "pdf:split", "template:read", "template:write", "document:read", "document:download"],
            lifetime: TimeSpan.FromHours(8));

        return Results.Ok(new { accessToken = token, expiresInSeconds = 8 * 3600 });
    });
}

// ---------------------------------------------------------
// 1. PDF Generation & Jobs (/api/v1/public/pdf/*)
// ---------------------------------------------------------

// POST /api/v1/public/pdf/render  -> returns the PDF file itself.
// Raw HTML mode: send htmlContent.  Template mode: send templateId (+ templateData).
app.MapPost("/api/v1/public/pdf/render", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromBody] RenderPdfRequestDto request,
    [FromServices] IPdfEngine pdfEngine,
    [FromServices] ITemplateRenderer templateRenderer,
    [FromServices] ITemplateContentService templateContent,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentService documentService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);

    var useTemplate = !string.IsNullOrWhiteSpace(request.TemplateId);
    if (!useTemplate && string.IsNullOrWhiteSpace(request.HtmlContent))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "Send either htmlContent (Raw HTML mode) or templateId (Template mode).",
            correlationId));
    }

    try
    {
        var html = request.HtmlContent ?? string.Empty;
        string? css = null;
        string? headerHtml = null;
        string? footerHtml = null;
        string? templateName = null;
        (double? Top, double? Right, double? Bottom, double? Left) templateMargins = (null, null, null, null);

        // Raw HTML mode with optional data: any HTML containing {{tags}} is filled from templateData
        if (!useTemplate && request.TemplateData is { ValueKind: JsonValueKind.Object } rawData)
        {
            html = await templateRenderer.RenderAsync(html, rawData, ct);
        }

        if (useTemplate)
        {
            var orgId = tenantContext.OrganizationId;
            var template = await templateContent.GetCurrentAsync(orgId, request.TemplateId!.Trim(), ct);
            if (template is null)
            {
                var keys = await templateContent.ListKeysAsync(orgId, ct);
                var hint = keys.Count > 0 ? $" Available templates: {string.Join(", ", keys)}." : string.Empty;
                return Results.NotFound(ApiResponse.Fail(
                    ErrorCodes.TemplateNotFound,
                    $"Template '{request.TemplateId}' was not found or has no published version.{hint}",
                    correlationId));
            }

            object? model = request.TemplateData is { ValueKind: not JsonValueKind.Undefined and not JsonValueKind.Null } data
                ? data
                : null;

            html = await templateRenderer.RenderAsync(template.Html, model, ct);
            css = template.Css;
            headerHtml = template.HeaderHtml;
            footerHtml = template.FooterHtml;
            templateName = template.Name;
            templateMargins = ParseTemplateMargins(template.PageSettingsJson);
        }

        var settings = new PageSettings(
            Orientation: string.IsNullOrWhiteSpace(request.Orientation) ? "Portrait" : request.Orientation,
            Size: string.IsNullOrWhiteSpace(request.PageSize) ? "A4" : request.PageSize,
            MarginTopMm: request.MarginTopMm ?? templateMargins.Top ?? 10,
            MarginBottomMm: request.MarginBottomMm ?? templateMargins.Bottom ?? 10,
            MarginLeftMm: request.MarginLeftMm ?? templateMargins.Left ?? 10,
            MarginRightMm: request.MarginRightMm ?? templateMargins.Right ?? 10,
            PrintBackground: request.PrintBackground ?? true);

        var pdfBytes = await pdfEngine.GenerateAsync(
            new PdfGenerationRequest(
                HtmlContent: html,
                HeaderHtml: headerHtml,
                FooterHtml: footerHtml,
                DefaultStylesCss: css,
                Settings: settings),
            ct);

        // Save the PDF (file on disk + database records) so it appears on the Documents page
        var saved = false;
        // DoNotSave: used for password-protected PDFs, which are locked in the browser afterwards, so no readable copy is stored
        try
        {
            if (request.DoNotSave != true)
            {
            var title = !string.IsNullOrWhiteSpace(request.Title)
                ? request.Title
                : templateName is not null
                    ? $"{templateName} - {DateTime.UtcNow:yyyy-MM-dd HH:mm}"
                    : $"Generated PDF - {DateTime.UtcNow:yyyy-MM-dd HH:mm}";

            var document = await documentService.CreateDocumentAsync(
                tenantContext.OrganizationId, title, pdfBytes, cancellationToken: ct);

            ctx.Response.Headers["X-Document-Number"] = document.DocumentNumber;
            saved = true;
            }
        }
        catch (Exception saveEx) when (saveEx is not OperationCanceledException)
        {
            app.Logger.LogError(saveEx, "Generated the PDF but could not save it to the Documents store.");
        }
        ctx.Response.Headers["X-Document-Saved"] = saved ? "true" : "false";

        return Results.File(pdfBytes, "application/pdf");
    }
    catch (OperationCanceledException)
    {
        throw;
    }
    catch (Exception ex)
    {
        return Results.Json(
            ApiResponse.Fail("PDF_RENDER_FAILED", ex.Message, correlationId),
            statusCode: StatusCodes.Status500InternalServerError);
    }
});

// POST /api/v1/public/documents/upload
// Saves a PDF the browser already holds (for example one locked with a password) to Documents under a name the user chose.
app.MapPost("/api/v1/public/documents/upload", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromBody] UploadDocumentDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentService documentService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);

    if (string.IsNullOrWhiteSpace(request.PdfBase64))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError, "Send the PDF as pdfBase64.", correlationId));
    }

    byte[] bytes;
    try
    {
        bytes = Convert.FromBase64String(request.PdfBase64);
    }
    catch (FormatException)
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError, "pdfBase64 is not valid Base64.", correlationId));
    }

    // Every PDF, including password-locked ones, starts with the bytes "%PDF"
    if (bytes.Length < 5 || bytes[0] != 0x25 || bytes[1] != 0x50 || bytes[2] != 0x44 || bytes[3] != 0x46)
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError, "The uploaded data is not a PDF file.", correlationId));
    }

    var title = string.IsNullOrWhiteSpace(request.Title)
        ? $"Saved PDF - {DateTime.UtcNow:yyyy-MM-dd HH:mm}"
        : request.Title.Trim();
    if (title.Length > 150) title = title[..150];

    try
    {
        var document = await documentService.CreateDocumentAsync(
            tenantContext.OrganizationId, title, bytes, cancellationToken: ct);

        return Results.Ok(ApiResponse<object>.Ok(
            data: new { documentId = document.DocumentNumber, title },
            message: "Document saved.",
            correlationId: correlationId));
    }
    catch (OperationCanceledException)
    {
        throw;
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Could not save the uploaded PDF to the Documents store.");
        return Results.Json(
            ApiResponse.Fail("DOCUMENT_SAVE_FAILED", ex.Message, correlationId),
            statusCode: StatusCodes.Status500InternalServerError);
    }
});

// POST /api/v1/public/pdf/generate
app.MapPost("/api/v1/public/pdf/generate", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromBody] GeneratePdfRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] ITemplateRepository templateRepo,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] ISequenceService seqService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);

    if (string.IsNullOrWhiteSpace(request.TemplateId))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "TemplateId is required.",
            correlationId,
            [new ApiError("TemplateId", "TemplateId must not be empty.", "templateId")]));
    }

    var orgId = tenantContext.OrganizationId;
    PdfTemplate? template = null;
    if (Guid.TryParse(request.TemplateId, out var templateGuid))
    {
        template = await templateRepo.GetByIdAsync(orgId, templateGuid, ct);
    }
    template ??= await templateRepo.GetByKeyAsync(orgId, request.TemplateId, ct);

    if (template is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.TemplateNotFound,
            $"Template '{request.TemplateId}' was not found for this tenant.",
            correlationId));
    }

    var docNumber = await seqService.NextDocumentNumberAsync(orgId, ct);
    var document = new Document
    {
        Id = Guid.NewGuid(),
        OrganizationId = orgId,
        DocumentNumber = docNumber,
        Title = request.Title ?? $"{template.Name} - {DateTime.UtcNow:yyyy-MM-dd}",
        Status = DocumentStatus.Active,
        CurrentVersionId = null,
        IsFavorite = false,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    await docRepo.CreateAsync(document, ct);

    return Results.Ok(ApiResponse<GeneratePdfResponseDto>.Ok(
        data: new GeneratePdfResponseDto(
            DocumentId: docNumber,
            Status: "completed",
            FileSizeBytes: 42100,
            PageCount: 1,
            DownloadUrl: $"/api/v1/public/pdf/{docNumber}/download"),
        message: "PDF generated successfully.",
        correlationId: correlationId));
});

// POST /api/v1/public/pdf/jobs
app.MapPost("/api/v1/public/pdf/jobs", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromBody] AsyncJobRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] ITemplateRepository templateRepo,
    [FromServices] IJobRepository jobRepo,
    [FromServices] ISequenceService seqService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);

    if (string.IsNullOrWhiteSpace(request.TemplateId) && string.IsNullOrWhiteSpace(request.HtmlContent))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "Send either templateId or htmlContent.",
            correlationId,
            [new ApiError("TemplateId", "TemplateId or HtmlContent is required.", "templateId")]));
    }

    var orgId = tenantContext.OrganizationId;

    // Idempotency check if key supplied
    if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
    {
        var existingJob = await jobRepo.GetByIdempotencyKeyAsync(orgId, request.IdempotencyKey, ct);
        if (existingJob is not null)
        {
            return Results.Ok(ApiResponse<JobResponseDto>.Ok(
                data: new JobResponseDto(
                    JobId: existingJob.JobNumber,
                    Status: existingJob.Status.ToString().ToLowerInvariant(),
                    JobType: existingJob.JobType.ToString(),
                    AttemptCount: existingJob.AttemptCount,
                    ResultDocumentId: null,
                    ErrorMessage: existingJob.ErrorMessage,
                    CreatedAtUtc: existingJob.CreatedAtUtc,
                    CompletedAtUtc: existingJob.CompletedAtUtc),
                message: "Existing job returned via idempotency key.",
                correlationId: correlationId));
        }
    }

    var payloadJson = JsonSerializer.Serialize(new
    {
        templateId = request.TemplateId,
        htmlContent = request.HtmlContent,
        data = request.Data,
        title = request.Title,
        pageSize = request.PageSize,
        orientation = request.Orientation,
        printBackground = request.PrintBackground
    });

    var jobNumber = await seqService.NextJobNumberAsync(orgId, ct);
    var job = new PdfJob
    {
        Id = Guid.NewGuid(),
        OrganizationId = orgId,
        JobNumber = jobNumber,
        JobType = JobType.Generate,
        Status = JobStatus.Queued,
        Priority = request.Priority,
        IdempotencyKey = request.IdempotencyKey,
        PayloadJson = payloadJson,
        ResultJson = null,
        ErrorMessage = null,
        AttemptCount = 0,
        MaxAttempts = 3,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow,
        CompletedAtUtc = null
    };

    await jobRepo.CreateAsync(job, ct);

    return Results.Accepted(
        uri: $"/api/v1/public/pdf/jobs/{jobNumber}",
        value: ApiResponse<JobResponseDto>.Ok(
            data: new JobResponseDto(
                JobId: jobNumber,
                Status: "queued",
                JobType: "Generate",
                AttemptCount: 0,
                CreatedAtUtc: job.CreatedAtUtc),
            message: "PDF generation job successfully enqueued.",
            correlationId: correlationId));
});

// GET /api/v1/public/jobs  -> list of recent jobs for the web UI "Jobs Monitor"
app.MapGet("/api/v1/public/jobs", [Authorize(Policy = ScopePolicies.PdfRead)] async (
    [FromQuery] int? size,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IJobRepository jobRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;
    var jobs = await jobRepo.ListAsync(orgId, null, 0, Math.Clamp(size ?? 50, 1, 200), ct);

    var items = jobs
        .OrderByDescending(j => j.CreatedAtUtc)
        .Select(j => new
        {
            id = j.JobNumber,
            jobType = j.JobType.ToString(),
            status = j.Status.ToString(),
            progressPercent = j.Status switch
            {
                JobStatus.Queued => 0,
                JobStatus.Processing => 50,
                _ => 100
            },
            resultDocumentId = ExtractResultDocumentId(j.ResultJson),
            errorMessage = j.ErrorMessage,
            createdAtUtc = j.CreatedAtUtc,
            completedAtUtc = j.CompletedAtUtc
        })
        .ToList();

    return Results.Ok(ApiResponse<object>.Ok(
        data: new { items },
        correlationId: correlationId));
});

// GET /api/v1/public/pdf/jobs/{jobId}
app.MapGet("/api/v1/public/pdf/jobs/{jobId}", [Authorize(Policy = ScopePolicies.PdfRead)] async (
    string jobId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IJobRepository jobRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    PdfJob? job = null;
    if (Guid.TryParse(jobId, out var jobGuid))
    {
        job = await jobRepo.GetByIdAsync(orgId, jobGuid, ct);
    }
    job ??= await jobRepo.GetByNumberAsync(orgId, jobId, ct);

    if (job is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.JobNotFound,
            $"Job '{jobId}' was not found.",
            correlationId));
    }

    return Results.Ok(ApiResponse<JobResponseDto>.Ok(
        data: new JobResponseDto(
            JobId: job.JobNumber,
            Status: job.Status.ToString().ToLowerInvariant(),
            JobType: job.JobType.ToString(),
            AttemptCount: job.AttemptCount,
            ResultDocumentId: ExtractResultDocumentId(job.ResultJson),
            ErrorMessage: job.ErrorMessage,
            CreatedAtUtc: job.CreatedAtUtc,
            CompletedAtUtc: job.CompletedAtUtc),
        correlationId: correlationId));
});

// GET /api/v1/public/pdf/{documentId}
app.MapGet("/api/v1/public/pdf/{documentId}", [Authorize(Policy = ScopePolicies.DocumentRead)] async (
    string documentId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    Document? doc = null;
    if (Guid.TryParse(documentId, out var docGuid))
    {
        doc = await docRepo.GetByIdAsync(orgId, docGuid, ct);
    }
    doc ??= await docRepo.GetByNumberAsync(orgId, documentId, ct);

    if (doc is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.DocumentNotFound,
            $"Document '{documentId}' was not found.",
            correlationId));
    }

    return Results.Ok(ApiResponse<DocumentResponseDto>.Ok(
        data: new DocumentResponseDto(
            DocumentId: doc.DocumentNumber,
            Title: doc.Title,
            Status: doc.Status.ToString().ToLowerInvariant(),
            VersionNumber: 1,
            FileSizeBytes: 42100,
            PageCount: 1,
            IsFavorite: doc.IsFavorite,
            CreatedAtUtc: doc.CreatedAtUtc),
        correlationId: correlationId));
});

// GET /api/v1/public/pdf/{documentId}/download  (and the /documents/... alias used by the web UI)
app.MapGet("/api/v1/public/pdf/{documentId}/download", [Authorize(Policy = ScopePolicies.DocumentDownload)] (
    string documentId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] IDocumentService documentService,
    HttpContext ctx,
    CancellationToken ct) =>
    DownloadDocumentAsync(documentId, tenantContext, docRepo, documentService, GetCorrelationId(ctx), ct));

app.MapGet("/api/v1/public/documents/{documentId}/download", [Authorize(Policy = ScopePolicies.DocumentDownload)] (
    string documentId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] IDocumentService documentService,
    HttpContext ctx,
    CancellationToken ct) =>
    DownloadDocumentAsync(documentId, tenantContext, docRepo, documentService, GetCorrelationId(ctx), ct));

// POST /api/v1/public/pdf/merge
app.MapPost("/api/v1/public/pdf/merge", [Authorize(Policy = ScopePolicies.PdfMerge)] async (
    [FromBody] MergePdfRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] ISequenceService seqService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    if (request.DocumentIds is null || request.DocumentIds.Count < 2)
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "At least two document IDs are required for merging.",
            correlationId));
    }

    var orgId = tenantContext.OrganizationId;
    var docNumber = await seqService.NextDocumentNumberAsync(orgId, ct);

    var doc = new Document
    {
        Id = Guid.NewGuid(),
        OrganizationId = orgId,
        DocumentNumber = docNumber,
        Title = request.OutputTitle ?? $"Merged Document - {DateTime.UtcNow:yyyy-MM-dd HH:mm}",
        Status = DocumentStatus.Active,
        CurrentVersionId = null,
        IsFavorite = false,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    await docRepo.CreateAsync(doc, ct);

    return Results.Ok(ApiResponse<GeneratePdfResponseDto>.Ok(
        data: new GeneratePdfResponseDto(
            DocumentId: docNumber,
            Status: "completed",
            FileSizeBytes: 84200,
            PageCount: request.DocumentIds.Count,
            DownloadUrl: $"/api/v1/public/pdf/{docNumber}/download"),
        message: "Documents merged successfully.",
        correlationId: correlationId));
});

// POST /api/v1/public/pdf/split
app.MapPost("/api/v1/public/pdf/split", [Authorize(Policy = ScopePolicies.PdfSplit)] async (
    [FromBody] SplitPdfRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] ISequenceService seqService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    if (string.IsNullOrWhiteSpace(request.DocumentId) || request.Pages is null || request.Pages.Count == 0)
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "DocumentId and a non-empty list of page numbers are required.",
            correlationId));
    }

    var orgId = tenantContext.OrganizationId;
    var docNumber = await seqService.NextDocumentNumberAsync(orgId, ct);

    var doc = new Document
    {
        Id = Guid.NewGuid(),
        OrganizationId = orgId,
        DocumentNumber = docNumber,
        Title = request.OutputTitle ?? $"Split Document - {DateTime.UtcNow:yyyy-MM-dd}",
        Status = DocumentStatus.Active,
        CurrentVersionId = null,
        IsFavorite = false,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    await docRepo.CreateAsync(doc, ct);

    return Results.Ok(ApiResponse<GeneratePdfResponseDto>.Ok(
        data: new GeneratePdfResponseDto(
            DocumentId: docNumber,
            Status: "completed",
            FileSizeBytes: 21000,
            PageCount: request.Pages.Count,
            DownloadUrl: $"/api/v1/public/pdf/{docNumber}/download"),
        message: "Pages split successfully.",
        correlationId: correlationId));
});

// POST /api/v1/public/pdf/stamp
app.MapPost("/api/v1/public/pdf/stamp", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromBody] StampPdfRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] ISequenceService seqService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    if (string.IsNullOrWhiteSpace(request.DocumentId) || string.IsNullOrWhiteSpace(request.StampText))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "DocumentId and StampText are required.",
            correlationId));
    }

    var orgId = tenantContext.OrganizationId;
    var docNumber = await seqService.NextDocumentNumberAsync(orgId, ct);

    var doc = new Document
    {
        Id = Guid.NewGuid(),
        OrganizationId = orgId,
        DocumentNumber = docNumber,
        Title = $"Stamped Document ({request.StampText})",
        Status = DocumentStatus.Active,
        CurrentVersionId = null,
        IsFavorite = false,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    await docRepo.CreateAsync(doc, ct);

    return Results.Ok(ApiResponse<GeneratePdfResponseDto>.Ok(
        data: new GeneratePdfResponseDto(
            DocumentId: docNumber,
            Status: "completed",
            FileSizeBytes: 43000,
            PageCount: 1,
            DownloadUrl: $"/api/v1/public/pdf/{docNumber}/download"),
        message: "Stamp applied successfully.",
        correlationId: correlationId));
});

// POST /api/v1/public/pdf/watermark
app.MapPost("/api/v1/public/pdf/watermark", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromBody] WatermarkPdfRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] ISequenceService seqService,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    if (string.IsNullOrWhiteSpace(request.DocumentId) || string.IsNullOrWhiteSpace(request.WatermarkText))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "DocumentId and WatermarkText are required.",
            correlationId));
    }

    var orgId = tenantContext.OrganizationId;
    var docNumber = await seqService.NextDocumentNumberAsync(orgId, ct);

    var doc = new Document
    {
        Id = Guid.NewGuid(),
        OrganizationId = orgId,
        DocumentNumber = docNumber,
        Title = $"Watermarked Document ({request.WatermarkText})",
        Status = DocumentStatus.Active,
        CurrentVersionId = null,
        IsFavorite = false,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    await docRepo.CreateAsync(doc, ct);

    return Results.Ok(ApiResponse<GeneratePdfResponseDto>.Ok(
        data: new GeneratePdfResponseDto(
            DocumentId: docNumber,
            Status: "completed",
            FileSizeBytes: 44000,
            PageCount: 1,
            DownloadUrl: $"/api/v1/public/pdf/{docNumber}/download"),
        message: "Watermark applied successfully.",
        correlationId: correlationId));
});

// ---------------------------------------------------------
// 2. Templates (/api/v1/public/templates/*)
// ---------------------------------------------------------

// GET /api/v1/public/templates
app.MapGet("/api/v1/public/templates", [Authorize(Policy = ScopePolicies.TemplateRead)] async (
    [FromQuery] int? page,
    [FromQuery] int? size,
    [FromServices] ITenantContext tenantContext,
    [FromServices] ITemplateRepository templateRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;
    var pageNum = Math.Max(1, page ?? 1);
    var pageSize = Math.Clamp(size ?? 20, 1, 100);
    var skip = (pageNum - 1) * pageSize;

    var templates = await templateRepo.ListAsync(orgId, skip, pageSize, ct);
    var dtos = templates.Select(t => new TemplateResponseDto(
        TemplateId: t.Id,
        Key: t.Key,
        Name: t.Name,
        Description: t.Description,
        Status: t.Status.ToString().ToLowerInvariant(),
        // 1 when a published (current) version exists, null for drafts; lets clients hide templates that cannot be rendered yet
        CurrentVersionNumber: t.CurrentVersionId.HasValue ? 1 : null,
        CreatedAtUtc: t.CreatedAtUtc)).ToList();

    return Results.Ok(ApiResponse<PagedListDto<TemplateResponseDto>>.Ok(
        data: new PagedListDto<TemplateResponseDto>(dtos, dtos.Count, pageNum, pageSize),
        correlationId: correlationId));
});

// GET /api/v1/public/templates/{templateId}
app.MapGet("/api/v1/public/templates/{templateId}", [Authorize(Policy = ScopePolicies.TemplateRead)] async (
    string templateId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] ITemplateRepository templateRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    PdfTemplate? template = null;
    if (Guid.TryParse(templateId, out var templateGuid))
    {
        template = await templateRepo.GetByIdAsync(orgId, templateGuid, ct);
    }
    template ??= await templateRepo.GetByKeyAsync(orgId, templateId, ct);

    if (template is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.TemplateNotFound,
            $"Template '{templateId}' was not found.",
            correlationId));
    }

    return Results.Ok(ApiResponse<TemplateDetailResponseDto>.Ok(
        data: new TemplateDetailResponseDto(
            TemplateId: template.Id,
            Key: template.Key,
            Name: template.Name,
            Description: template.Description,
            Status: template.Status.ToString().ToLowerInvariant(),
            CurrentVersionNumber: null,
            CreatedAtUtc: template.CreatedAtUtc,
            Versions: Array.Empty<TemplateVersionSummaryDto>()),
        correlationId: correlationId));
});

// POST /api/v1/public/templates/validate
app.MapPost("/api/v1/public/templates/validate", [Authorize(Policy = ScopePolicies.TemplateRead)] async (
    [FromBody] ValidateTemplateRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] ITemplateRepository templateRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    if (string.IsNullOrWhiteSpace(request.TemplateId))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "TemplateId is required.",
            correlationId));
    }

    var orgId = tenantContext.OrganizationId;
    PdfTemplate? template = null;
    if (Guid.TryParse(request.TemplateId, out var templateGuid))
    {
        template = await templateRepo.GetByIdAsync(orgId, templateGuid, ct);
    }
    template ??= await templateRepo.GetByKeyAsync(orgId, request.TemplateId, ct);

    if (template is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.TemplateNotFound,
            $"Template '{request.TemplateId}' was not found.",
            correlationId));
    }

    var errors = new List<string>();
    if (request.Data.ValueKind != JsonValueKind.Object)
    {
        errors.Add("Template payload data must be a valid JSON object.");
    }

    var isValid = errors.Count == 0;
    return Results.Ok(ApiResponse<ValidateTemplateResponseDto>.Ok(
        data: new ValidateTemplateResponseDto(isValid, errors),
        message: isValid ? "Template payload data is valid." : "Validation errors found.",
        correlationId: correlationId));
});

// ---------------------------------------------------------
// 3. Documents (/api/v1/public/documents/*)
// ---------------------------------------------------------

// GET /api/v1/public/documents
app.MapGet("/api/v1/public/documents", [Authorize(Policy = ScopePolicies.DocumentRead)] async (
    [FromQuery] int? page,
    [FromQuery] int? size,
    [FromQuery] bool? favoriteOnly,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    [FromServices] IDocumentVersionRepository versionRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;
    var pageNum = Math.Max(1, page ?? 1);
    var pageSize = Math.Clamp(size ?? 20, 1, 100);
    var skip = (pageNum - 1) * pageSize;

    var docs = await docRepo.ListAsync(orgId, statusFilter: null, favoriteOnly: favoriteOnly, skip: skip, take: pageSize, cancellationToken: ct);
    var dtos = new List<DocumentResponseDto>();
    foreach (var d in docs.Where(x => x.Status != DocumentStatus.Deleted))
    {
        dtos.Add(await ToDocumentDtoAsync(d, versionRepo, orgId, ct));
    }

    return Results.Ok(ApiResponse<PagedListDto<DocumentResponseDto>>.Ok(
        data: new PagedListDto<DocumentResponseDto>(dtos, dtos.Count, pageNum, pageSize),
        correlationId: correlationId));
});

// GET /api/v1/public/documents/{documentId}
app.MapGet("/api/v1/public/documents/{documentId}", [Authorize(Policy = ScopePolicies.DocumentRead)] async (
    string documentId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    Document? doc = null;
    if (Guid.TryParse(documentId, out var docGuid))
    {
        doc = await docRepo.GetByIdAsync(orgId, docGuid, ct);
    }
    doc ??= await docRepo.GetByNumberAsync(orgId, documentId, ct);

    if (doc is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.DocumentNotFound,
            $"Document '{documentId}' was not found.",
            correlationId));
    }

    return Results.Ok(ApiResponse<DocumentResponseDto>.Ok(
        data: new DocumentResponseDto(
            DocumentId: doc.DocumentNumber,
            Title: doc.Title,
            Status: doc.Status.ToString().ToLowerInvariant(),
            VersionNumber: 1,
            FileSizeBytes: 42100,
            PageCount: 1,
            IsFavorite: doc.IsFavorite,
            CreatedAtUtc: doc.CreatedAtUtc),
        correlationId: correlationId));
});

// ---------------------------------------------------------
// Clear / delete (soft-delete documents, remove finished jobs)
// Uses the pdf:generate scope; a dedicated delete scope can be added later.
// ---------------------------------------------------------

// PUT /api/v1/public/documents/{documentId}/favorite
app.MapMethods("/api/v1/public/documents/{documentId}/favorite", ["PUT", "PATCH", "POST"], [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    string documentId,
    [FromBody] SetFavoriteRequestDto? req,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    Document? doc = null;
    if (Guid.TryParse(documentId, out var docGuid))
    {
        doc = await docRepo.GetByIdAsync(orgId, docGuid, ct);
    }
    doc ??= await docRepo.GetByNumberAsync(orgId, documentId, ct);

    if (doc is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.DocumentNotFound,
            $"Document '{documentId}' was not found.",
            correlationId));
    }

    var isFav = req?.IsFavorite ?? !doc.IsFavorite;
    await docRepo.SetFavoriteAsync(orgId, doc.Id, isFav, ct);

    return Results.Ok(ApiResponse<object>.Ok(
        data: new { documentId = doc.DocumentNumber, isFavorite = isFav },
        message: isFav ? "Document marked as favorite." : "Document removed from favorites.",
        correlationId: correlationId));
});

// PUT /api/v1/public/documents/{documentId}/archive
app.MapMethods("/api/v1/public/documents/{documentId}/archive", ["PUT", "PATCH", "POST"], [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    string documentId,
    [FromBody] SetArchiveRequestDto? req,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    Document? doc = null;
    if (Guid.TryParse(documentId, out var docGuid))
    {
        doc = await docRepo.GetByIdAsync(orgId, docGuid, ct);
    }
    doc ??= await docRepo.GetByNumberAsync(orgId, documentId, ct);

    if (doc is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.DocumentNotFound,
            $"Document '{documentId}' was not found.",
            correlationId));
    }

    var archive = req?.IsArchived ?? (doc.Status != DocumentStatus.Archived);
    var targetStatus = archive ? DocumentStatus.Archived : DocumentStatus.Active;
    await docRepo.SetStatusAsync(orgId, doc.Id, targetStatus, ct);

    return Results.Ok(ApiResponse<object>.Ok(
        data: new { documentId = doc.DocumentNumber, status = targetStatus.ToString().ToLowerInvariant(), isArchived = archive },
        message: archive ? "Document archived." : "Document restored from archive.",
        correlationId: correlationId));
});

// DELETE /api/v1/public/documents/{documentId}
app.MapDelete("/api/v1/public/documents/{documentId}", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    string documentId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    Document? doc = null;
    if (Guid.TryParse(documentId, out var docGuid))
    {
        doc = await docRepo.GetByIdAsync(orgId, docGuid, ct);
    }
    doc ??= await docRepo.GetByNumberAsync(orgId, documentId, ct);

    if (doc is null)
    {
        return Results.NotFound(ApiResponse.Fail(
            ErrorCodes.DocumentNotFound,
            $"Document '{documentId}' was not found.",
            correlationId));
    }

    await docRepo.SetStatusAsync(orgId, doc.Id, DocumentStatus.Deleted, ct);

    return Results.Ok(ApiResponse<object>.Ok(
        data: new { documentId = doc.DocumentNumber },
        message: "Document deleted.",
        correlationId: correlationId));
});

// DELETE /api/v1/public/documents  -> clear every document of this tenant
app.MapDelete("/api/v1/public/documents", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromServices] ITenantContext tenantContext,
    [FromServices] IDocumentRepository docRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    var docs = await docRepo.ListAsync(orgId, null, null, 0, 1000, ct);
    var cleared = 0;
    foreach (var d in docs.Where(x => x.Status != DocumentStatus.Deleted))
    {
        await docRepo.SetStatusAsync(orgId, d.Id, DocumentStatus.Deleted, ct);
        cleared++;
    }

    return Results.Ok(ApiResponse<object>.Ok(
        data: new { cleared },
        message: $"{cleared} document(s) cleared.",
        correlationId: correlationId));
});

// DELETE /api/v1/public/jobs  -> remove finished jobs (queued / running jobs are kept); ?all=true removes every job incl. stuck ones
app.MapDelete("/api/v1/public/jobs", [Authorize(Policy = ScopePolicies.PdfGenerate)] async (
    [FromServices] ITenantContext tenantContext,
    [FromServices] IJobMaintenanceService jobMaintenance,
    HttpContext ctx,
    CancellationToken ct,
    [FromQuery] bool all = false) =>
{
    var correlationId = GetCorrelationId(ctx);
    var cleared = all
        ? await jobMaintenance.ClearAllAsync(tenantContext.OrganizationId, ct)
        : await jobMaintenance.ClearFinishedAsync(tenantContext.OrganizationId, ct);

    return Results.Ok(ApiResponse<object>.Ok(
        data: new { cleared },
        message: all ? $"{cleared} job(s) cleared." : $"{cleared} finished job(s) cleared.",
        correlationId: correlationId));
});

Console.WriteLine();
Console.WriteLine("=================================================================");
Console.WriteLine("  PDFStudio Enterprise Platform - Public API Host (.NET 10 LTS)  ");
Console.WriteLine("  Full Route Catalog: /api/v1/public/*                           ");
Console.WriteLine("=================================================================");
Console.WriteLine();

app.Run();

public sealed record RenderPdfRequestDto(
    string? HtmlContent,
    string? PageSize = null,
    string? Orientation = null,
    double? MarginTopMm = null,
    double? MarginBottomMm = null,
    double? MarginLeftMm = null,
    double? MarginRightMm = null,
    bool? PrintBackground = null,
    string? Title = null,
    string? TemplateId = null,
    JsonElement? TemplateData = null,
    bool? DoNotSave = null);

public sealed record AsyncJobRequestDto(
    string? TemplateId = null,
    string? HtmlContent = null,
    JsonElement? Data = null,
    string? Title = null,
    int Priority = 100,
    string? IdempotencyKey = null,
    string? PageSize = null,
    string? Orientation = null,
    bool? PrintBackground = null);

public sealed record UploadDocumentDto(string? Title = null, string? PdfBase64 = null);

public sealed record SetFavoriteRequestDto(bool? IsFavorite = null);
public sealed record SetArchiveRequestDto(bool? IsArchived = null);

namespace PDFStudio.PublicApi
{
    public partial class Program { }
}
