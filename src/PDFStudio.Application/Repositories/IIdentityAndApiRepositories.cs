using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Application.Repositories;

public interface IOrganizationRepository
{
    Task<Organization?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Organization?> GetByCodeAsync(string code, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Organization>> ListAsync(CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(Organization org, CancellationToken cancellationToken = default);
    Task UpdateStatusAsync(Guid id, OrganizationStatus status, CancellationToken cancellationToken = default);
}

public interface IUserRepository
{
    Task<User?> GetByIdAsync(Guid organizationId, Guid userId, CancellationToken cancellationToken = default);
    Task<User?> GetByEmailAsync(Guid organizationId, string email, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<User>> ListAsync(Guid organizationId, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(User user, CancellationToken cancellationToken = default);
    Task UpdateAsync(User user, CancellationToken cancellationToken = default);
    Task RecordLoginSuccessAsync(Guid organizationId, Guid userId, CancellationToken cancellationToken = default);
    Task RecordLoginFailureAsync(Guid organizationId, Guid userId, int maxAttempts, TimeSpan lockoutDuration, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetRolesAsync(Guid organizationId, Guid userId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetPermissionsAsync(Guid organizationId, Guid userId, CancellationToken cancellationToken = default);
}

public interface IRoleRepository
{
    Task<Role?> GetByIdAsync(Guid organizationId, Guid roleId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Role>> ListAsync(Guid organizationId, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(Role role, CancellationToken cancellationToken = default);
    Task SetPermissionsAsync(Guid organizationId, Guid roleId, IReadOnlyList<string> permissionCodes, CancellationToken cancellationToken = default);
    Task AssignUserRoleAsync(Guid organizationId, Guid userId, Guid roleId, CancellationToken cancellationToken = default);
    Task RemoveUserRoleAsync(Guid organizationId, Guid userId, Guid roleId, CancellationToken cancellationToken = default);
}

public interface IPermissionCatalog
{
    Task<IReadOnlyList<Permission>> ListAllAsync(CancellationToken cancellationToken = default);
}

public interface IApiClientRepository
{
    Task<ApiClient?> GetByIdAsync(Guid organizationId, Guid clientId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ApiClient>> ListAsync(Guid organizationId, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(ApiClient client, CancellationToken cancellationToken = default);
    Task UpdateStatusAsync(Guid organizationId, Guid clientId, ApiClientStatus status, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetScopesAsync(Guid organizationId, Guid clientId, CancellationToken cancellationToken = default);
    Task SetScopesAsync(Guid organizationId, Guid clientId, IReadOnlyList<string> scopes, CancellationToken cancellationToken = default);
}

public interface IApiKeyRepository
{
    Task<ApiKey?> FindByPrefixAsync(string keyPrefix, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ApiKey>> ListByClientAsync(Guid organizationId, Guid apiClientId, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(ApiKey apiKey, CancellationToken cancellationToken = default);
    Task RevokeAsync(Guid organizationId, Guid apiKeyId, CancellationToken cancellationToken = default);
    Task TouchLastUsedAsync(Guid apiKeyId, CancellationToken cancellationToken = default);
}

public interface IApiScopeCatalog
{
    Task<IReadOnlyList<ApiScope>> ListAllAsync(CancellationToken cancellationToken = default);
}

public interface IApiUsageRepository
{
    Task IncrementBucketAsync(Guid organizationId, Guid apiClientId, DateTimeOffset hourBucketUtc, bool isError, CancellationToken cancellationToken = default);
    Task<long> GetUsageCountAsync(Guid organizationId, Guid apiClientId, DateTimeOffset fromUtc, DateTimeOffset toUtc, CancellationToken cancellationToken = default);
}

public interface IRateLimitRepository
{
    Task<ApiRateLimit?> GetEffectiveAsync(Guid organizationId, Guid apiClientId, CancellationToken cancellationToken = default);
    Task UpsertAsync(ApiRateLimit rateLimit, CancellationToken cancellationToken = default);
}

