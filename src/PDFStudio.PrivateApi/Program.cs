using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDFStudio.Application.DTOs;
using PDFStudio.Application.Repositories;
using PDFStudio.Application.Security;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;
using PDFStudio.Infrastructure;
using PDFStudio.Security;
using PDFStudio.Security.Authorization;
using PDFStudio.Security.Hashing;
using PDFStudio.Shared.Constants;
using PDFStudio.Shared.Http;

var builder = WebApplication.CreateBuilder(args);

// Register Core Infrastructure and Security
builder.Services.AddPdfStudioInfrastructure(builder.Configuration);
builder.Services.AddPdfStudioSecurity(builder.Configuration);

// CORS: allow the Angular dev server to call this API from the browser
builder.Services.AddCors(options => options.AddPolicy("web", policy => policy
    .WithOrigins("http://localhost:4200", "http://127.0.0.1:4200")
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithExposedHeaders("Content-Disposition", "X-Correlation-Id")));

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

// 2. Authentication & Tenant Resolution Middleware
// CORS must run before authentication so browser preflight requests succeed
app.UseCors("web");

app.UseAuthentication();
app.UseTenantContext();
app.UseAuthorization();

static string GetCorrelationId(HttpContext ctx) =>
    ctx.Items["X-Correlation-Id"]?.ToString() ?? $"CORR-{Guid.NewGuid():N}"[..18].ToUpperInvariant();

// ---------------------------------------------------------
// System Info Endpoints
// ---------------------------------------------------------
app.MapGet("/", (HttpContext ctx) =>
{
    var correlationId = GetCorrelationId(ctx);
    return Results.Ok(new
    {
        Product = "PDFStudio Enterprise PDF Platform - Private API Host",
        Version = "1.0.0-phase6",
        Runtime = ".NET 10.0 (LTS)",
        Timestamp = DateTimeOffset.UtcNow,
        CorrelationId = correlationId,
        PrivateApiBase = "/api/v1/private",
        AdministrationModules = new[]
        {
            "Templates Admin",
            "Documents Admin",
            "Tenants & Organizations Admin",
            "API Clients & Keys Admin",
            "Jobs Admin",
            "Storage Admin",
            "Webhooks Admin"
        }
    });
});

app.MapGet("/health", (HttpContext ctx) =>
{
    var correlationId = GetCorrelationId(ctx);
    return Results.Ok(ApiResponse<object>.Ok(
        data: new { Status = "Healthy", Service = "PDFStudio.PrivateApi" },
        message: "PDFStudio Private API service is running.",
        correlationId: correlationId));
});

// ---------------------------------------------------------
// 1. Template Administration (/api/v1/private/templates/*)
// ---------------------------------------------------------

// GET /api/v1/private/templates
app.MapGet("/api/v1/private/templates", [Authorize] async (
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
        CurrentVersionNumber: null,
        CreatedAtUtc: t.CreatedAtUtc)).ToList();

    return Results.Ok(ApiResponse<PagedListDto<TemplateResponseDto>>.Ok(
        data: new PagedListDto<TemplateResponseDto>(dtos, dtos.Count, pageNum, pageSize),
        correlationId: correlationId));
});

// POST /api/v1/private/templates
app.MapPost("/api/v1/private/templates", [Authorize] async (
    [FromBody] CreateTemplateRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] ITemplateRepository templateRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    if (string.IsNullOrWhiteSpace(request.Key) || string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.InitialHtmlContent))
    {
        return Results.BadRequest(ApiResponse.Fail(
            ErrorCodes.ValidationError,
            "Template Key, Name, and InitialHtmlContent are required.",
            correlationId));
    }

    var existing = await templateRepo.GetByKeyAsync(orgId, request.Key, ct);
    if (existing is not null)
    {
        return Results.Conflict(ApiResponse.Fail(
            ErrorCodes.Conflict,
            $"A template with key '{request.Key}' already exists for this organization.",
            correlationId));
    }

    var templateId = Guid.NewGuid();
    var template = new PdfTemplate
    {
        Id = templateId,
        OrganizationId = orgId,
        Key = request.Key,
        Name = request.Name,
        Description = request.Description,
        Status = TemplateStatus.Active,
        CurrentVersionId = null,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    await templateRepo.CreateAsync(template, ct);

    return Results.Created(
        uri: $"/api/v1/private/templates/{templateId}",
        value: ApiResponse<TemplateResponseDto>.Ok(
            data: new TemplateResponseDto(
                TemplateId: templateId,
                Key: template.Key,
                Name: template.Name,
                Description: template.Description,
                Status: "active",
                CurrentVersionNumber: 1,
                CreatedAtUtc: template.CreatedAtUtc),
            message: "Template created successfully.",
            correlationId: correlationId));
});

// POST /api/v1/private/templates/{templateId}/publish
app.MapPost("/api/v1/private/templates/{templateId:guid}/publish/{versionId:guid}", [Authorize] async (
    Guid templateId,
    Guid versionId,
    [FromServices] ITenantContext tenantContext,
    [FromServices] ITemplateRepository templateRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    var template = await templateRepo.GetByIdAsync(orgId, templateId, ct);
    if (template is null)
    {
        return Results.NotFound(ApiResponse.Fail(ErrorCodes.TemplateNotFound, "Template not found.", correlationId));
    }

    await templateRepo.SetCurrentVersionAsync(orgId, templateId, versionId, ct);
    await templateRepo.SetStatusAsync(orgId, templateId, TemplateStatus.Active, ct);

    return Results.Ok(ApiResponse.Ok(
        message: $"Template version {versionId} published successfully.",
        correlationId: correlationId));
});

// ---------------------------------------------------------
// 2. API Clients & API Keys (/api/v1/private/api-clients/*)
// ---------------------------------------------------------

// GET /api/v1/private/api-clients
app.MapGet("/api/v1/private/api-clients", [Authorize] async (
    [FromServices] ITenantContext tenantContext,
    [FromServices] IApiClientRepository clientRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    var clients = await clientRepo.ListAsync(orgId, ct);
    var clientDtos = new List<ApiClientResponseDto>();

    foreach (var client in clients)
    {
        var scopes = await clientRepo.GetScopesAsync(orgId, client.Id, ct);
        clientDtos.Add(new ApiClientResponseDto(
            ClientId: client.Id,
            OrganizationId: client.OrganizationId,
            Name: client.Name,
            Description: null,
            Status: client.Status.ToString().ToLowerInvariant(),
            CreatedAtUtc: client.CreatedAtUtc,
            Scopes: scopes));
    }

    return Results.Ok(ApiResponse<IReadOnlyList<ApiClientResponseDto>>.Ok(clientDtos, correlationId: correlationId));
});

// POST /api/v1/private/api-clients
app.MapPost("/api/v1/private/api-clients", [Authorize] async (
    [FromBody] CreateApiClientRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IApiClientRepository clientRepo,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    if (string.IsNullOrWhiteSpace(request.Name))
    {
        return Results.BadRequest(ApiResponse.Fail(ErrorCodes.ValidationError, "API Client Name is required.", correlationId));
    }

    var clientId = Guid.NewGuid();
    var client = new ApiClient
    {
        Id = clientId,
        OrganizationId = orgId,
        Name = request.Name,
        ClientType = ClientType.ApiKey,
        Status = ApiClientStatus.Active,
        RateLimitPerMinute = 60,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    await clientRepo.CreateAsync(client, ct);
    if (request.Scopes != null && request.Scopes.Count > 0)
    {
        await clientRepo.SetScopesAsync(orgId, clientId, request.Scopes, ct);
    }

    return Results.Created(
        uri: $"/api/v1/private/api-clients/{clientId}",
        value: ApiResponse<ApiClientResponseDto>.Ok(
            data: new ApiClientResponseDto(
                ClientId: clientId,
                OrganizationId: orgId,
                Name: client.Name,
                Description: null,
                Status: "active",
                CreatedAtUtc: client.CreatedAtUtc,
                Scopes: request.Scopes ?? []),
            message: "API Client created successfully.",
            correlationId: correlationId));
});

// POST /api/v1/private/api-clients/{clientId}/keys
app.MapPost("/api/v1/private/api-clients/{clientId:guid}/keys", [Authorize] async (
    Guid clientId,
    [FromBody] CreateApiKeyRequestDto request,
    [FromServices] ITenantContext tenantContext,
    [FromServices] IApiClientRepository clientRepo,
    [FromServices] IApiKeyRepository keyRepo,
    [FromServices] IApiKeyHasher keyHasher,
    HttpContext ctx,
    CancellationToken ct) =>
{
    var correlationId = GetCorrelationId(ctx);
    var orgId = tenantContext.OrganizationId;

    var client = await clientRepo.GetByIdAsync(orgId, clientId, ct);
    if (client is null)
    {
        return Results.NotFound(ApiResponse.Fail(ErrorCodes.NotFound, "API Client not found.", correlationId));
    }

    var (rawKey, keyPrefix, keyHash) = keyHasher.GenerateKey();
    var keyId = Guid.NewGuid();

    var apiKey = new ApiKey
    {
        Id = keyId,
        OrganizationId = orgId,
        ApiClientId = clientId,
        KeyPrefix = keyPrefix,
        KeyHash = keyHash,
        Status = ApiKeyStatus.Active,
        ExpiresAtUtc = request.ExpiresAtUtc,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        LastUsedAtUtc = null
    };

    await keyRepo.CreateAsync(apiKey, ct);

    return Results.Created(
        uri: $"/api/v1/private/api-clients/{clientId}/keys/{keyId}",
        value: ApiResponse<CreateApiKeyResponseDto>.Ok(
            data: new CreateApiKeyResponseDto(
                ApiKeyId: keyId,
                Name: request.Name ?? $"Key-{keyPrefix}",
                RawApiKey: rawKey,
                KeyPrefix: keyPrefix,
                ExpiresAtUtc: apiKey.ExpiresAtUtc,
                CreatedAtUtc: apiKey.CreatedAtUtc),
            message: "API Key created successfully. Store the RawApiKey safely, it will NOT be displayed again.",
            correlationId: correlationId));
});

Console.WriteLine();
Console.WriteLine("=================================================================");
Console.WriteLine("  PDFStudio Enterprise Platform - Private API Host (.NET 10 LTS) ");
Console.WriteLine("  Admin & Management Routes: /api/v1/private/*                   ");
Console.WriteLine("=================================================================");
Console.WriteLine();

app.Run();

namespace PDFStudio.PrivateApi
{
    public partial class Program { }
}
