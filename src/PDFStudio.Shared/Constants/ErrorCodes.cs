namespace PDFStudio.Shared.Constants;

public static class ErrorCodes
{
    // Common
    public const string InternalError = "INTERNAL_SERVER_ERROR";
    public const string ValidationError = "VALIDATION_FAILED";
    public const string Unauthorized = "UNAUTHORIZED";
    public const string Forbidden = "FORBIDDEN";
    public const string NotFound = "NOT_FOUND";
    public const string Conflict = "CONFLICT";
    public const string RateLimitExceeded = "RATE_LIMIT_EXCEEDED";

    // Tenancy & Auth
    public const string TenantNotFound = "TENANT_NOT_FOUND";
    public const string TenantSuspended = "TENANT_SUSPENDED";
    public const string InvalidApiKey = "INVALID_API_KEY";
    public const string ApiKeyRevoked = "API_KEY_REVOKED";
    public const string ApiKeyExpired = "API_KEY_EXPIRED";
    public const string InsufficientScope = "INSUFFICIENT_SCOPE";
    public const string UserNotFound = "USER_NOT_FOUND";
    public const string AccountLocked = "ACCOUNT_LOCKED";

    // Template
    public const string TemplateNotFound = "TEMPLATE_NOT_FOUND";
    public const string TemplateVersionNotFound = "TEMPLATE_VERSION_NOT_FOUND";
    public const string TemplateVersionNotPublished = "TEMPLATE_VERSION_NOT_PUBLISHED";
    public const string TemplateValidationFailed = "TEMPLATE_VALIDATION_FAILED";
    public const string TemplateSyntaxError = "TEMPLATE_SYNTAX_ERROR";

    // PDF Engine
    public const string PdfGenerationFailed = "PDF_GENERATION_FAILED";
    public const string PdfMergeFailed = "PDF_MERGE_FAILED";
    public const string PdfSplitFailed = "PDF_SPLIT_FAILED";
    public const string PdfStampFailed = "PDF_STAMP_FAILED";
    public const string PdfWatermarkFailed = "PDF_WATERMARK_FAILED";
    public const string InvalidPdfContent = "INVALID_PDF_CONTENT";

    // Jobs
    public const string JobNotFound = "JOB_NOT_FOUND";
    public const string JobAlreadyCompleted = "JOB_ALREADY_COMPLETED";
    public const string JobFailed = "JOB_FAILED";

    // Document & Storage
    public const string DocumentNotFound = "DOCUMENT_NOT_FOUND";
    public const string StorageError = "STORAGE_ERROR";
    public const string FileTooLarge = "FILE_TOO_LARGE";

    // Licensing
    public const string LicenseExpired = "LICENSE_EXPIRED";
    public const string LicenseQuotaExceeded = "LICENSE_QUOTA_EXCEEDED";
}

