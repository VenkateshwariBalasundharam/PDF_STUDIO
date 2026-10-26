using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace PDFStudio.Security.Tokens;

public interface ITokenService
{
    string GenerateAccessToken(
        Guid organizationId,
        string subjectId,
        string emailOrName,
        IReadOnlyList<string>? roles = null,
        IReadOnlyList<string>? scopes = null,
        TimeSpan? lifetime = null);

    ClaimsPrincipal? ValidateToken(string token);
}

public sealed class TokenService : ITokenService
{
    private readonly string _issuer;
    private readonly string _audience;
    private readonly SymmetricSecurityKey _signingKey;
    private readonly JwtSecurityTokenHandler _tokenHandler = new();

    public TokenService(IConfiguration configuration)
    {
        _issuer = configuration["Jwt:Issuer"] ?? "PDFStudio.Authority";
        _audience = configuration["Jwt:Audience"] ?? "PDFStudio.Api";
        var secret = configuration["Jwt:SecretKey"]
            ?? "PDFStudio_Super_Secure_JWT_Signing_Key_2026_MustBeLongEnoughForHmacSha256";
        _signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
    }

    public string GenerateAccessToken(
        Guid organizationId,
        string subjectId,
        string emailOrName,
        IReadOnlyList<string>? roles = null,
        IReadOnlyList<string>? scopes = null,
        TimeSpan? lifetime = null)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, subjectId),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new("org_id", organizationId.ToString()),
            new("name", emailOrName)
        };

        if (roles is not null)
        {
            foreach (var role in roles)
            {
                claims.Add(new Claim(ClaimTypes.Role, role));
            }
        }

        if (scopes is not null)
        {
            foreach (var scope in scopes)
            {
                claims.Add(new Claim("scope", scope));
            }
        }

        var expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromHours(1));

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expires,
            Issuer = _issuer,
            Audience = _audience,
            SigningCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256Signature)
        };

        var token = _tokenHandler.CreateToken(tokenDescriptor);
        return _tokenHandler.WriteToken(token);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        try
        {
            var parameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = _issuer,
                ValidateAudience = true,
                ValidAudience = _audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = _signingKey,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30)
            };

            return _tokenHandler.ValidateToken(token, parameters, out _);
        }
        catch
        {
            return null;
        }
    }
}

