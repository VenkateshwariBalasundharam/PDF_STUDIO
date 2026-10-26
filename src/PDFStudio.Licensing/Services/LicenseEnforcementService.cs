using System.Collections.Concurrent;
using PDFStudio.Licensing.Models;

namespace PDFStudio.Licensing.Services;

public class LicenseQuotaExceededException : Exception
{
    public LicenseQuotaExceededException(string message) : base(message) { }
}

public interface ILicenseEnforcementService
{
    void SetLicense(Guid orgId, LicenseCertificate certificate);
    LicenseCertificate GetCurrentLicense(Guid orgId);
    void EnsureCanGeneratePdf(Guid orgId);
    void EnsureCanStoreBytes(Guid orgId, long additionalBytes);
    void EnsureCanEnqueueJob(Guid orgId);
    void RecordPdfGenerated(Guid orgId);
    void RecordJobCompleted(Guid orgId);
    void RecordStorageDelta(Guid orgId, long deltaBytes);
    void RecordTemplatesCount(Guid orgId, int count);
    TenantUsageMetrics GetUsageMetrics(Guid orgId);
}

public sealed class LicenseEnforcementService : ILicenseEnforcementService
{
    private readonly ConcurrentDictionary<Guid, LicenseCertificate> _licenses = new();
    private readonly ConcurrentDictionary<Guid, UsageState> _usage = new();

    private sealed class UsageState
    {
        public long MonthlyPdfGenerations;
        public long CurrentStorageBytes;
        public int CurrentTemplatesCount;
        public int ActiveJobsCount;
    }

    public void SetLicense(Guid orgId, LicenseCertificate certificate)
    {
        _licenses[orgId] = certificate;
    }

    public LicenseCertificate GetCurrentLicense(Guid orgId)
    {
        return _licenses.GetOrAdd(orgId, id =>
        {
            var defaultLimits = LicenseLimits.ForTier(LicenseTier.Community);
            return new LicenseCertificate(
                OrganizationId: id,
                OrganizationName: "Default Organization",
                Tier: LicenseTier.Community,
                IssuedAtUtc: DateTimeOffset.UtcNow,
                ExpiresAtUtc: DateTimeOffset.UtcNow.AddYears(1),
                Limits: defaultLimits,
                Signature: "DEFAULT"
            );
        });
    }

    public void EnsureCanGeneratePdf(Guid orgId)
    {
        var license = GetCurrentLicense(orgId);
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());

        if (license.Limits.MaxMonthlyPdfGenerations != -1 &&
            Interlocked.Read(ref usage.MonthlyPdfGenerations) >= license.Limits.MaxMonthlyPdfGenerations)
        {
            throw new LicenseQuotaExceededException(
                $"Monthly PDF generation quota of {license.Limits.MaxMonthlyPdfGenerations} exceeded for tier '{license.Tier}'. Please upgrade to Professional or Enterprise.");
        }
    }

    public void EnsureCanStoreBytes(Guid orgId, long additionalBytes)
    {
        var license = GetCurrentLicense(orgId);
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());

        if (license.Limits.MaxStorageBytes != -1 &&
            (Interlocked.Read(ref usage.CurrentStorageBytes) + additionalBytes) > license.Limits.MaxStorageBytes)
        {
            throw new LicenseQuotaExceededException(
                $"Storage quota of {license.Limits.MaxStorageBytes / (1024 * 1024)} MB exceeded for tier '{license.Tier}'.");
        }
    }

    public void EnsureCanEnqueueJob(Guid orgId)
    {
        var license = GetCurrentLicense(orgId);
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());

        if (license.Limits.MaxConcurrentJobs != -1 &&
            Volatile.Read(ref usage.ActiveJobsCount) >= license.Limits.MaxConcurrentJobs)
        {
            throw new LicenseQuotaExceededException(
                $"Maximum concurrent background jobs limit of {license.Limits.MaxConcurrentJobs} reached for tier '{license.Tier}'.");
        }

        Interlocked.Increment(ref usage.ActiveJobsCount);
    }

    public void RecordPdfGenerated(Guid orgId)
    {
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());
        Interlocked.Increment(ref usage.MonthlyPdfGenerations);
    }

    public void RecordJobCompleted(Guid orgId)
    {
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());
        if (usage.ActiveJobsCount > 0)
        {
            Interlocked.Decrement(ref usage.ActiveJobsCount);
        }
    }

    public void RecordStorageDelta(Guid orgId, long deltaBytes)
    {
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());
        Interlocked.Add(ref usage.CurrentStorageBytes, deltaBytes);
    }

    public void RecordTemplatesCount(Guid orgId, int count)
    {
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());
        Volatile.Write(ref usage.CurrentTemplatesCount, count);
    }

    public TenantUsageMetrics GetUsageMetrics(Guid orgId)
    {
        var usage = _usage.GetOrAdd(orgId, _ => new UsageState());
        return new TenantUsageMetrics(
            CurrentMonthPdfGenerations: Interlocked.Read(ref usage.MonthlyPdfGenerations),
            CurrentStorageBytes: Interlocked.Read(ref usage.CurrentStorageBytes),
            CurrentTemplatesCount: Volatile.Read(ref usage.CurrentTemplatesCount),
            ActiveJobsCount: Volatile.Read(ref usage.ActiveJobsCount)
        );
    }
}
