using PDFStudio.Domain.Common;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Domain.Entities;

public sealed class Organization : Entity
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public OrganizationStatus Status { get; set; } = OrganizationStatus.Active;
}

public sealed class User : TenantEntity
{
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public int FailedLoginAttempts { get; set; }
    public DateTimeOffset? LockoutEndUtc { get; set; }
    public DateTimeOffset? LastLoginAtUtc { get; set; }
}

public sealed class Role : TenantEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsSystem { get; set; }
}

public sealed class Permission
{
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
}

public sealed class ApiClient : TenantEntity
{
    public string Name { get; set; } = string.Empty;
    public ClientType ClientType { get; set; } = ClientType.ApiKey;
    public ApiClientStatus Status { get; set; } = ApiClientStatus.Active;
    public int RateLimitPerMinute { get; set; } = 60;
}

public sealed class ApiKey : TenantEntity
{
    public Guid ApiClientId { get; set; }
    public string KeyPrefix { get; set; } = string.Empty;
    public string KeyHash { get; set; } = string.Empty;
    public ApiKeyStatus Status { get; set; } = ApiKeyStatus.Active;
    public DateTimeOffset? ExpiresAtUtc { get; set; }
    public DateTimeOffset? LastUsedAtUtc { get; set; }
}

public sealed class ApiScope
{
    public string ScopeName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public sealed class ApiUsage : TenantEntity
{
    public Guid ApiClientId { get; set; }
    public DateTimeOffset HourBucketUtc { get; set; }
    public long RequestCount { get; set; }
    public long ErrorCount { get; set; }
}

public sealed class ApiRateLimit : TenantEntity
{
    public Guid ApiClientId { get; set; }
    public int RequestsPerMinute { get; set; } = 60;
    public int BurstLimit { get; set; } = 100;
}

