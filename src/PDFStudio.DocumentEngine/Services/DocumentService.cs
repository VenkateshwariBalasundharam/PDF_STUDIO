using System.Security.Cryptography;
using PDFStudio.Application.Engines;
using PDFStudio.Application.Repositories;
using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.DocumentEngine.Services;

public sealed class DocumentService : IDocumentService
{
    private readonly IDocumentRepository _docRepo;
    private readonly IDocumentVersionRepository _versionRepo;
    private readonly IDocumentMetadataRepository _metaRepo;
    private readonly IStorageObjectRepository _storageRepo;
    private readonly IStorageProvider _storageProvider;
    private readonly ISequenceService _seqService;

    public DocumentService(
        IDocumentRepository docRepo,
        IDocumentVersionRepository versionRepo,
        IDocumentMetadataRepository metaRepo,
        IStorageObjectRepository storageRepo,
        IStorageProvider storageProvider,
        ISequenceService seqService)
    {
        _docRepo = docRepo;
        _versionRepo = versionRepo;
        _metaRepo = metaRepo;
        _storageRepo = storageRepo;
        _storageProvider = storageProvider;
        _seqService = seqService;
    }

    public async Task<Document> CreateDocumentAsync(
        Guid organizationId,
        string title,
        byte[] pdfBytes,
        string? documentNumber = null,
        int? retentionDays = null,
        Guid? generatedFromTemplateId = null,
        Guid? generatedFromJobId = null,
        IReadOnlyDictionary<string, string>? metadata = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var docNumber = documentNumber ?? await _seqService.NextDocumentNumberAsync(organizationId, cancellationToken);
        var documentId = Guid.NewGuid();
        var storageObjectId = Guid.NewGuid();
        var versionId = Guid.NewGuid();

        // 1. Calculate SHA-256 Checksum
        var checksum = Convert.ToHexString(SHA256.HashData(pdfBytes)).ToLowerInvariant();

        // 2. Save physical file to storage provider
        var storageKey = $"org/{organizationId}/docs/{documentId}/v1/{checksum[..12]}.pdf";
        using var stream = new MemoryStream(pdfBytes);
        await _storageProvider.SaveAsync(storageKey, stream, "application/pdf", cancellationToken);

        // 3. Create StorageObject record
        var storageObject = new StorageObject
        {
            Id = storageObjectId,
            OrganizationId = organizationId,
            StorageProvider = _storageProvider.ProviderName,
            StorageKey = storageKey,
            ContentType = "application/pdf",
            SizeBytes = pdfBytes.Length,
            Status = StorageStatus.Active,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
        await _storageRepo.CreateAsync(storageObject, cancellationToken);

        // 4. Create Document record first (versions reference it through a foreign key)
        var expiresAt = retentionDays.HasValue ? DateTimeOffset.UtcNow.AddDays(retentionDays.Value) : (DateTimeOffset?)null;
        var document = new Document
        {
            Id = documentId,
            OrganizationId = organizationId,
            DocumentNumber = docNumber,
            Title = title,
            Status = DocumentStatus.Active,
            IsFavorite = false,
            RetentionDays = retentionDays,
            ExpiresAtUtc = expiresAt,
            CurrentVersionId = null,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
        await _docRepo.CreateAsync(document, cancellationToken);

        // 5. Create DocumentVersion record, then point the document at it
        var version = new DocumentVersion
        {
            Id = versionId,
            OrganizationId = organizationId,
            DocumentId = documentId,
            VersionNumber = 1,
            StorageObjectId = storageObjectId,
            FileSizeBytes = pdfBytes.Length,
            PageCount = 1,
            Sha256Checksum = checksum,
            GeneratedFromTemplateId = generatedFromTemplateId,
            GeneratedFromJobId = generatedFromJobId,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
        await _versionRepo.CreateAsync(version, cancellationToken);
        await _docRepo.SetCurrentVersionAsync(organizationId, documentId, versionId, cancellationToken);
        document.CurrentVersionId = versionId;

        // 6. Save Metadata if present
        if (metadata != null && metadata.Count > 0)
        {
            await _metaRepo.SetMetadataAsync(organizationId, documentId, metadata, cancellationToken);
        }

        return document;
    }

    public async Task<byte[]> GetDocumentBytesAsync(
        Guid organizationId,
        Guid documentId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var doc = await _docRepo.GetByIdAsync(organizationId, documentId, cancellationToken);
        if (doc == null || doc.CurrentVersionId == null)
        {
            throw new FileNotFoundException($"Document '{documentId}' was not found.");
        }

        var version = await _versionRepo.GetByIdAsync(organizationId, doc.CurrentVersionId.Value, cancellationToken);
        if (version == null)
        {
            throw new FileNotFoundException($"Document version '{doc.CurrentVersionId}' not found.");
        }

        var storageObj = await _storageRepo.GetByIdAsync(organizationId, version.StorageObjectId, cancellationToken);
        if (storageObj == null)
        {
            throw new FileNotFoundException($"Storage object '{version.StorageObjectId}' not found.");
        }

        using var stream = await _storageProvider.GetAsync(storageObj.StorageKey, cancellationToken);
        using var ms = new MemoryStream();
        await stream.CopyToAsync(ms, cancellationToken);
        return ms.ToArray();
    }

    public async Task ArchiveDocumentAsync(
        Guid organizationId,
        Guid documentId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await _docRepo.SetStatusAsync(organizationId, documentId, DocumentStatus.Archived, cancellationToken);
    }

    public async Task<int> CleanupExpiredDocumentsAsync(
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var expiredDocs = await _docRepo.ListExpiredAsync(DateTimeOffset.UtcNow, cancellationToken);

        int count = 0;
        foreach (var doc in expiredDocs)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await _docRepo.SetStatusAsync(doc.OrganizationId, doc.Id, DocumentStatus.Expired, cancellationToken);
            count++;
        }

        return count;
    }
}

