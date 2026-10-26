using Microsoft.Extensions.DependencyInjection;
using PDFStudio.SDK.Client;

namespace PDFStudio.SDK;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioSdk(
        this IServiceCollection services,
        Action<PdfStudioClientOptions> configureOptions)
    {
        var options = new PdfStudioClientOptions();
        configureOptions(options);

        services.AddSingleton(options);
        services.AddHttpClient<IPdfStudioClient, PdfStudioClient>();

        return services;
    }
}

