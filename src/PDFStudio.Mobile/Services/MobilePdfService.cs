using PDFStudio.SDK.Client;
using PDFStudio.SDK.Models;
using PDFStudio.Shared.Http;

namespace PDFStudio.Mobile.Services;

public interface IMobilePdfService
{
    Task<ApiResponse<SdkGeneratePdfResponse>> GeneratePdfAsync(string templateId, object data, string pageSize = "A4", string orientation = "Portrait");
    Task<byte[]> DownloadDocumentAsync(string documentId);
    Task<ApiResponse<SdkJobResponse>> CheckJobStatusAsync(string jobId);
}

public class MobilePdfService : IMobilePdfService
{
    private readonly IPdfStudioClient _client;

    public MobilePdfService(IPdfStudioClient client)
    {
        _client = client;
    }

    public Task<ApiResponse<SdkGeneratePdfResponse>> GeneratePdfAsync(string templateId, object data, string pageSize = "A4", string orientation = "Portrait")
    {
        var request = new SdkGeneratePdfRequest(
            TemplateId: templateId,
            Data: data,
            PageSize: pageSize,
            Orientation: orientation
        );
        return _client.GeneratePdfAsync(request);
    }

    public Task<byte[]> DownloadDocumentAsync(string documentId)
    {
        return _client.DownloadDocumentAsync(documentId);
    }

    public Task<ApiResponse<SdkJobResponse>> CheckJobStatusAsync(string jobId)
    {
        return _client.GetJobAsync(jobId);
    }
}
