using PDFStudio.Domain.Common;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Domain.Entities;

public sealed class AuditLog : TenantEntity
{
    public ActorType ActorType { get; set; } = ActorType.User;
    public string ActorId { get; set; } = string.Empty;
    public string? ActorName { get; set; }
    public string Action { get; set; } = string.Empty;
    public string ResourceType { get; set; } = string.Empty;
    public string ResourceId { get; set; } = string.Empty;
    public string? OldValuesJson { get; set; }
    public string? NewValuesJson { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
}

public sealed class SecurityLog : TenantEntity
{
    public SecuritySeverity Severity { get; set; } = SecuritySeverity.Info;
    public string EventCode { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string? DetailsJson { get; set; }
}

public sealed class SystemSetting
{
    public Guid? OrganizationId { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public sealed class License : TenantEntity
{
    public LicenseEdition Edition { get; set; } = LicenseEdition.Community;
    public LicenseStatus Status { get; set; } = LicenseStatus.Active;
    public DateTimeOffset StartsAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ExpiresAtUtc { get; set; }
    public int MaxGenerationsPerMonth { get; set; } = 1000;
    public int MaxApiClients { get; set; } = 5;
    public int MaxTemplates { get; set; } = 10;
    public string? FeaturesJson { get; set; }
}

public sealed class LicenseUsage : TenantEntity
{
    public string YearMonth { get; set; } = string.Empty;
    public int GenerationCount { get; set; }
    public long StorageBytesUsed { get; set; }
}

