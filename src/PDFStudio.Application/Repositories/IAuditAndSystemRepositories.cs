using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Application.Repositories;

public interface IAuditLogRepository
{
    Task AppendAsync(AuditLog log, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AuditLog>> QueryAsync(Guid organizationId, string? resourceType = null, DateTimeOffset? fromUtc = null, DateTimeOffset? toUtc = null, int skip = 0, int take = 50, CancellationToken cancellationToken = default);
}

public interface ISecurityLogRepository
{
    Task AppendAsync(SecurityLog log, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SecurityLog>> QueryAsync(Guid organizationId, SecuritySeverity? minSeverity = null, DateTimeOffset? fromUtc = null, DateTimeOffset? toUtc = null, int skip = 0, int take = 50, CancellationToken cancellationToken = default);
}

public interface ISystemSettingsRepository
{
    Task<string?> GetEffectiveValueAsync(string key, Guid? organizationId = null, CancellationToken cancellationToken = default);
    Task SetValueAsync(string key, string value, string? description = null, Guid? organizationId = null, CancellationToken cancellationToken = default);
    Task DeleteAsync(string key, Guid? organizationId = null, CancellationToken cancellationToken = default);
}

public interface ILicenseRepository
{
    Task<License?> GetActiveLicenseAsync(Guid organizationId, CancellationToken cancellationToken = default);
    Task<Guid> CreateLicenseAsync(License license, CancellationToken cancellationToken = default);
    Task UpdateLicenseAsync(License license, CancellationToken cancellationToken = default);
    Task<LicenseUsage?> GetUsageAsync(Guid organizationId, string yearMonth, CancellationToken cancellationToken = default);
    Task IncrementGenerationCountAsync(Guid organizationId, string yearMonth, int count = 1, CancellationToken cancellationToken = default);
}

public interface ISequenceService
{
    Task<string> NextDocumentNumberAsync(Guid organizationId, CancellationToken cancellationToken = default);
    Task<string> NextJobNumberAsync(Guid organizationId, CancellationToken cancellationToken = default);
}

