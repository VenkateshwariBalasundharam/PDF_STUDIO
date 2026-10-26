namespace PDFStudio.Licensing.Models;

public enum LicenseTier
{
    Trial = 0,
    Community = 1,
    Professional = 2,
    Enterprise = 3
}

public sealed record LicenseLimits(
    long MaxMonthlyPdfGenerations,
    int MaxApiCallsPerMinute,
    long MaxStorageBytes,
    int MaxTemplates,
    int MaxUsers,
    int MaxOrganizations,
    int MaxConcurrentJobs)
{
    public static LicenseLimits ForTier(LicenseTier tier) => tier switch
    {
        LicenseTier.Trial => new LicenseLimits(
            MaxMonthlyPdfGenerations: 100,
            MaxApiCallsPerMinute: 15,
            MaxStorageBytes: 100 * 1024 * 1024, // 100 MB
            MaxTemplates: 3,
            MaxUsers: 2,
            MaxOrganizations: 1,
            MaxConcurrentJobs: 1),

        LicenseTier.Community => new LicenseLimits(
            MaxMonthlyPdfGenerations: 500,
            MaxApiCallsPerMinute: 60,
            MaxStorageBytes: 1024L * 1024 * 1024, // 1 GB
            MaxTemplates: 10,
            MaxUsers: 5,
            MaxOrganizations: 1,
            MaxConcurrentJobs: 2),

        LicenseTier.Professional => new LicenseLimits(
            MaxMonthlyPdfGenerations: 10_000,
            MaxApiCallsPerMinute: 300,
            MaxStorageBytes: 50L * 1024 * 1024 * 1024, // 50 GB
            MaxTemplates: 50,
            MaxUsers: 25,
            MaxOrganizations: 5,
            MaxConcurrentJobs: 8),

        LicenseTier.Enterprise => new LicenseLimits(
            MaxMonthlyPdfGenerations: -1, // Unlimited
            MaxApiCallsPerMinute: 1200,
            MaxStorageBytes: -1, // Unlimited
            MaxTemplates: -1,
            MaxUsers: -1,
            MaxOrganizations: -1,
            MaxConcurrentJobs: 32),

        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, null)
    };
}

public sealed record LicenseCertificate(
    Guid OrganizationId,
    string OrganizationName,
    LicenseTier Tier,
    DateTimeOffset IssuedAtUtc,
    DateTimeOffset ExpiresAtUtc,
    LicenseLimits Limits,
    string Signature);

public sealed record TenantUsageMetrics(
    long CurrentMonthPdfGenerations,
    long CurrentStorageBytes,
    int CurrentTemplatesCount,
    int ActiveJobsCount);

