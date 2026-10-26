using Microsoft.Extensions.DependencyInjection;
using PDFStudio.Application.Engines;
using PDFStudio.PdfEngine.Services;

namespace PDFStudio.PdfEngine;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioPdfEngine(this IServiceCollection services)
    {
        services.AddSingleton<IPdfEngine, ChromiumPdfEngine>();
        services.AddSingleton<IPdfManipulator, PdfSharpManipulator>();
        services.AddSingleton<IPdfSecurityService, PdfSharpSecurityService>();

        return services;
    }
}

