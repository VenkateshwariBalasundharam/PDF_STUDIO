using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using PDFStudio.DocumentEngine;
using PDFStudio.Infrastructure;
using PDFStudio.JobEngine;
using PDFStudio.PdfEngine;
using PDFStudio.Storage;
using PDFStudio.TemplateEngine;
using PDFStudio.Worker;

var builder = Host.CreateApplicationBuilder(args);

// Register Core Subsystems
builder.Services.AddPdfStudioInfrastructure(builder.Configuration);
builder.Services.AddPdfStudioPdfEngine();
builder.Services.AddPdfStudioTemplateEngine();
builder.Services.AddPdfStudioStorage(builder.Configuration);
builder.Services.AddPdfStudioDocumentEngine();
builder.Services.AddPdfStudioJobEngine();

// Register Worker Background Service
builder.Services.AddHostedService<PdfProcessingWorker>();

var host = builder.Build();
host.Run();
