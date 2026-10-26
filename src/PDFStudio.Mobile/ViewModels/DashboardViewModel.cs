namespace PDFStudio.Mobile.ViewModels;

public sealed class DashboardViewModel : ViewModelBase
{
    private int _totalDocuments;
    private int _activeJobs;
    private int _savedTemplates;

    public DashboardViewModel()
    {
        Title = "PDFStudio Mobile Dashboard";
        TotalDocuments = 24;
        ActiveJobs = 1;
        SavedTemplates = 8;
    }

    public int TotalDocuments
    {
        get => _totalDocuments;
        set => SetProperty(ref _totalDocuments, value);
    }

    public int ActiveJobs
    {
        get => _activeJobs;
        set => SetProperty(ref _activeJobs, value);
    }

    public int SavedTemplates
    {
        get => _savedTemplates;
        set => SetProperty(ref _savedTemplates, value);
    }

    public Task RefreshMetricsAsync()
    {
        IsBusy = true;
        // In full app, queries mobile metrics from IPdfStudioClient
        IsBusy = false;
        return Task.CompletedTask;
    }
}

