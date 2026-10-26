namespace PDFStudio.Application.Security;

public interface ITenantContext
{
    Guid OrganizationId { get; }
    string? OrganizationCode { get; }
    bool IsResolved { get; }
}

public interface ICurrentUser
{
    Guid UserId { get; }
    string Email { get; }
    IReadOnlyList<string> Roles { get; }
    IReadOnlyList<string> Permissions { get; }
    bool IsAuthenticated { get; }
}

public interface IApiClientContext
{
    Guid ClientId { get; }
    string ClientName { get; }
    IReadOnlyList<string> Scopes { get; }
    bool IsAuthenticated { get; }
}

