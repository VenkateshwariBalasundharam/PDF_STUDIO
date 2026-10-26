using PDFStudio.Mobile.Services;

namespace PDFStudio.Mobile.ViewModels;

public sealed class GeneratePdfViewModel : ViewModelBase
{
    private readonly IMobilePdfService _pdfService;
    private string _templateId = "invoice-default";
    private string _pageSize = "A4";
    private string _orientation = "Portrait";
    private string? _statusMessage;
    private byte[]? _generatedPdfBytes;

    public GeneratePdfViewModel(IMobilePdfService pdfService)
    {
        _pdfService = pdfService;
        Title = "Generate PDF";
    }

    public string TemplateId
    {
        get => _templateId;
        set => SetProperty(ref _templateId, value);
    }

    public string PageSize
    {
        get => _pageSize;
        set => SetProperty(ref _pageSize, value);
    }

    public string Orientation
    {
        get => _orientation;
        set => SetProperty(ref _orientation, value);
    }

    public string? StatusMessage
    {
        get => _statusMessage;
        set => SetProperty(ref _statusMessage, value);
    }

    public byte[]? GeneratedPdfBytes
    {
        get => _generatedPdfBytes;
        set => SetProperty(ref _generatedPdfBytes, value);
    }

    public async Task<bool> GenerateAsync()
    {
        if (string.IsNullOrWhiteSpace(TemplateId))
        {
            StatusMessage = "Template ID cannot be empty.";
            return false;
        }

        IsBusy = true;
        StatusMessage = "Submitting PDF generation request...";

        try
        {
            var data = new { CustomerName = "Mobile User", Date = DateTime.UtcNow.ToString("yyyy-MM-dd") };
            var response = await _pdfService.GeneratePdfAsync(TemplateId, data, PageSize, Orientation);
            if (response.Success && response.Data != null)
            {
                if (!string.IsNullOrEmpty(response.Data.DocumentId))
                {
                    StatusMessage = "PDF generated. Fetching document bytes...";
                    GeneratedPdfBytes = await _pdfService.DownloadDocumentAsync(response.Data.DocumentId);
                    StatusMessage = $"PDF ready ({GeneratedPdfBytes.Length / 1024} KB)";
                    return true;
                }
            }

            StatusMessage = response.Message ?? "Failed to generate PDF.";
            return false;
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error: {ex.Message}";
            return false;
        }
        finally
        {
            IsBusy = false;
        }
    }
}

