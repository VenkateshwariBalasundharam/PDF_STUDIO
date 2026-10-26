using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using PDFStudio.Application.Security;
using PDFStudio.Shared.Constants;
using PDFStudio.Shared.Http;

namespace PDFStudio.Security.Tenancy;

public sealed class TenantContext : ITenantContext
{
    public Guid OrganizationId { get; private set; }
    public string? OrganizationCode { get; private set; }
    public bool IsResolved => OrganizationId != Guid.Empty;

    public void SetTenant(Guid organizationId, string? organizationCode = null)
    {
        if (IsResolved && OrganizationId != organizationId)
            throw new InvalidOperationException("Tenant context has already been initialized and cannot be changed.");

        OrganizationId = organizationId;
        OrganizationCode = organizationCode;
    }
}

public sealed class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;

    public TenantResolutionMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, ITenantContext tenantContext)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var orgClaim = context.User.FindFirst("org_id")?.Value;
            if (Guid.TryParse(orgClaim, out var orgId))
            {
                var orgCode = context.User.FindFirst("org_code")?.Value;
                if (tenantContext is TenantContext mutableContext)
                {
                    mutableContext.SetTenant(orgId, orgCode);
                }
            }
        }

        await _next(context);
    }
}

