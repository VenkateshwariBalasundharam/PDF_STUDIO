using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace PDFStudio.Mobile.ViewModels;

public abstract class ViewModelBase : INotifyPropertyChanged
{
    private bool _isBusy;
    private string? _title;

    public bool IsBusy
    {
        get => _isBusy;
        set => SetProperty(ref _isBusy, value);
    }

    public string? Title
    {
        get => _title;
        set => SetProperty(ref _title, value);
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool SetProperty<T>(ref T storage, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(storage, value))
        {
            return false;
        }

        storage = value;
        OnPropertyChanged(propertyName);
        return true;
    }

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}

