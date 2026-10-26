using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using PDFStudio.Application.Security;
using PDFStudio.Security.Authentication;
using PDFStudio.Security.Authorization;
using PDFStudio.Security.Hashing;
using PDFStudio.Security.Tenancy;
using PDFStudio.Security.Tokens;

namespace PDFStudio.Security;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioSecurity(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Core hashing and token services
        services.AddSingleton<IApiKeyHasher, ApiKeyHasher>();
        services.AddSingleton<IPasswordHasher, PasswordHasher>();
        services.AddSingleton<ITokenService, TokenService>();

        // Tenant Context (Scoped to HTTP request)
        services.AddScoped<TenantContext>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());

        // Authorization handler
        services.AddSingleton<IAuthorizationHandler, HasScopeHandler>();

        // Configure Authentication
        var jwtSecret = configuration["Jwt:SecretKey"]
            ?? "PDFStudio_Super_Secure_JWT_Signing_Key_2026_MustBeLongEnoughForHmacSha256";
        var jwtIssuer = configuration["Jwt:Issuer"] ?? "PDFStudio.Authority";
        var jwtAudience = configuration["Jwt:Audience"] ?? "PDFStudio.Api";

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = "SmartScheme";
            options.DefaultChallengeScheme = "SmartScheme";
        })
        .AddPolicyScheme("SmartScheme", "JWT or API Key", options =>
        {
            options.ForwardDefaultSelector = context =>
            {
                if (context.Request.Headers.ContainsKey("X-Api-Key") ||
                    (context.Request.Headers.TryGetValue("Authorization", out var auth) &&
                     (auth.ToString().StartsWith("ApiKey ", StringComparison.OrdinalIgnoreCase) ||
                      auth.ToString().StartsWith("Bearer ps_", StringComparison.OrdinalIgnoreCase))))
                {
                    return ApiKeyAuthenticationOptions.DefaultScheme;
                }

                return JwtBearerDefaults.AuthenticationScheme;
            };
        })
        .AddScheme<ApiKeyAuthenticationOptions, ApiKeyAuthenticationHandler>(
            ApiKeyAuthenticationOptions.DefaultScheme, _ => { })
        .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = jwtIssuer,
                ValidateAudience = true,
                ValidAudience = jwtAudience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30)
            };
        });

        // Configure Authorization policies
        services.AddAuthorization(options =>
        {
            options.AddScopePolicies();
        });

        return services;
    }

    public static IApplicationBuilder UseTenantContext(this IApplicationBuilder app)
    {
        return app.UseMiddleware<TenantResolutionMiddleware>();
    }
}

