using System.Text.Json;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Application.DTOs;

public sealed record PagedListDto<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int PageNumber,
    int PageSize);

// -------------------------------------------------------------
// PDF Operations DTOs
// -------------------------------------------------------------
public sealed record GeneratePdfRequestDto(
    string TemplateId,
    JsonElement Data,
    string? Title = null,
    string? Orientation = null,
    string? PageSize = null,
    IReadOnlyDictionary<string, string>? Metadata = null);

public sealed record GeneratePdfResponseDto(
    string DocumentId,
    string Status,
    long? FileSizeBytes = null,
    int? PageCount = null,
    string? DownloadUrl = null);

public sealed record CreateJobRequestDto(
    string TemplateId,
    JsonElement Data,
    string? Title = null,
    int Priority = 100,
    string? IdempotencyKey = null);

public sealed record JobResponseDto(
    string JobId,
    string Status,
    string JobType,
    int AttemptCount,
    string? ResultDocumentId = null,
    string? ErrorMessage = null,
    DateTimeOffset CreatedAtUtc = default,
    DateTimeOffset? CompletedAtUtc = null);

public sealed record MergePdfRequestDto(
    IReadOnlyList<string> DocumentIds,
    string? OutputTitle = null);

public sealed record SplitPdfRequestDto(
    string DocumentId,
    IReadOnlyList<int> Pages,
    string? OutputTitle = null);

public sealed record WatermarkPdfRequestDto(
    string DocumentId,
    string WatermarkText,
    double Opacity = 0.3,
    double RotationAngleDegrees = 45,
    string ColorHex = "#888888");

public sealed record StampPdfRequestDto(
    string DocumentId,
    string StampText,
    string Position = "BottomRight",
    double Opacity = 0.8,
    string ColorHex = "#FF0000");

public sealed record DocumentResponseDto(
    string DocumentId,
    string Title,
    string Status,
    int VersionNumber,
    long FileSizeBytes,
    int PageCount,
    bool IsFavorite,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyDictionary<string, string>? Metadata = null);

public sealed record TemplateResponseDto(
    Guid TemplateId,
    string Key,
    string Name,
    string? Description,
    string Status,
    int? CurrentVersionNumber,
    DateTimeOffset CreatedAtUtc);

public sealed record TemplateDetailResponseDto(
    Guid TemplateId,
    string Key,
    string Name,
    string? Description,
    string Status,
    int? CurrentVersionNumber,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyList<TemplateVersionSummaryDto> Versions);

public sealed record TemplateVersionSummaryDto(
    Guid VersionId,
    int VersionNumber,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? PublishedAtUtc);

public sealed record ValidateTemplateRequestDto(
    string TemplateId,
    JsonElement Data);

public sealed record ValidateTemplateResponseDto(
    bool IsValid,
    IReadOnlyList<string> Errors);

// -------------------------------------------------------------
// Admin / Management DTOs (for Private API)
// -------------------------------------------------------------
public sealed record CreateTemplateRequestDto(
    string Key,
    string Name,
    string? Description,
    string InitialHtmlContent,
    string? HeaderHtml = null,
    string? FooterHtml = null,
    string? StylesCss = null);

public sealed record CreateTemplateVersionRequestDto(
    string HtmlContent,
    string? HeaderHtml = null,
    string? FooterHtml = null,
    string? StylesCss = null,
    string? ChangeNotes = null);

public sealed record CreateUserRequestDto(
    string Email,
    string FullName,
    string Password,
    IReadOnlyList<string>? Roles = null);

public sealed record UserResponseDto(
    Guid UserId,
    Guid OrganizationId,
    string Email,
    string FullName,
    string Status,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? LastLoginAtUtc,
    IReadOnlyList<string> Roles);

public sealed record CreateApiClientRequestDto(
    string Name,
    string? Description,
    IReadOnlyList<string> Scopes);

public sealed record ApiClientResponseDto(
    Guid ClientId,
    Guid OrganizationId,
    string Name,
    string? Description,
    string Status,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyList<string> Scopes);

public sealed record CreateApiKeyRequestDto(
    Guid ApiClientId,
    string Name,
    DateTimeOffset? ExpiresAtUtc = null);

public sealed record CreateApiKeyResponseDto(
    Guid ApiKeyId,
    string Name,
    string RawApiKey,
    string KeyPrefix,
    DateTimeOffset? ExpiresAtUtc,
    DateTimeOffset CreatedAtUtc);

public sealed record CreateWebhookRequestDto(
    string TargetUrl,
    string Secret,
    IReadOnlyList<string> SubscribedEvents);

public sealed record WebhookResponseDto(
    Guid WebhookId,
    string TargetUrl,
    string Status,
    IReadOnlyList<string> SubscribedEvents,
    DateTimeOffset CreatedAtUtc);

public sealed record SystemSettingDto(
    string Key,
    string Value,
    string? Description);
