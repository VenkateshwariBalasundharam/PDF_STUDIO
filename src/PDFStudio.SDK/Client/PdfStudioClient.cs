using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using PDFStudio.SDK.Models;
using PDFStudio.Shared.Http;

namespace PDFStudio.SDK.Client;

public interface IPdfStudioClient
{
    Task<ApiResponse<SdkGeneratePdfResponse>> GeneratePdfAsync(SdkGeneratePdfRequest request, CancellationToken cancellationToken = default);
    Task<ApiResponse<SdkJobResponse>> CreateJobAsync(SdkCreateJobRequest request, CancellationToken cancellationToken = default);
    Task<ApiResponse<SdkJobResponse>> GetJobAsync(string jobId, CancellationToken cancellationToken = default);
    Task<ApiResponse<SdkDocumentResponse>> GetDocumentAsync(string documentId, CancellationToken cancellationToken = default);
    Task<byte[]> DownloadDocumentAsync(string documentId, CancellationToken cancellationToken = default);
}

public sealed class PdfStudioClientOptions
{
    public string BaseUrl { get; set; } = "https://localhost:7001";
    public string? ApiKey { get; set; }
    public string? BearerToken { get; set; }
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);
}

public sealed class PdfStudioClient : IPdfStudioClient
{
    private readonly HttpClient _httpClient;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public PdfStudioClient(HttpClient httpClient, PdfStudioClientOptions options)
    {
        _httpClient = httpClient;
        _httpClient.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
        _httpClient.Timeout = options.Timeout;

        if (!string.IsNullOrWhiteSpace(options.ApiKey))
        {
            _httpClient.DefaultRequestHeaders.Add("X-Api-Key", options.ApiKey);
        }
        else if (!string.IsNullOrWhiteSpace(options.BearerToken))
        {
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", options.BearerToken);
        }
    }

    public async Task<ApiResponse<SdkGeneratePdfResponse>> GeneratePdfAsync(SdkGeneratePdfRequest request, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(request, JsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync("api/v1/public/pdf/generate", content, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        return JsonSerializer.Deserialize<ApiResponse<SdkGeneratePdfResponse>>(responseContent, JsonOptions)
            ?? ApiResponse<SdkGeneratePdfResponse>.Fail("DESERIALIZATION_ERROR", "Failed to deserialize server response.");
    }

    public async Task<ApiResponse<SdkJobResponse>> CreateJobAsync(SdkCreateJobRequest request, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(request, JsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.PostAsync("api/v1/public/pdf/jobs", content, cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        return JsonSerializer.Deserialize<ApiResponse<SdkJobResponse>>(responseContent, JsonOptions)
            ?? ApiResponse<SdkJobResponse>.Fail("DESERIALIZATION_ERROR", "Failed to deserialize server response.");
    }

    public async Task<ApiResponse<SdkJobResponse>> GetJobAsync(string jobId, CancellationToken cancellationToken = default)
    {
        var response = await _httpClient.GetAsync($"api/v1/public/pdf/jobs/{jobId}", cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        return JsonSerializer.Deserialize<ApiResponse<SdkJobResponse>>(responseContent, JsonOptions)
            ?? ApiResponse<SdkJobResponse>.Fail("DESERIALIZATION_ERROR", "Failed to deserialize server response.");
    }

    public async Task<ApiResponse<SdkDocumentResponse>> GetDocumentAsync(string documentId, CancellationToken cancellationToken = default)
    {
        var response = await _httpClient.GetAsync($"api/v1/public/pdf/{documentId}", cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

        return JsonSerializer.Deserialize<ApiResponse<SdkDocumentResponse>>(responseContent, JsonOptions)
            ?? ApiResponse<SdkDocumentResponse>.Fail("DESERIALIZATION_ERROR", "Failed to deserialize server response.");
    }

    public async Task<byte[]> DownloadDocumentAsync(string documentId, CancellationToken cancellationToken = default)
    {
        var response = await _httpClient.GetAsync($"api/v1/public/pdf/{documentId}/download", cancellationToken);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
    }
}

