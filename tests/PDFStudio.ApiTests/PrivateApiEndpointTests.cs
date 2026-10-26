using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PDFStudio.ApiTests;

public class PrivateApiEndpointTests : IClassFixture<WebApplicationFactory<PDFStudio.PrivateApi.Program>>
{
    private readonly WebApplicationFactory<PDFStudio.PrivateApi.Program> _factory;

    public PrivateApiEndpointTests(WebApplicationFactory<PDFStudio.PrivateApi.Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetTemplates_WithoutAuthToken_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/private/templates");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateTemplate_WithoutAuthToken_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/v1/private/templates", new
        {
            Name = "Confidential Report",
            Engine = "Mustache"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetApiClients_WithoutAuthToken_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/v1/private/api-clients");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateApiKey_WithoutAuthToken_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var validGuid = Guid.NewGuid();
        var response = await client.PostAsJsonAsync($"/api/v1/private/api-clients/{validGuid}/keys", new
        {
            Name = "Test Production Key"
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
