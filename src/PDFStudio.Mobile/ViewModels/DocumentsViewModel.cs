using System.Collections.ObjectModel;
using PDFStudio.Mobile.Services;

namespace PDFStudio.Mobile.ViewModels;

public sealed class DocumentItem
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public int PageCount { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class DocumentsViewModel : ViewModelBase
{
    private readonly IMobilePdfService _pdfService;
    private readonly IShareService _shareService;
    private DocumentItem? _selectedDocument;

    public ObservableCollection<DocumentItem> Documents { get; } = new();

    public DocumentsViewModel(IMobilePdfService pdfService, IShareService shareService)
    {
        _pdfService = pdfService;
        _shareService = shareService;
        Title = "Documents";

        // Seed sample documents
        Documents.Add(new DocumentItem
        {
            Id = "doc-101",
            Title = "Q3 Financial Summary",
            FileName = "Q3_Summary.pdf",
            FileSizeBytes = 184320,
            PageCount = 3,
            CreatedAtUtc = DateTime.UtcNow.AddDays(-1)
        });
        Documents.Add(new DocumentItem
        {
            Id = "doc-102",
            Title = "Vendor Agreement - CloudNet",
            FileName = "Vendor_Agreement.pdf",
            FileSizeBytes = 312000,
            PageCount = 5,
            CreatedAtUtc = DateTime.UtcNow.AddDays(-3)
        });
    }

    public DocumentItem? SelectedDocument
    {
        get => _selectedDocument;
        set => SetProperty(ref _selectedDocument, value);
    }

    public async Task ShareDocumentAsync(DocumentItem document)
    {
        if (document == null) return;
        IsBusy = true;
        try
        {
            var bytes = await _pdfService.DownloadDocumentAsync(document.Id);
            await _shareService.ShareFileAsync(document.Title, document.FileName, bytes);
        }
        finally
        {
            IsBusy = false;
        }
    }
}

