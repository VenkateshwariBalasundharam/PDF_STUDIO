using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Application.Engines;

public sealed record PageSettings(
    string Orientation = "Portrait",
    string Size = "A4",
    double MarginTopMm = 10,
    double MarginBottomMm = 10,
    double MarginLeftMm = 10,
    double MarginRightMm = 10,
    bool PrintBackground = true,
    double Scale = 1.0);

public sealed record PdfGenerationRequest(
    string HtmlContent,
    string? HeaderHtml = null,
    string? FooterHtml = null,
    string? DefaultStylesCss = null,
    PageSettings? Settings = null,
    IReadOnlyDictionary<string, string>? Metadata = null);

public sealed record WatermarkOptions(
    string Text,
    double Opacity = 0.3,
    double RotationAngleDegrees = 45,
    string ColorHex = "#888888",
    int FontSize = 48);

public sealed record StampOptions(
    string Text,
    string Position = "BottomRight",
    double Opacity = 0.8,
    string ColorHex = "#FF0000");

public sealed record PdfProtectionOptions(
    string? UserPassword,
    string OwnerPassword,
    bool AllowPrinting = true,
    bool AllowModifying = false,
    bool AllowCopying = false);

public interface IPdfEngine
{
    Task<byte[]> GenerateAsync(
        PdfGenerationRequest request,
        CancellationToken cancellationToken = default);

    Task<byte[]> MergeAsync(
        IReadOnlyList<byte[]> documents,
        CancellationToken cancellationToken = default);

    Task<byte[]> SplitAsync(
        byte[] document,
        IReadOnlyList<int> pages,
        CancellationToken cancellationToken = default);
}

public interface IPdfManipulator
{
    Task<byte[]> WatermarkAsync(
        byte[] document,
        WatermarkOptions options,
        CancellationToken cancellationToken = default);

    Task<byte[]> StampAsync(
        byte[] document,
        StampOptions options,
        CancellationToken cancellationToken = default);

    Task<byte[]> RotatePagesAsync(
        byte[] document,
        IReadOnlyList<int> pages,
        int rotationAngleDegrees,
        CancellationToken cancellationToken = default);

    Task<byte[]> ExtractPagesAsync(
        byte[] document,
        IReadOnlyList<int> pages,
        CancellationToken cancellationToken = default);
}

public interface IPdfSecurityService
{
    Task<byte[]> ProtectAsync(
        byte[] document,
        PdfProtectionOptions options,
        CancellationToken cancellationToken = default);
}

public interface ITemplateRenderer
{
    Task<string> RenderAsync(
        string templateHtml,
        object? dataModel,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<string>> ValidateDataAsync(
        IReadOnlyList<PdfTemplateField> fields,
        string jsonData,
        CancellationToken cancellationToken = default);
}

public interface IStorageProvider
{
    string ProviderName { get; }

    Task<string> SaveAsync(
        string storageKey,
        Stream contentStream,
        string contentType,
        CancellationToken cancellationToken = default);

    Task<Stream> GetAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    Task DeleteAsync(
        string storageKey,
        CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default);
}

public interface IJobQueue
{
    Task<PdfJob> EnqueueAsync(
        Guid organizationId,
        JobType jobType,
        string payloadJson,
        int priority = 100,
        string? idempotencyKey = null,
        CancellationToken cancellationToken = default);

    Task<PdfJob?> ClaimNextAsync(
        string workerId,
        TimeSpan leaseDuration,
        CancellationToken cancellationToken = default);

    Task CompleteAsync(
        Guid jobId,
        string? resultJson,
        CancellationToken cancellationToken = default);

    Task FailAsync(
        Guid jobId,
        string errorMessage,
        bool canRetry,
        CancellationToken cancellationToken = default);
}

