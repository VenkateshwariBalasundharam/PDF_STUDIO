using PDFStudio.Licensing.Models;
using PDFStudio.Licensing.Services;
using Xunit;

namespace PDFStudio.UnitTests;

public class LicensingTests
{
    private const string SecretKey = "pdfstudio_enterprise_master_signing_key_9942!";
    private readonly LicenseValidator _validator = new();
    private readonly LicenseEnforcementService _enforcementService = new();

    [Fact]
    public void IssueLicenseKey_ValidParameters_SuccessfullyValidates()
    {
        var orgId = Guid.NewGuid();
        var token = _validator.IssueLicenseKey(
            orgId: orgId,
            orgName: "Contoso Ltd",
            tier: LicenseTier.Professional,
            expiresAtUtc: DateTimeOffset.UtcNow.AddYears(1),
            secretKey: SecretKey);

        var isValid = _validator.TryValidateLicenseKey(token, SecretKey, out var cert, out var error);

        Assert.True(isValid);
        Assert.NotNull(cert);
        Assert.Null(error);
        Assert.Equal(orgId, cert.OrganizationId);
        Assert.Equal(LicenseTier.Professional, cert.Tier);
        Assert.Equal(10_000, cert.Limits.MaxMonthlyPdfGenerations);
    }

    [Fact]
    public void ValidateLicenseKey_WithTamperedToken_ReturnsFalse()
    {
        var orgId = Guid.NewGuid();
        var token = _validator.IssueLicenseKey(
            orgId: orgId,
            orgName: "Contoso Ltd",
            tier: LicenseTier.Professional,
            expiresAtUtc: DateTimeOffset.UtcNow.AddYears(1),
            secretKey: SecretKey);

        // Tamper with base64 string
        var tamperedToken = token.Substring(0, token.Length - 4) + "AAAA";

        var isValid = _validator.TryValidateLicenseKey(tamperedToken, SecretKey, out _, out var error);

        Assert.False(isValid);
        Assert.NotNull(error);
    }

    [Fact]
    public void ValidateLicenseKey_ExpiredLicense_ReturnsFalse()
    {
        var orgId = Guid.NewGuid();
        var token = _validator.IssueLicenseKey(
            orgId: orgId,
            orgName: "Expired Client Corp",
            tier: LicenseTier.Trial,
            expiresAtUtc: DateTimeOffset.UtcNow.AddDays(-1), // Expired yesterday
            secretKey: SecretKey);

        var isValid = _validator.TryValidateLicenseKey(token, SecretKey, out _, out var error);

        Assert.False(isValid);
        Assert.Contains("expired", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EnforcementService_ExceedingMonthlyPdfGenerations_ThrowsQuotaExceeded()
    {
        var orgId = Guid.NewGuid();
        var limits = LicenseLimits.ForTier(LicenseTier.Trial); // 100 generations
        var cert = new LicenseCertificate(
            OrganizationId: orgId,
            OrganizationName: "Trial Corp",
            Tier: LicenseTier.Trial,
            IssuedAtUtc: DateTimeOffset.UtcNow,
            ExpiresAtUtc: DateTimeOffset.UtcNow.AddDays(30),
            Limits: limits,
            Signature: "VALID"
        );

        _enforcementService.SetLicense(orgId, cert);

        // Simulate 100 successful generations
        for (int i = 0; i < 100; i++)
        {
            _enforcementService.EnsureCanGeneratePdf(orgId);
            _enforcementService.RecordPdfGenerated(orgId);
        }

        // 101st generation should throw LicenseQuotaExceededException
        var ex = Assert.Throws<LicenseQuotaExceededException>(() =>
        {
            _enforcementService.EnsureCanGeneratePdf(orgId);
        });

        Assert.Contains("quota", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void EnforcementService_EnterpriseTier_PermitsUnlimitedGenerations()
    {
        var orgId = Guid.NewGuid();
        var limits = LicenseLimits.ForTier(LicenseTier.Enterprise);
        var cert = new LicenseCertificate(
            OrganizationId: orgId,
            OrganizationName: "Enterprise Global",
            Tier: LicenseTier.Enterprise,
            IssuedAtUtc: DateTimeOffset.UtcNow,
            ExpiresAtUtc: DateTimeOffset.UtcNow.AddYears(1),
            Limits: limits,
            Signature: "VALID"
        );

        _enforcementService.SetLicense(orgId, cert);

        // Record a large volume of generations
        for (int i = 0; i < 1500; i++)
        {
            _enforcementService.RecordPdfGenerated(orgId);
        }

        // Should not throw
        _enforcementService.EnsureCanGeneratePdf(orgId);
    }
}

