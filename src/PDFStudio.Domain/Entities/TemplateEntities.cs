using PDFStudio.Domain.Common;
using PDFStudio.Domain.Enums;

namespace PDFStudio.Domain.Entities;

public sealed class PdfTemplate : TenantEntity
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public TemplateStatus Status { get; set; } = TemplateStatus.Active;
    public Guid? CurrentVersionId { get; set; }
}

public sealed class PdfTemplateVersion : TenantEntity
{
    public Guid TemplateId { get; set; }
    public int VersionNumber { get; set; }
    public string HtmlContent { get; set; } = string.Empty;
    public string? HeaderHtml { get; set; }
    public string? FooterHtml { get; set; }
    public string? DefaultStylesCss { get; set; }
    public string PageOrientation { get; set; } = "Portrait";
    public string PageSize { get; set; } = "A4";
    public string? MarginsJson { get; set; }
    public TemplateVersionStatus Status { get; set; } = TemplateVersionStatus.Draft;
    public DateTimeOffset? PublishedAtUtc { get; set; }

    public bool IsPublished => Status == TemplateVersionStatus.Published;
}

public sealed class PdfTemplateField : TenantEntity
{
    public Guid TemplateVersionId { get; set; }
    public string FieldName { get; set; } = string.Empty;
    public TemplateFieldDataType DataType { get; set; } = TemplateFieldDataType.String;
    public bool IsRequired { get; set; }
    public string? DefaultValue { get; set; }
    public string? FormatPattern { get; set; }
    public string? Description { get; set; }
}

