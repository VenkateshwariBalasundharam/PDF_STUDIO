using System.Net.Http;
using System.Windows;
using PDFStudio.PdfEngine.Services;
using PDFStudio.SDK.Client;
using PDFStudio.Windows.ViewModels;

namespace PDFStudio.Windows;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();

        var options = new PdfStudioClientOptions
        {
            BaseUrl = "https://localhost:7001",
            ApiKey = "ps_live_demo_key_1234567890"
        };
        var httpClient = new HttpClient();
        var client = new PdfStudioClient(httpClient, options);
        var localManipulator = new PdfSharpManipulator();

        DataContext = new MainViewModel(client, localManipulator);
    }
}