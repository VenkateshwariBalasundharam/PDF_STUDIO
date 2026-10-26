using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Enums;
using PDFStudio.Security.Hashing;

namespace PDFStudio.Security.Authentication;

public sealed class ApiKeyAuthenticationOptions : AuthenticationSchemeOptions
{
    public const string DefaultScheme = "ApiKey";
    public string HeaderName { get; set; } = "X-Api-Key";
}

public sealed class ApiKeyAuthenticationHandler : AuthenticationHandler<ApiKeyAuthenticationOptions>
{
    private readonly IApiKeyRepository _apiKeyRepository;
    private readonly IApiClientRepository _apiClientRepository;
    private readonly IApiKeyHasher _hasher;

    public ApiKeyAuthenticationHandler(
        IOptionsMonitor<ApiKeyAuthenticationOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        IApiKeyRepository apiKeyRepository,
        IApiClientRepository apiClientRepository,
        IApiKeyHasher hasher)
        : base(options, logger, encoder)
    {
        _apiKeyRepository = apiKeyRepository;
        _apiClientRepository = apiClientRepository;
        _hasher = hasher;
    }

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        string? rawKey = null;

        // 1. Check custom header
        if (Request.Headers.TryGetValue(Options.HeaderName, out var headerValues))
        {
            rawKey = headerValues.FirstOrDefault();
        }

        // 2. Fallback to Authorization header
        if (string.IsNullOrWhiteSpace(rawKey) && Request.Headers.TryGetValue("Authorization", out var authValues))
        {
            var authHeader = authValues.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(authHeader))
            {
                if (authHeader.StartsWith("Bearer ps_", StringComparison.OrdinalIgnoreCase))
                {
                    rawKey = authHeader["Bearer ".Length..].Trim();
                }
                else if (authHeader.StartsWith("ApiKey ", StringComparison.OrdinalIgnoreCase))
                {
                    rawKey = authHeader["ApiKey ".Length..].Trim();
                }
            }
        }

        if (string.IsNullOrWhiteSpace(rawKey))
        {
            return AuthenticateResult.NoResult();
        }

        // 3. Extract prefix
        int lastUnderscore = rawKey.LastIndexOf('_');
        if (lastUnderscore <= 0)
        {
            return AuthenticateResult.Fail("Malformed API key structure.");
        }

        string prefix = rawKey[..lastUnderscore];

        // 4. Lookup key by prefix
        var apiKeyEntity = await _apiKeyRepository.FindByPrefixAsync(prefix, Context.RequestAborted);
        if (apiKeyEntity is null)
        {
            return AuthenticateResult.Fail("API key not recognized.");
        }

        // 5. Verify HMAC hash
        if (!_hasher.VerifyKey(rawKey, apiKeyEntity.KeyHash))
        {
            return AuthenticateResult.Fail("Invalid API key credentials.");
        }

        // 6. Check revocation and expiration
        if (apiKeyEntity.Status == ApiKeyStatus.Revoked)
        {
            return AuthenticateResult.Fail("API key has been revoked.");
        }

        if (apiKeyEntity.Status == ApiKeyStatus.Expired ||
            (apiKeyEntity.ExpiresAtUtc.HasValue && apiKeyEntity.ExpiresAtUtc.Value < DateTimeOffset.UtcNow))
        {
            return AuthenticateResult.Fail("API key has expired.");
        }

        // 7. Verify API client is active and fetch scopes
        var client = await _apiClientRepository.GetByIdAsync(
            apiKeyEntity.OrganizationId,
            apiKeyEntity.ApiClientId,
            Context.RequestAborted);

        if (client is null || client.Status != ApiClientStatus.Active)
        {
            return AuthenticateResult.Fail("Associated API client is disabled or inactive.");
        }

        var scopes = await _apiClientRepository.GetScopesAsync(
            apiKeyEntity.OrganizationId,
            apiKeyEntity.ApiClientId,
            Context.RequestAborted);

        // 8. Background touch last used
        _ = _apiKeyRepository.TouchLastUsedAsync(apiKeyEntity.Id, CancellationToken.None);

        // 9. Build principal with tenant and scopes
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, apiKeyEntity.ApiClientId.ToString()),
            new(ClaimTypes.Name, client.Name),
            new("org_id", apiKeyEntity.OrganizationId.ToString()),
            new("client_id", apiKeyEntity.ApiClientId.ToString()),
            new("key_id", apiKeyEntity.Id.ToString()),
            new("auth_type", "api_key")
        };

        foreach (var scope in scopes)
        {
            claims.Add(new Claim("scope", scope));
        }

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, Scheme.Name);

        return AuthenticateResult.Success(ticket);
    }
}

