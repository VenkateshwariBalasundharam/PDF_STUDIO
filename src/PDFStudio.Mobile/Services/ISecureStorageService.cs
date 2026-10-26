namespace PDFStudio.Mobile.Services;

public interface ISecureStorageService
{
    Task SetAsync(string key, string value);
    Task<string?> GetAsync(string key);
    Task RemoveAsync(string key);
    Task ClearAllAsync();
}

public class InMemorySecureStorageService : ISecureStorageService
{
    private readonly Dictionary<string, string> _storage = new(StringComparer.OrdinalIgnoreCase);

    public Task SetAsync(string key, string value)
    {
        _storage[key] = value;
        return Task.CompletedTask;
    }

    public Task<string?> GetAsync(string key)
    {
        _storage.TryGetValue(key, out var val);
        return Task.FromResult(val);
    }

    public Task RemoveAsync(string key)
    {
        _storage.Remove(key);
        return Task.CompletedTask;
    }

    public Task ClearAllAsync()
    {
        _storage.Clear();
        return Task.CompletedTask;
    }
}

