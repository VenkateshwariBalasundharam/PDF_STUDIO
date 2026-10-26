using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PDFStudio.Application.Engines;
using PDFStudio.Storage.Providers;

namespace PDFStudio.Storage;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioStorage(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var storagePath = configuration["Storage:LocalPath"];
        services.AddSingleton<IStorageProvider>(_ => new FileSystemStorageProvider(storagePath));
        return services;
    }
}

