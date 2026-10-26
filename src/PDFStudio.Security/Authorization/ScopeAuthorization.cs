using Microsoft.AspNetCore.Authorization;

namespace PDFStudio.Security.Authorization;

public sealed class HasScopeRequirement : IAuthorizationRequirement
{
    public string Scope { get; }

    public HasScopeRequirement(string scope)
    {
        Scope = scope ?? throw new ArgumentNullException(nameof(scope));
    }
}

public sealed class HasScopeHandler : AuthorizationHandler<HasScopeRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        HasScopeRequirement requirement)
    {
        if (context.User.Identity?.IsAuthenticated != true)
            return Task.CompletedTask;

        // Check if user has the specific scope or has admin/wildcard
        var hasScope = context.User.FindAll("scope")
            .Any(c => c.Value.Equals(requirement.Scope, StringComparison.OrdinalIgnoreCase) ||
                      c.Value.Equals("*", StringComparison.OrdinalIgnoreCase) ||
                      c.Value.Equals("admin", StringComparison.OrdinalIgnoreCase));

        if (hasScope)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

public static class ScopePolicies
{
    public const string PdfGenerate = "Scope:pdf:generate";
    public const string PdfRead = "Scope:pdf:read";
    public const string PdfMerge = "Scope:pdf:merge";
    public const string PdfSplit = "Scope:pdf:split";
    public const string TemplateRead = "Scope:template:read";
    public const string TemplateWrite = "Scope:template:write";
    public const string DocumentRead = "Scope:document:read";
    public const string DocumentDownload = "Scope:document:download";

    public static void AddScopePolicies(this AuthorizationOptions options)
    {
        var scopes = new[]
        {
            "pdf:generate",
            "pdf:read",
            "pdf:merge",
            "pdf:split",
            "template:read",
            "template:write",
            "document:read",
            "document:download"
        };

        foreach (var scope in scopes)
        {
            options.AddPolicy($"Scope:{scope}", policy =>
                policy.Requirements.Add(new HasScopeRequirement(scope)));
        }
    }
}

