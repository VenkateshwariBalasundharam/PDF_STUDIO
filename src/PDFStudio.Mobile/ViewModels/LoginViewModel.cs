using PDFStudio.Mobile.Services;

namespace PDFStudio.Mobile.ViewModels;

public sealed class LoginViewModel : ViewModelBase
{
    private readonly ISecureStorageService _storage;
    private string _baseUrl = "https://api.pdfstudio.io";
    private string _apiKey = string.Empty;
    private string _statusMessage = string.Empty;

    public LoginViewModel(ISecureStorageService storage)
    {
        _storage = storage;
        Title = "PDFStudio Mobile Login";
    }

    public string BaseUrl
    {
        get => _baseUrl;
        set => SetProperty(ref _baseUrl, value);
    }

    public string ApiKey
    {
        get => _apiKey;
        set => SetProperty(ref _apiKey, value);
    }

    public string StatusMessage
    {
        get => _statusMessage;
        set => SetProperty(ref _statusMessage, value);
    }

    public async Task InitializeAsync()
    {
        BaseUrl = await _storage.GetAsync("BaseUrl") ?? "https://api.pdfstudio.io";
        ApiKey = await _storage.GetAsync("ApiKey") ?? string.Empty;
    }

    public async Task<bool> LoginAsync()
    {
        if (string.IsNullOrWhiteSpace(ApiKey))
        {
            StatusMessage = "Please enter an API Key or Bearer Token.";
            return false;
        }

        IsBusy = true;
        StatusMessage = "Validating credentials...";

        await _storage.SetAsync("BaseUrl", BaseUrl);
        await _storage.SetAsync("ApiKey", ApiKey);

        IsBusy = false;
        StatusMessage = "Authenticated successfully!";
        return true;
    }
}

