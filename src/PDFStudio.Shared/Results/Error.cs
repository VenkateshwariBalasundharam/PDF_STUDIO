namespace PDFStudio.Shared.Results;

public enum ErrorType
{
    Failure = 0,
    Validation = 1,
    NotFound = 2,
    Conflict = 3,
    Unauthorized = 4,
    Forbidden = 5,
    RateLimited = 6,
    Internal = 7
}

public sealed record Error(string Code, string Message, ErrorType Type = ErrorType.Failure)
{
    public static readonly Error None = new(string.Empty, string.Empty);
    public static readonly Error NullValue = new("ERROR_NULL_VALUE", "The specified result value is null.", ErrorType.Failure);

    public static Error Failure(string code, string message) => new(code, message, ErrorType.Failure);
    public static Error Validation(string code, string message) => new(code, message, ErrorType.Validation);
    public static Error NotFound(string code, string message) => new(code, message, ErrorType.NotFound);
    public static Error Conflict(string code, string message) => new(code, message, ErrorType.Conflict);
    public static Error Unauthorized(string code, string message) => new(code, message, ErrorType.Unauthorized);
    public static Error Forbidden(string code, string message) => new(code, message, ErrorType.Forbidden);
    public static Error RateLimited(string code, string message) => new(code, message, ErrorType.RateLimited);
    public static Error Internal(string code, string message) => new(code, message, ErrorType.Internal);
}

