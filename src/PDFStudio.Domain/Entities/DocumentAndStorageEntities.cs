using PDFStudio.Domain.Common;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Domain.Entities;

public sealed class StorageObject : TenantEntity
{
    public string StorageProvider { get; set; } = "Local";
    public string StorageKey { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/pdf";
    public long SizeBytes { get; set; }
    public StorageStatus Status { get; set; } = StorageStatus.Active;
}

public sealed class Document : TenantEntity
{
    public string DocumentNumber { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public DocumentStatus Status { get; set; } = DocumentStatus.Active;
    public bool IsFavorite { get; set; }
    public int? RetentionDays { get; set; }
    public DateTimeOffset? ExpiresAtUtc { get; set; }
    public Guid? CurrentVersionId { get; set; }
}

public sealed class DocumentVersion : TenantEntity
{
    public Guid DocumentId { get; set; }
    public int VersionNumber { get; set; } = 1;
    public Guid StorageObjectId { get; set; }
    public long FileSizeBytes { get; set; }
    public int PageCount { get; set; }
    public string Sha256Checksum { get; set; } = string.Empty;
    public Guid? GeneratedFromTemplateId { get; set; }
    public Guid? GeneratedFromJobId { get; set; }
}

public sealed class DocumentMetadata : TenantEntity
{
    public Guid DocumentId { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

