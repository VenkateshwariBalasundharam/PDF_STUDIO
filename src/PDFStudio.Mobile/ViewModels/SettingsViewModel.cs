using PDFStudio.Mobile.Services;

namespace PDFStudio.Mobile.ViewModels;

public sealed class SettingsViewModel : ViewModelBase
{
    private readonly ISecureStorageService _storage;
    private string _apiUrl = "https://api.pdfstudio.io";
    private bool _enableOfflineCaching = true;
    private bool _autoDownloadPdfs = true;

    public SettingsViewModel(ISecureStorageService storage)
    {
        _storage = storage;
        Title = "Mobile App Settings";
    }

    public string ApiUrl
    {
        get => _apiUrl;
        set => SetProperty(ref _apiUrl, value);
    }

    public bool EnableOfflineCaching
    {
        get => _enableOfflineCaching;
        set => SetProperty(ref _enableOfflineCaching, value);
    }

    public bool AutoDownloadPdfs
    {
        get => _autoDownloadPdfs;
        set => SetProperty(ref _autoDownloadPdfs, value);
    }

    public async Task SaveAsync()
    {
        IsBusy = true;
        await _storage.SetAsync("ApiUrl", ApiUrl);
        IsBusy = false;
    }
}

