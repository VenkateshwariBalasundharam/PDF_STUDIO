namespace PDFStudio.Domain.Enums;

public enum OrganizationStatus : short
{
    Active = 1,
    Suspended = 2,
    Deleted = 3
}

public enum ClientType : short
{
    ApiKey = 1,
    OAuthClient = 2,
    InternalService = 3
}

public enum ApiClientStatus : short
{
    Active = 1,
    Disabled = 2
}

public enum ApiKeyStatus : short
{
    Active = 1,
    Revoked = 2,
    Expired = 3
}

public enum TemplateStatus : short
{
    Active = 1,
    Inactive = 2,
    Archived = 3
}

public enum TemplateVersionStatus : short
{
    Draft = 1,
    Published = 2,
    Deprecated = 3
}

public enum TemplateFieldDataType : short
{
    String = 1,
    Number = 2,
    Boolean = 3,
    Date = 4,
    Array = 5,
    Object = 6
}

public enum StorageStatus : short
{
    Active = 1,
    PendingDelete = 2,
    Deleted = 3
}

public enum DocumentStatus : short
{
    Active = 1,
    Archived = 2,
    Deleted = 3,
    Expired = 4
}

public enum JobType : short
{
    Generate = 1,
    Merge = 2,
    Split = 3,
    Stamp = 4,
    Watermark = 5,
    Batch = 6
}

public enum JobStatus : short
{
    Queued = 1,
    Processing = 2,
    Completed = 3,
    Failed = 4,
    Cancelled = 5,
    Expired = 6
}

public enum WebhookEventStatus : short
{
    Pending = 1,
    Delivered = 2,
    Retrying = 3,
    DeadLetter = 4
}

public enum ActorType : short
{
    User = 1,
    ApiClient = 2,
    System = 3
}

public enum SecuritySeverity : short
{
    Info = 1,
    Warning = 2,
    High = 3,
    Critical = 4
}

public enum LicenseEdition : short
{
    Trial = 1,
    Community = 2,
    Professional = 3,
    Enterprise = 4
}

public enum LicenseStatus : short
{
    Active = 1,
    Expired = 2,
    Suspended = 3
}

