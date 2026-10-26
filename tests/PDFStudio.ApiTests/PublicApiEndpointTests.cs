using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PDFStudio.ApiTests;

public class PublicApiEndpointTests : IClassFixture<WebApplicationFactory<PDFStudio.PublicApi.Program>>
{
    private readonly WebApplicationFactory<PDFStudio.PublicApi.Program> _factory;

    public PublicApiEndpointTests(WebApplicationFactory<PDFStudio.PublicApi.Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GeneratePdf_WithoutApiKey_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/public/pdf/generate", new
        {
            TemplateId = "test-template",
            Data = new { Name = "Test" }
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetJob_WithoutApiKey_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/public/pdf/jobs/job-12345");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MergePdfs_WithoutApiKey_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/public/pdf/merge", new
        {
            DocumentIds = new[] { "doc-1", "doc-2" }
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task SplitPdf_WithoutApiKey_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/public/pdf/split", new
        {
            DocumentId = "doc-1",
            Pages = new[] { 1, 2 }
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
