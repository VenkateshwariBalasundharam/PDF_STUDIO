using Microsoft.Extensions.DependencyInjection;
using PDFStudio.DocumentEngine.Services;

namespace PDFStudio.DocumentEngine;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioDocumentEngine(this IServiceCollection services)
    {
        services.AddScoped<IDocumentService, DocumentService>();
        return services;
    }
}

