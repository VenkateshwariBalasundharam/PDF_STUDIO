using PDFStudio.Storage.Providers;

namespace PDFStudio.UnitTests;

public class StorageProviderTests : IDisposable
{
    private readonly string _testDir;
    private readonly FileSystemStorageProvider _provider;

    public StorageProviderTests()
    {
        _testDir = Path.Combine(Path.GetTempPath(), "PDFStudio_StorageTests_" + Guid.NewGuid().ToString("N"));
        _provider = new FileSystemStorageProvider(_testDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_testDir))
        {
            try { Directory.Delete(_testDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public async Task SaveAndGetAsync_StoresAndRetrievesExactContent()
    {
        var key = "org/123/documents/doc1.pdf";
        var content = "PDFStudio Storage Stream Content"u8.ToArray();

        using (var inStream = new MemoryStream(content))
        {
            await _provider.SaveAsync(key, inStream, "application/pdf");
        }

        var exists = await _provider.ExistsAsync(key);
        Assert.True(exists);

        using var outStream = await _provider.GetAsync(key);
        using var ms = new MemoryStream();
        await outStream.CopyToAsync(ms);

        Assert.Equal(content, ms.ToArray());
    }

    [Fact]
    public async Task PathTraversal_AttemptsAreBlocked()
    {
        var maliciousKey = "../../../sensitive_file.txt";
        using var stream = new MemoryStream("malicious"u8.ToArray());

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _provider.SaveAsync(maliciousKey, stream, "text/plain"));
    }

    [Fact]
    public async Task DeleteAsync_RemovesFile()
    {
        var key = "org/456/temp.pdf";
        using (var stream = new MemoryStream("data"u8.ToArray()))
        {
            await _provider.SaveAsync(key, stream, "application/pdf");
        }

        Assert.True(await _provider.ExistsAsync(key));

        await _provider.DeleteAsync(key);
        Assert.False(await _provider.ExistsAsync(key));
    }
}

