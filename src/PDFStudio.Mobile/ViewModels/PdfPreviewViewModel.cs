using PDFStudio.Mobile.Services;

namespace PDFStudio.Mobile.ViewModels;

public sealed class PdfPreviewViewModel : ViewModelBase
{
    private readonly IShareService _shareService;
    private byte[]? _pdfBytes;
    private string _documentName = "Document.pdf";

    public PdfPreviewViewModel(IShareService shareService)
    {
        _shareService = shareService;
        Title = "PDF Preview";
    }

    public byte[]? PdfBytes
    {
        get => _pdfBytes;
        set
        {
            if (SetProperty(ref _pdfBytes, value))
            {
                OnPropertyChanged(nameof(FileSizeDisplay));
            }
        }
    }

    public string DocumentName
    {
        get => _documentName;
        set => SetProperty(ref _documentName, value);
    }

    public string FileSizeDisplay =>
        PdfBytes == null ? "0 KB" : $"{PdfBytes.Length / 1024} KB";

    public async Task ShareAsync()
    {
        if (PdfBytes != null)
        {
            await _shareService.ShareFileAsync(DocumentName, DocumentName, PdfBytes);
        }
    }
}

