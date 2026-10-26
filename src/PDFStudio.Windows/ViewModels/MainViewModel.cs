using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Windows.Input;
using PDFStudio.Application.Engines;
using PDFStudio.SDK.Client;
using PDFStudio.SDK.Models;
using PDFStudio.Windows.Commands;
using PDFStudio.Windows.Services;

namespace PDFStudio.Windows.ViewModels;

public sealed class MainViewModel : ViewModelBase
{
    private readonly IPdfStudioClient _client;
    private readonly IPdfManipulator _localManipulator;
    private readonly DesktopInvoiceService _invoiceService = new();

    private string _apiUrl = "https://localhost:7001";
    private string _apiKey = "ps_live_demo_key_1234567890";
    private string _templateId = "invoice-standard";
    private string _jsonData = "{\n  \"invoiceNo\": \"INV-1001\",\n  \"customerName\": \"Acme Corp\",\n  \"amount\": 15000\n}";
    private string _statusMessage = "Ready";
    private bool _isBusy;
    private bool _isOfflineMode;

    // Invoice & Billing Properties
    private string _company = "Tharun & Co.";
    private string _companyAddress = "Salem, Tamil Nadu";
    private string _currency = "₹";
    private string _invoiceNo = "INV-0401";
    private string _invoiceDate = DateTime.Now.ToString("yyyy-MM-dd");
    private string _customerName = "Selvam Mart";
    private string _customerAddress = "Madurai, Tamil Nadu";
    private string _itemDescription = "Rice 25kg";
    private int _itemQuantity = 2;
    private decimal _itemPrice = 1450m;

    // Watermark
    private bool _enableWatermark = true;
    private string _watermarkText = "Tharun & Co.";
    private int _watermarkOpacity = 8;

    // Day-to-Day Update Graph & Analytics
    private bool _enableChart = true;
    private string _chartType = "stacked-bar";
    private string _chartGrouping = "Customer";
    private string _lastGeneratedPdfPath = "";

    public ObservableCollection<string> ActivityLogs { get; } = new();

    public string ApiUrl { get => _apiUrl; set => SetProperty(ref _apiUrl, value); }
    public string ApiKey { get => _apiKey; set => SetProperty(ref _apiKey, value); }
    public string TemplateId { get => _templateId; set => SetProperty(ref _templateId, value); }
    public string JsonData { get => _jsonData; set => SetProperty(ref _jsonData, value); }
    public string StatusMessage { get => _statusMessage; set => SetProperty(ref _statusMessage, value); }
    public bool IsBusy { get => _isBusy; set => SetProperty(ref _isBusy, value); }
    public bool IsOfflineMode { get => _isOfflineMode; set => SetProperty(ref _isOfflineMode, value); }

    public string Company { get => _company; set => SetProperty(ref _company, value); }
    public string CompanyAddress { get => _companyAddress; set => SetProperty(ref _companyAddress, value); }
    public string Currency { get => _currency; set => SetProperty(ref _currency, value); }
    public string InvoiceNo { get => _invoiceNo; set => SetProperty(ref _invoiceNo, value); }
    public string InvoiceDate { get => _invoiceDate; set => SetProperty(ref _invoiceDate, value); }
    public string CustomerName { get => _customerName; set => SetProperty(ref _customerName, value); }
    public string CustomerAddress { get => _customerAddress; set => SetProperty(ref _customerAddress, value); }
    public string ItemDescription { get => _itemDescription; set => SetProperty(ref _itemDescription, value); }
    public int ItemQuantity { get => _itemQuantity; set => SetProperty(ref _itemQuantity, value); }
    public decimal ItemPrice { get => _itemPrice; set => SetProperty(ref _itemPrice, value); }

    public bool EnableWatermark { get => _enableWatermark; set => SetProperty(ref _enableWatermark, value); }
    public string WatermarkText { get => _watermarkText; set => SetProperty(ref _watermarkText, value); }
    public int WatermarkOpacity { get => _watermarkOpacity; set => SetProperty(ref _watermarkOpacity, value); }

    public bool EnableChart { get => _enableChart; set => SetProperty(ref _enableChart, value); }
    public string ChartType { get => _chartType; set => SetProperty(ref _chartType, value); }
    public string ChartGrouping { get => _chartGrouping; set => SetProperty(ref _chartGrouping, value); }
    public string LastGeneratedPdfPath { get => _lastGeneratedPdfPath; set => SetProperty(ref _lastGeneratedPdfPath, value); }

    public ICommand GeneratePdfCommand { get; }
    public ICommand WatermarkPdfCommand { get; }
    public ICommand GenerateDesktopInvoiceCommand { get; }
    public ICommand GenerateConsolidatedReportCommand { get; }
    public ICommand OpenLastPdfCommand { get; }

    public MainViewModel(IPdfStudioClient client, IPdfManipulator localManipulator)
    {
        _client = client;
        _localManipulator = localManipulator;

        GeneratePdfCommand = new RelayCommand(async _ => await GeneratePdfAsync(), _ => !IsBusy);
        WatermarkPdfCommand = new RelayCommand(async _ => await ApplyLocalWatermarkAsync(), _ => !IsBusy);
        GenerateDesktopInvoiceCommand = new RelayCommand(async _ => await GenerateDesktopInvoiceAsync(), _ => !IsBusy);
        GenerateConsolidatedReportCommand = new RelayCommand(async _ => await GenerateConsolidatedReportAsync(), _ => !IsBusy);
        OpenLastPdfCommand = new RelayCommand(_ => OpenLastPdf(), _ => !string.IsNullOrEmpty(LastGeneratedPdfPath) && File.Exists(LastGeneratedPdfPath));

        ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] PDFStudio Windows Desktop client initialized.");
    }

    private async Task GenerateDesktopInvoiceAsync()
    {
        IsBusy = true;
        StatusMessage = "Rendering Desktop Invoice PDF...";
        ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Generating Invoice {InvoiceNo} with {(EnableChart ? "Item Breakdown Graph, " : "")}{(EnableWatermark ? "Watermark" : "Standard")}");

        try
        {
            var inv = new DesktopInvoiceModel(
                InvoiceNo,
                InvoiceDate,
                CustomerName,
                CustomerAddress,
                new List<InvoiceLineItem>
                {
                    new(ItemDescription, ItemQuantity, ItemPrice),
                    new("Sugar 50kg", 1, 2100m),
                    new("Oil 5L", 2, 780m)
                });

            var html = _invoiceService.BuildInvoiceHtml(
                Company,
                CompanyAddress,
                Currency,
                inv,
                EnableWatermark,
                WatermarkText,
                WatermarkOpacity,
                EnableChart);

            var path = await _invoiceService.GeneratePdfFileAsync(html, $"Invoice_{InvoiceNo}");
            LastGeneratedPdfPath = path;

            StatusMessage = $"Invoice PDF Generated!";
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Saved PDF: {path}");
            _invoiceService.OpenPdf(path);
        }
        catch (Exception ex)
        {
            StatusMessage = "Generation failed";
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Error: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task GenerateConsolidatedReportAsync()
    {
        IsBusy = true;
        StatusMessage = "Rendering Consolidated Analytics Report...";
        ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Generating Consolidated Invoice with Day-to-Day Update Graph ({ChartType}, by {ChartGrouping})...");

        try
        {
            // Sample batch of 6 invoices across multiple dates & customers
            var invoices = new List<DesktopInvoiceModel>
            {
                new("INV-0401", "2026-10-01", "Selvam Mart", "Madurai", new List<InvoiceLineItem> { new("Rice 25kg", 3, 1450m), new("Oil 5L", 2, 780m) }),
                new("INV-0402", "2026-10-02", "Ravi Stores", "Salem", new List<InvoiceLineItem> { new("Sugar 50kg", 2, 2100m), new("Dal 10kg", 3, 950m) }),
                new("INV-0403", "2026-10-04", "Lakshmi Traders", "Trichy", new List<InvoiceLineItem> { new("Rice 25kg", 4, 1450m), new("Sugar 50kg", 1, 2100m) }),
                new("INV-0404", "2026-10-05", "Selvam Mart", "Madurai", new List<InvoiceLineItem> { new("Dal 10kg", 2, 950m), new("Oil 5L", 3, 780m) }),
                new("INV-0405", "2026-10-07", "Ravi Stores", "Salem", new List<InvoiceLineItem> { new("Rice 25kg", 5, 1450m), new("Sugar 50kg", 2, 2100m) }),
                new("INV-0406", "2026-10-10", "Kannan Agencies", "Coimbatore", new List<InvoiceLineItem> { new("Oil 5L", 4, 780m), new("Tea 1kg", 6, 310m) })
            };

            var html = _invoiceService.BuildConsolidatedReportHtml(
                Company,
                CompanyAddress,
                Currency,
                invoices,
                EnableWatermark,
                WatermarkText,
                WatermarkOpacity,
                EnableChart,
                ChartGrouping,
                ChartType);

            var path = await _invoiceService.GeneratePdfFileAsync(html, "Consolidated_Analytics_Report");
            LastGeneratedPdfPath = path;

            StatusMessage = $"Consolidated Report with Chart Generated!";
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Saved Consolidated PDF: {path}");
            _invoiceService.OpenPdf(path);
        }
        catch (Exception ex)
        {
            StatusMessage = "Report generation failed";
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Error: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    private void OpenLastPdf()
    {
        if (!string.IsNullOrEmpty(LastGeneratedPdfPath) && File.Exists(LastGeneratedPdfPath))
        {
            _invoiceService.OpenPdf(LastGeneratedPdfPath);
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Opened PDF: {LastGeneratedPdfPath}");
        }
    }

    private async Task GeneratePdfAsync()
    {
        IsBusy = true;
        StatusMessage = "Generating PDF...";
        ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Initiating generation for template: {TemplateId}");

        try
        {
            using var doc = JsonDocument.Parse(JsonData);
            var req = new SdkGeneratePdfRequest(
                TemplateId: TemplateId,
                Data: doc.RootElement.Clone(),
                Title: $"Generated from WPF - {DateTime.Now:yyyy-MM-dd}");

            var response = await _client.GeneratePdfAsync(req);
            if (response.Success && response.Data != null)
            {
                StatusMessage = $"PDF Generated: {response.Data.DocumentId}";
                ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Document created successfully: {response.Data.DocumentId} ({response.Data.FileSizeBytes} bytes)");
            }
            else
            {
                StatusMessage = $"Error: {response.Message}";
                ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Failed: {response.Message}");
            }
        }
        catch (Exception ex)
        {
            StatusMessage = "Generation failed";
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Error: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task ApplyLocalWatermarkAsync()
    {
        IsBusy = true;
        StatusMessage = "Processing offline watermark...";
        ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Offline PDF manipulation requested.");

        try
        {
            using var sampleDoc = new PdfSharp.Pdf.PdfDocument();
            var page = sampleDoc.AddPage();
            using var gfx = PdfSharp.Drawing.XGraphics.FromPdfPage(page);
            gfx.DrawString("PDFStudio Local Document", new PdfSharp.Drawing.XFont("Arial", 18, PdfSharp.Drawing.XFontStyleEx.Regular), PdfSharp.Drawing.XBrushes.Black, new PdfSharp.Drawing.XPoint(100, 100));

            using var ms = new MemoryStream();
            sampleDoc.Save(ms);
            var sampleBytes = ms.ToArray();

            var watermarked = await _localManipulator.WatermarkAsync(sampleBytes, new WatermarkOptions(
                Text: "OFFLINE WATERMARK",
                Opacity: 0.4,
                RotationAngleDegrees: 45));

            StatusMessage = $"Local watermark applied! ({watermarked.Length} bytes)";
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Local PDF manipulation completed successfully. Size: {watermarked.Length} bytes");
        }
        catch (Exception ex)
        {
            StatusMessage = "Offline processing failed";
            ActivityLogs.Add($"[{DateTime.Now:HH:mm:ss}] Offline Error: {ex.Message}");
        }
        finally
        {
            IsBusy = false;
        }
    }
}
