using System.Security.Cryptography;

namespace PDFStudio.Security.Hashing;

public interface IPasswordHasher
{
    string HashPassword(string password);
    bool VerifyPassword(string password, string hashedPassword);
}

public sealed class PasswordHasher : IPasswordHasher
{
    private const int SaltSize = 16; // 128 bits
    private const int HashSize = 32; // 256 bits
    private const int Iterations = 100_000;
    private static readonly HashAlgorithmName Algorithm = HashAlgorithmName.SHA512;

    public string HashPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password))
            throw new ArgumentException("Password cannot be empty.", nameof(password));

        byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            Iterations,
            Algorithm,
            HashSize);

        return $"pbkdf2-sha512:{Iterations}:{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
    }

    public bool VerifyPassword(string password, string hashedPassword)
    {
        if (string.IsNullOrWhiteSpace(password) || string.IsNullOrWhiteSpace(hashedPassword))
            return false;

        var parts = hashedPassword.Split(':');
        if (parts.Length != 4 || parts[0] != "pbkdf2-sha512")
            return false;

        if (!int.TryParse(parts[1], out int iterations))
            return false;

        byte[] salt;
        byte[] expectedHash;
        try
        {
            salt = Convert.FromBase64String(parts[2]);
            expectedHash = Convert.FromBase64String(parts[3]);
        }
        catch (FormatException)
        {
            return false;
        }

        byte[] actualHash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            Algorithm,
            expectedHash.Length);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }
}

