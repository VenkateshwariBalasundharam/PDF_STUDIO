using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Application.Repositories;

public interface IDocumentRepository
{
    Task<Document?> GetByIdAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default);
    Task<Document?> GetByNumberAsync(Guid organizationId, string documentNumber, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Document>> ListAsync(Guid organizationId, DocumentStatus? statusFilter = null, bool? favoriteOnly = null, int skip = 0, int take = 50, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(Document document, CancellationToken cancellationToken = default);
    Task SetStatusAsync(Guid organizationId, Guid documentId, DocumentStatus status, CancellationToken cancellationToken = default);
    Task SetFavoriteAsync(Guid organizationId, Guid documentId, bool isFavorite, CancellationToken cancellationToken = default);
    Task SetCurrentVersionAsync(Guid organizationId, Guid documentId, Guid versionId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Document>> ListExpiredAsync(DateTimeOffset thresholdUtc, CancellationToken cancellationToken = default);
}

public interface IDocumentVersionRepository
{
    Task<DocumentVersion?> GetByIdAsync(Guid organizationId, Guid versionId, CancellationToken cancellationToken = default);
    Task<DocumentVersion?> GetLatestAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<DocumentVersion>> ListByDocumentAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(DocumentVersion version, CancellationToken cancellationToken = default);
}

public interface IDocumentMetadataRepository
{
    Task<IReadOnlyDictionary<string, string>> GetMetadataAsync(Guid organizationId, Guid documentId, CancellationToken cancellationToken = default);
    Task SetMetadataAsync(Guid organizationId, Guid documentId, IReadOnlyDictionary<string, string> metadata, CancellationToken cancellationToken = default);
}

public interface IStorageObjectRepository
{
    Task<Guid> CreateAsync(StorageObject storageObject, CancellationToken cancellationToken = default);
    Task<StorageObject?> GetByIdAsync(Guid organizationId, Guid storageObjectId, CancellationToken cancellationToken = default);
    Task MarkPendingDeleteAsync(Guid organizationId, Guid storageObjectId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<StorageObject>> ListPendingDeleteAsync(int batchSize = 100, CancellationToken cancellationToken = default);
    Task DeletePermanentlyAsync(Guid storageObjectId, CancellationToken cancellationToken = default);
}

