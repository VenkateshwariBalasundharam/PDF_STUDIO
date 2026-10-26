namespace PDFStudio.Shared.Http;

public sealed record ApiError(string Code, string Message, string? Target = null);

public sealed record ApiResponse<T>
{
    public bool Success { get; init; }
    public string? Code { get; init; }
    public string? Message { get; init; }
    public string? CorrelationId { get; init; }
    public T? Data { get; init; }
    public IReadOnlyList<ApiError> Errors { get; init; } = Array.Empty<ApiError>();
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;

    public static ApiResponse<T> Ok(T data, string? message = null, string? correlationId = null) =>
        new()
        {
            Success = true,
            Code = "SUCCESS",
            Message = message ?? "Operation completed successfully.",
            CorrelationId = correlationId,
            Data = data,
            Errors = Array.Empty<ApiError>()
        };

    public static ApiResponse<T> Fail(
        string code,
        string message,
        string? correlationId = null,
        IReadOnlyList<ApiError>? errors = null) =>
        new()
        {
            Success = false,
            Code = code,
            Message = message,
            CorrelationId = correlationId,
            Data = default,
            Errors = errors ?? Array.Empty<ApiError>()
        };
}

public sealed record ApiResponse
{
    public bool Success { get; init; }
    public string? Code { get; init; }
    public string? Message { get; init; }
    public string? CorrelationId { get; init; }
    public IReadOnlyList<ApiError> Errors { get; init; } = Array.Empty<ApiError>();
    public DateTimeOffset Timestamp { get; init; } = DateTimeOffset.UtcNow;

    public static ApiResponse Ok(string? message = null, string? correlationId = null) =>
        new()
        {
            Success = true,
            Code = "SUCCESS",
            Message = message ?? "Operation completed successfully.",
            CorrelationId = correlationId,
            Errors = Array.Empty<ApiError>()
        };

    public static ApiResponse Fail(
        string code,
        string message,
        string? correlationId = null,
        IReadOnlyList<ApiError>? errors = null) =>
        new()
        {
            Success = false,
            Code = code,
            Message = message,
            CorrelationId = correlationId,
            Errors = errors ?? Array.Empty<ApiError>()
        };
}

