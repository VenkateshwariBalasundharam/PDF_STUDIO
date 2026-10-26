using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Application.Repositories;

public interface ITemplateRepository
{
    Task<PdfTemplate?> GetByIdAsync(Guid organizationId, Guid templateId, CancellationToken cancellationToken = default);
    Task<PdfTemplate?> GetByKeyAsync(Guid organizationId, string key, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PdfTemplate>> ListAsync(Guid organizationId, int skip = 0, int take = 50, CancellationToken cancellationToken = default);
    Task<Guid> CreateAsync(PdfTemplate template, CancellationToken cancellationToken = default);
    Task UpdateAsync(PdfTemplate template, CancellationToken cancellationToken = default);
    Task SetStatusAsync(Guid organizationId, Guid templateId, TemplateStatus status, CancellationToken cancellationToken = default);
    Task SetCurrentVersionAsync(Guid organizationId, Guid templateId, Guid versionId, CancellationToken cancellationToken = default);
}

public interface ITemplateVersionRepository
{
    Task<PdfTemplateVersion?> GetByIdAsync(Guid organizationId, Guid versionId, CancellationToken cancellationToken = default);
    Task<PdfTemplateVersion?> GetByNumberAsync(Guid organizationId, Guid templateId, int versionNumber, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PdfTemplateVersion>> ListByTemplateAsync(Guid organizationId, Guid templateId, CancellationToken cancellationToken = default);
    Task<Guid> CreateDraftAsync(PdfTemplateVersion version, CancellationToken cancellationToken = default);
    Task UpdateDraftAsync(PdfTemplateVersion version, CancellationToken cancellationToken = default);
    Task PublishAsync(Guid organizationId, Guid versionId, DateTimeOffset publishedAtUtc, CancellationToken cancellationToken = default);
    Task DeprecateAsync(Guid organizationId, Guid versionId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PdfTemplateField>> GetFieldsAsync(Guid organizationId, Guid versionId, CancellationToken cancellationToken = default);
    Task ReplaceFieldsAsync(Guid organizationId, Guid versionId, IReadOnlyList<PdfTemplateField> fields, CancellationToken cancellationToken = default);
}

