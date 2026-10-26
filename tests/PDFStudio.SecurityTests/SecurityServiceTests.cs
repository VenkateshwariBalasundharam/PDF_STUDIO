using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using PDFStudio.Security.Hashing;
using PDFStudio.Security.Tenancy;
using PDFStudio.Security.Tokens;

namespace PDFStudio.SecurityTests;

public class SecurityServiceTests
{
    private readonly IConfiguration _config;

    public SecurityServiceTests()
    {
        var inMemory = new Dictionary<string, string?>
        {
            ["Security:ApiKeyPepper"] = "UnitTest_Secret_Pepper_2026_Enterprise!",
            ["Jwt:SecretKey"] = "UnitTest_Super_Long_JWT_Signing_Key_For_HmacSha256_Compliance_2026",
            ["Jwt:Issuer"] = "PDFStudio.TestIssuer",
            ["Jwt:Audience"] = "PDFStudio.TestAudience"
        };
        _config = new ConfigurationBuilder().AddInMemoryCollection(inMemory).Build();
    }

    [Fact]
    public void ApiKeyHasher_GenerateAndVerify_Succeeds()
    {
        var hasher = new ApiKeyHasher(_config);

        var (rawKey, prefix, hashHex) = hasher.GenerateKey();

        Assert.StartsWith("ps_live_", prefix);
        Assert.StartsWith(prefix, rawKey);
        Assert.NotEmpty(hashHex);

        bool isValid = hasher.VerifyKey(rawKey, hashHex);
        Assert.True(isValid);
    }

    [Fact]
    public void ApiKeyHasher_CorruptedKey_FailsVerification()
    {
        var hasher = new ApiKeyHasher(_config);
        var (rawKey, _, hashHex) = hasher.GenerateKey();

        var tamperedKey = rawKey + "tampered";
        bool isValid = hasher.VerifyKey(tamperedKey, hashHex);

        Assert.False(isValid);
    }

    [Fact]
    public void ApiKeyHasher_DifferentPepper_FailsVerification()
    {
        var hasher1 = new ApiKeyHasher("Pepper_A");
        var hasher2 = new ApiKeyHasher("Pepper_B");

        var (rawKey, _, hashHex1) = hasher1.GenerateKey();

        bool isValidWithDifferentPepper = hasher2.VerifyKey(rawKey, hashHex1);
        Assert.False(isValidWithDifferentPepper);
    }

    [Fact]
    public void PasswordHasher_HashAndVerify_Succeeds()
    {
        var hasher = new PasswordHasher();
        const string password = "StrongP@ssw0rd!2026";

        string hash = hasher.HashPassword(password);

        Assert.StartsWith("pbkdf2-sha512:", hash);
        Assert.True(hasher.VerifyPassword(password, hash));
        Assert.False(hasher.VerifyPassword("WrongPassword", hash));
    }

    [Fact]
    public void TokenService_GenerateAndValidateToken_PreservesTenantAndScopes()
    {
        var tokenService = new TokenService(_config);
        var orgId = Guid.NewGuid();
        var clientId = "client-app-101";
        var scopes = new[] { "pdf:generate", "pdf:read" };

        var token = tokenService.GenerateAccessToken(
            orgId,
            clientId,
            "BillingApp",
            roles: ["ServiceRole"],
            scopes: scopes,
            lifetime: TimeSpan.FromMinutes(15));

        Assert.NotEmpty(token);

        var principal = tokenService.ValidateToken(token);
        Assert.NotNull(principal);

        var orgClaim = principal.FindFirst("org_id")?.Value;
        Assert.Equal(orgId.ToString(), orgClaim);

        var extractedScopes = principal.FindAll("scope").Select(s => s.Value).ToList();
        Assert.Contains("pdf:generate", extractedScopes);
        Assert.Contains("pdf:read", extractedScopes);
    }

    [Fact]
    public void TokenService_TamperedToken_FailsValidation()
    {
        var tokenService = new TokenService(_config);
        var orgId = Guid.NewGuid();

        var token = tokenService.GenerateAccessToken(orgId, "user-1", "user@test.local");
        var tamperedToken = token + "corrupted";

        var principal = tokenService.ValidateToken(tamperedToken);
        Assert.Null(principal);
    }

    [Fact]
    public void TenantContext_OnceResolved_CannotBeMutatedToAnotherTenant()
    {
        var tenantContext = new TenantContext();
        var tenantA = Guid.NewGuid();
        var tenantB = Guid.NewGuid();

        tenantContext.SetTenant(tenantA, "acme");
        Assert.True(tenantContext.IsResolved);
        Assert.Equal(tenantA, tenantContext.OrganizationId);
        Assert.Equal("acme", tenantContext.OrganizationCode);

        // Attempting to overwrite with a different tenant must throw to prevent tenant hijacking
        Assert.Throws<InvalidOperationException>(() => tenantContext.SetTenant(tenantB, "globex"));
    }
}

