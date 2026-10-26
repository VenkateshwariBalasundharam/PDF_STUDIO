using PDFStudio.Domain.Entities;
using PDFStudio.Domain.Enums;

namespace PDFStudio.UnitTests;

public class PdfJobStateMachineTests
{
    [Fact]
    public void NewJob_InitializesWithQueuedStatus()
    {
        var job = new PdfJob
        {
            OrganizationId = Guid.NewGuid(),
            JobNumber = "JOB-100001",
            PayloadJson = "{}"
        };

        Assert.Equal(JobStatus.Queued, job.Status);
        Assert.False(job.IsTerminal);
        Assert.Equal(0, job.AttemptCount);
    }

    [Fact]
    public void MarkProcessing_SetsWorkerLeaseAndIncrementsAttemptCount()
    {
        var job = new PdfJob
        {
            OrganizationId = Guid.NewGuid(),
            JobNumber = "JOB-100001",
            PayloadJson = "{}"
        };

        var lease = DateTimeOffset.UtcNow.AddMinutes(5);
        job.MarkProcessing("worker-node-1", lease);

        Assert.Equal(JobStatus.Processing, job.Status);
        Assert.Equal("worker-node-1", job.LockedByWorker);
        Assert.Equal(lease, job.LockedUntilUtc);
        Assert.Equal(1, job.AttemptCount);
    }

    [Fact]
    public void MarkCompleted_SetsStatusAndClearsLease()
    {
        var job = new PdfJob
        {
            OrganizationId = Guid.NewGuid(),
            JobNumber = "JOB-100001",
            PayloadJson = "{}"
        };

        job.MarkProcessing("worker-node-1", DateTimeOffset.UtcNow.AddMinutes(5));
        var completedAt = DateTimeOffset.UtcNow;
        job.MarkCompleted("{\"documentId\":\"DOC-100001\"}", completedAt);

        Assert.Equal(JobStatus.Completed, job.Status);
        Assert.True(job.IsTerminal);
        Assert.Null(job.LockedByWorker);
        Assert.Null(job.LockedUntilUtc);
        Assert.Equal(completedAt, job.CompletedAtUtc);
        Assert.Contains("DOC-100001", job.ResultJson);
    }

    [Fact]
    public void MarkFailed_WhenAttemptsRemain_ReturnsToQueuedForRetry()
    {
        var job = new PdfJob
        {
            OrganizationId = Guid.NewGuid(),
            JobNumber = "JOB-100001",
            PayloadJson = "{}",
            MaxAttempts = 3
        };

        job.MarkProcessing("worker-node-1", DateTimeOffset.UtcNow.AddMinutes(5));
        var retryAt = DateTimeOffset.UtcNow.AddSeconds(30);
        job.MarkFailed("Network timeout", canRetry: true, nextRetryAt: retryAt);

        Assert.Equal(JobStatus.Queued, job.Status);
        Assert.False(job.IsTerminal);
        Assert.Equal(retryAt, job.LockedUntilUtc);
        Assert.Null(job.LockedByWorker);
    }

    [Fact]
    public void MarkFailed_WhenMaxAttemptsExceeded_TransitionsToFailed()
    {
        var job = new PdfJob
        {
            OrganizationId = Guid.NewGuid(),
            JobNumber = "JOB-100001",
            PayloadJson = "{}",
            MaxAttempts = 1
        };

        job.MarkProcessing("worker-node-1", DateTimeOffset.UtcNow.AddMinutes(5));
        job.MarkFailed("Fatal rendering error", canRetry: true);

        Assert.Equal(JobStatus.Failed, job.Status);
        Assert.True(job.IsTerminal);
        Assert.NotNull(job.CompletedAtUtc);
        Assert.Equal("Fatal rendering error", job.ErrorMessage);
    }

    [Fact]
    public void Cancel_WhenInTerminalState_ThrowsInvalidOperationException()
    {
        var job = new PdfJob
        {
            OrganizationId = Guid.NewGuid(),
            JobNumber = "JOB-100001",
            PayloadJson = "{}"
        };

        job.MarkCompleted("{}", DateTimeOffset.UtcNow);

        Assert.Throws<InvalidOperationException>(() => job.Cancel());
    }
}

