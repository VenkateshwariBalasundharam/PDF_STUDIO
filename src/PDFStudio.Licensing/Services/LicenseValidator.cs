using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PDFStudio.Licensing.Models;

namespace PDFStudio.Licensing.Services;

public interface ILicenseValidator
{
    string IssueLicenseKey(Guid orgId, string orgName, LicenseTier tier, DateTimeOffset expiresAtUtc, string secretKey);
    bool TryValidateLicenseKey(string rawLicenseToken, string secretKey, out LicenseCertificate? certificate, out string? errorMessage);
}

public sealed class LicenseValidator : ILicenseValidator
{
    public string IssueLicenseKey(Guid orgId, string orgName, LicenseTier tier, DateTimeOffset expiresAtUtc, string secretKey)
    {
        var limits = LicenseLimits.ForTier(tier);
        var issuedAtUtc = DateTimeOffset.UtcNow;
        var payloadToSign = $"{orgId:D}:{orgName}:{tier}:{issuedAtUtc.ToUnixTimeSeconds()}:{expiresAtUtc.ToUnixTimeSeconds()}:{limits.MaxMonthlyPdfGenerations}";
        
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
        var signatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadToSign));
        var signature = Convert.ToBase64String(signatureBytes);

        var cert = new LicenseCertificate(orgId, orgName, tier, issuedAtUtc, expiresAtUtc, limits, signature);
        var certJson = JsonSerializer.Serialize(cert);
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(certJson));
    }

    public bool TryValidateLicenseKey(string rawLicenseToken, string secretKey, out LicenseCertificate? certificate, out string? errorMessage)
    {
        certificate = null;
        errorMessage = null;

        try
        {
            var jsonBytes = Convert.FromBase64String(rawLicenseToken);
            var certJson = Encoding.UTF8.GetString(jsonBytes);
            var cert = JsonSerializer.Deserialize<LicenseCertificate>(certJson);

            if (cert == null)
            {
                errorMessage = "Invalid license token format.";
                return false;
            }

            // Expiration check
            if (DateTimeOffset.UtcNow > cert.ExpiresAtUtc)
            {
                errorMessage = $"License expired on {cert.ExpiresAtUtc:yyyy-MM-dd}.";
                return false;
            }

            // Cryptographic signature verification
            var payloadToSign = $"{cert.OrganizationId:D}:{cert.OrganizationName}:{cert.Tier}:{cert.IssuedAtUtc.ToUnixTimeSeconds()}:{cert.ExpiresAtUtc.ToUnixTimeSeconds()}:{cert.Limits.MaxMonthlyPdfGenerations}";
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
            var expectedSignatureBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(payloadToSign));
            var expectedSignature = Convert.ToBase64String(expectedSignatureBytes);

            if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(cert.Signature),
                Encoding.UTF8.GetBytes(expectedSignature)))
            {
                errorMessage = "Tampered or invalid license signature.";
                return false;
            }

            certificate = cert;
            return true;
        }
        catch (Exception ex)
        {
            errorMessage = $"License validation failed: {ex.Message}";
            return false;
        }
    }
}

