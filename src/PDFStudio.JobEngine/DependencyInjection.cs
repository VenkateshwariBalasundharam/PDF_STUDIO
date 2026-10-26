using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PDFStudio.Application.Repositories;
using PDFStudio.Application.Engines;
using PDFStudio.JobEngine.Queue;
using PDFStudio.JobEngine.Templates;
using PDFStudio.JobEngine.Webhooks;
using PDFStudio.JobEngine.Workers;

namespace PDFStudio.JobEngine;

public static class DependencyInjection
{
    public static IServiceCollection AddPdfStudioJobEngine(this IServiceCollection services)
    {
        services.AddScoped<IJobQueue, DatabaseJobQueue>();
        services.AddScoped<IJobProcessor, JobProcessor>();
        services.AddScoped<ITemplateContentService, TemplateContentService>();
        services.AddScoped<IJobMaintenanceService, JobMaintenanceService>();
        // Webhook storage is not implemented in the database layer yet: use do-nothing versions
        // so the Worker still starts. A real registration made earlier takes precedence.
        services.TryAddScoped<IWebhookOutbox, NullWebhookOutbox>();
        services.TryAddScoped<IWebhookRepository, NullWebhookRepository>();
        services.AddHttpClient<IWebhookDispatcher, WebhookDispatcher>();

        return services;
    }
}

