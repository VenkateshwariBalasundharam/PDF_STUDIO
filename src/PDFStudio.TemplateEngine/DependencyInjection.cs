using Microsoft.Extensions.DependencyInjection;
using PDFStudio.Application.Engines;
using PDFStudio.TemplateEngine.Services;

namespace PDFStudio.TemplateEngine;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioTemplateEngine(this IServiceCollection services)
    {
        services.AddSingleton<ITemplateRenderer, MustacheTemplateRenderer>();
        return services;
    }
}

