using System.Collections.ObjectModel;

namespace PDFStudio.Mobile.ViewModels;

public sealed class TemplateItem
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Engine { get; set; } = "Mustache";
    public int Version { get; set; } = 1;
}

public sealed class TemplatesViewModel : ViewModelBase
{
    public ObservableCollection<TemplateItem> Templates { get; } = new();

    public TemplatesViewModel()
    {
        Title = "Templates";
        Templates.Add(new TemplateItem
        {
            Id = "tpl-invoice",
            Name = "Enterprise Invoice",
            Description = "Standard commercial multi-currency invoice",
            Engine = "Mustache",
            Version = 2
        });
        Templates.Add(new TemplateItem
        {
            Id = "tpl-cert",
            Name = "Completion Certificate",
            Description = "Landscape graduation/completion certificate",
            Engine = "Mustache",
            Version = 1
        });
    }
}

