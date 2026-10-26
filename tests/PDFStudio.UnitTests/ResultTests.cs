using PDFStudio.Shared.Results;

namespace PDFStudio.UnitTests;

public class ResultTests
{
    [Fact]
    public void Success_ReturnsIsSuccessTrue_AndNoError()
    {
        var result = Result.Success();

        Assert.True(result.IsSuccess);
        Assert.False(result.IsFailure);
        Assert.Equal(Error.None, result.Error);
    }

    [Fact]
    public void Failure_ReturnsIsFailureTrue_AndPreservesError()
    {
        var error = Error.Validation("INVALID_INPUT", "The input is invalid.");
        var result = Result.Failure(error);

        Assert.False(result.IsSuccess);
        Assert.True(result.IsFailure);
        Assert.Equal(error, result.Error);
    }

    [Fact]
    public void SuccessGeneric_ReturnsValue()
    {
        var result = Result.Success("Sample Payload");

        Assert.True(result.IsSuccess);
        Assert.Equal("Sample Payload", result.Value);
    }

    [Fact]
    public void FailureGeneric_ThrowsWhenAccessingValue()
    {
        var error = Error.NotFound("DOC_NOT_FOUND", "Document was not found.");
        var result = Result.Failure<string>(error);

        Assert.True(result.IsFailure);
        Assert.Throws<InvalidOperationException>(() => _ = result.Value);
    }

    [Fact]
    public void Match_ExecutesCorrectBranch()
    {
        var successResult = Result.Success(42);
        var failureResult = Result.Failure<int>(Error.Failure("CODE", "Error occurred"));

        var successMessage = successResult.Match(
            val => $"Answer: {val}",
            err => $"Failed with {err.Code}");

        var failureMessage = failureResult.Match(
            val => $"Answer: {val}",
            err => $"Failed with {err.Code}");

        Assert.Equal("Answer: 42", successMessage);
        Assert.Equal("Failed with CODE", failureMessage);
    }
}

