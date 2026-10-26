using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.DocumentEngine.Services;

public interface IDocumentService
{
    Task<Document> CreateDocumentAsync(
        Guid organizationId,
        string title,
        byte[] pdfBytes,
        string? documentNumber = null,
        int? retentionDays = null,
        Guid? generatedFromTemplateId = null,
        Guid? generatedFromJobId = null,
        IReadOnlyDictionary<string, string>? metadata = null,
        CancellationToken cancellationToken = default);

    Task<byte[]> GetDocumentBytesAsync(
        Guid organizationId,
        Guid documentId,
        CancellationToken cancellationToken = default);

    Task ArchiveDocumentAsync(
        Guid organizationId,
        Guid documentId,
        CancellationToken cancellationToken = default);

    Task<int> CleanupExpiredDocumentsAsync(
        CancellationToken cancellationToken = default);
}

