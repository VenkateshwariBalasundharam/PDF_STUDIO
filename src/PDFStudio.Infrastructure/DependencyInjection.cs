using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PDFStudio.Application.Persistence;
using PDFStudio.Application.Repositories;
using PDFStudio.Infrastructure.Persistence;
using PDFStudio.Infrastructure.Postgres;
using PDFStudio.Infrastructure.Services;
using PDFStudio.Infrastructure.SqlServer;

namespace PDFStudio.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var provider = configuration["Database:Provider"] ?? "PostgreSql";

        if (provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IDbConnectionFactory, SqlServerDbConnectionFactory>();
            services.AddScoped<ITransactionManager, DbTransactionManager>();

            // Repositories
            services.AddScoped<IOrganizationRepository, SqlServerOrganizationRepository>();
            services.AddScoped<IApiKeyRepository, SqlServerApiKeyRepository>();
            services.AddScoped<IApiClientRepository, SqlServerApiClientRepository>();
            services.AddScoped<ITemplateRepository, SqlServerTemplateRepository>();
            services.AddScoped<IDocumentRepository, SqlServerDocumentRepository>();
            services.AddScoped<IDocumentVersionRepository, SqlServerDocumentVersionRepository>();
            services.AddScoped<IDocumentMetadataRepository, SqlServerDocumentMetadataRepository>();
            services.AddScoped<IStorageObjectRepository, SqlServerStorageObjectRepository>();
            services.AddScoped<IJobRepository, SqlServerJobRepository>();
        }
        else // default to PostgreSql
        {
            services.AddSingleton<IDbConnectionFactory, PostgresDbConnectionFactory>();
            services.AddScoped<ITransactionManager, DbTransactionManager>();

            // Repositories
            services.AddScoped<IOrganizationRepository, PostgresOrganizationRepository>();
            services.AddScoped<IApiKeyRepository, PostgresApiKeyRepository>();
            services.AddScoped<IApiClientRepository, PostgresApiClientRepository>();
            services.AddScoped<ITemplateRepository, PostgresTemplateRepository>();
            services.AddScoped<IDocumentRepository, PostgresDocumentRepository>();
            services.AddScoped<IDocumentVersionRepository, PostgresDocumentVersionRepository>();
            services.AddScoped<IDocumentMetadataRepository, PostgresDocumentMetadataRepository>();
            services.AddScoped<IStorageObjectRepository, PostgresStorageObjectRepository>();
            services.AddScoped<IJobRepository, PostgresJobRepository>();
        }

        // Shared infrastructure services
        services.AddScoped<ISequenceService, SequenceService>();

        return services;
    }
}

