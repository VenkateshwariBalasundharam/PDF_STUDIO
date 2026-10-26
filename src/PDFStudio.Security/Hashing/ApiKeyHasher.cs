using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace PDFStudio.Security.Hashing;

public interface IApiKeyHasher
{
    (string rawKey, string keyPrefix, string hashHex) GenerateKey(string prefix = "ps_live_");
    bool VerifyKey(string rawSecret, string expectedHashHex);
    string HashKey(string rawSecret);
}

public sealed class ApiKeyHasher : IApiKeyHasher
{
    private readonly byte[] _pepper;

    public ApiKeyHasher(IConfiguration configuration)
    {
        var pepperString = configuration["Security:ApiKeyPepper"]
            ?? "PDFStudio_Default_Enterprise_Security_Pepper_2026_ChangeInProd";
        _pepper = Encoding.UTF8.GetBytes(pepperString);
    }

    public ApiKeyHasher(string pepper)
    {
        _pepper = Encoding.UTF8.GetBytes(pepper);
    }

    public (string rawKey, string keyPrefix, string hashHex) GenerateKey(string prefix = "ps_live_")
    {
        // 8 bytes random for prefix uniqueness
        var prefixBytes = RandomNumberGenerator.GetBytes(8);
        var uniquePrefix = $"{prefix}{Convert.ToHexString(prefixBytes).ToLowerInvariant()}";

        // 32 bytes random secret
        var secretBytes = RandomNumberGenerator.GetBytes(32);
        var secretPart = Convert.ToHexString(secretBytes).ToLowerInvariant();

        var fullKey = $"{uniquePrefix}_{secretPart}";
        var hashHex = HashKey(fullKey);

        return (fullKey, uniquePrefix, hashHex);
    }

    public string HashKey(string rawSecret)
    {
        using var hmac = new HMACSHA256(_pepper);
        var rawBytes = Encoding.UTF8.GetBytes(rawSecret);
        var hash = hmac.ComputeHash(rawBytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public bool VerifyKey(string rawSecret, string expectedHashHex)
    {
        if (string.IsNullOrWhiteSpace(rawSecret) || string.IsNullOrWhiteSpace(expectedHashHex))
            return false;

        var computedHash = HashKey(rawSecret);
        var computedBytes = Encoding.UTF8.GetBytes(computedHash);
        var expectedBytes = Encoding.UTF8.GetBytes(expectedHashHex.ToLowerInvariant());

        return CryptographicOperations.FixedTimeEquals(computedBytes, expectedBytes);
    }
}

