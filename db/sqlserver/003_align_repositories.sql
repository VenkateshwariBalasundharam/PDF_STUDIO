-- 003: columns the data-access layer needs that 001_schema.sql did not define.
-- Idempotent; safe to re-run.  sqlcmd -S localhost -d PDFStudio -b -i db/sqlserver/003_align_repositories.sql

IF COL_LENGTH('pdf.PdfJobs', 'ResultJson') IS NULL
    ALTER TABLE pdf.PdfJobs ADD ResultJson nvarchar(max) NULL;

IF COL_LENGTH('pdf.ApiClients', 'RateLimitPerMinute') IS NULL
    ALTER TABLE pdf.ApiClients ADD RateLimitPerMinute int NOT NULL
        CONSTRAINT DF_ApiClients_RateLimit DEFAULT 60;
