namespace PDFStudio.SDK.Models;

public sealed record SdkGeneratePdfRequest(
    string TemplateId,
    object Data,
    string? Title = null,
    string? Orientation = null,
    string? PageSize = null,
    IReadOnlyDictionary<string, string>? Metadata = null);

public sealed record SdkGeneratePdfResponse(
    string DocumentId,
    string Status,
    long? FileSizeBytes,
    int? PageCount,
    string? DownloadUrl);

public sealed record SdkCreateJobRequest(
    string TemplateId,
    object Data,
    string? Title = null,
    int Priority = 100,
    string? IdempotencyKey = null);

public sealed record SdkJobResponse(
    string JobId,
    string Status,
    string JobType,
    int AttemptCount,
    string? ResultDocumentId,
    string? ErrorMessage,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? CompletedAtUtc);

public sealed record SdkDocumentResponse(
    string DocumentId,
    string Title,
    string Status,
    int VersionNumber,
    long FileSizeBytes,
    int PageCount,
    bool IsFavorite,
    DateTimeOffset CreatedAtUtc,
    IReadOnlyDictionary<string, string>? Metadata);

public sealed record SdkTemplateResponse(
    Guid TemplateId,
    string Key,
    string Name,
    string? Description,
    string Status,
    int? CurrentVersionNumber,
    DateTimeOffset CreatedAtUtc);

