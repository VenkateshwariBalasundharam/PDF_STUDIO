namespace PDFStudio.Mobile.Services;

public interface IShareService
{
    Task ShareFileAsync(string title, string fileName, byte[] data, string contentType = "application/pdf");
}

public class MobileShareService : IShareService
{
    public Task ShareFileAsync(string title, string fileName, byte[] data, string contentType = "application/pdf")
    {
        // Cross-platform MAUI share invocation logic
        // In full MAUI runtime: await Share.Default.RequestAsync(new ShareFileRequest { ... });
        return Task.CompletedTask;
    }
}

