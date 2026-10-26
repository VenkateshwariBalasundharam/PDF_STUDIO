using PDFStudio.Application.Engines;

namespace PDFStudio.Storage.Providers;

public sealed class FileSystemStorageProvider : IStorageProvider
{
    private readonly string _baseDirectory;

    public string ProviderName => "FileSystem";

    public FileSystemStorageProvider(string? baseDirectory = null)
    {
        _baseDirectory = baseDirectory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "PDFStudio",
            "Storage");

        Directory.CreateDirectory(_baseDirectory);
    }

    private string ResolveSafePath(string storageKey)
    {
        // Sanitize and protect against path traversal
        var normalizedKey = storageKey.Replace('\\', '/').TrimStart('/');
        var segments = normalizedKey.Split('/', StringSplitOptions.RemoveEmptyEntries);

        foreach (var segment in segments)
        {
            if (segment == ".." || segment == "." || segment.Contains(':'))
            {
                throw new InvalidOperationException($"Invalid storage key path traversal detected: '{storageKey}'.");
            }
        }

        var fullPath = Path.GetFullPath(Path.Combine(_baseDirectory, Path.Combine(segments)));
        var safeBasePath = Path.GetFullPath(_baseDirectory);

        if (!fullPath.StartsWith(safeBasePath, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Resolved storage path '{fullPath}' escaped storage root.");
        }

        return fullPath;
    }

    public async Task<string> SaveAsync(
        string storageKey,
        Stream contentStream,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var targetPath = ResolveSafePath(storageKey);

        var dir = Path.GetDirectoryName(targetPath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        await using var fileStream = new FileStream(
            targetPath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 81920,
            useAsync: true);

        await contentStream.CopyToAsync(fileStream, cancellationToken);
        return storageKey;
    }

    public Task<Stream> GetAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var targetPath = ResolveSafePath(storageKey);

        if (!File.Exists(targetPath))
        {
            throw new FileNotFoundException($"Storage object '{storageKey}' does not exist on disk.");
        }

        Stream fileStream = new FileStream(
            targetPath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 81920,
            useAsync: true);

        return Task.FromResult(fileStream);
    }

    public Task DeleteAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var targetPath = ResolveSafePath(storageKey);

        if (File.Exists(targetPath))
        {
            File.Delete(targetPath);
        }

        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var targetPath = ResolveSafePath(storageKey);
        return Task.FromResult(File.Exists(targetPath));
    }
}

