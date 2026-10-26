-- 003: columns the data-access layer needs that 001_schema.sql did not define.
-- Idempotent; safe to re-run.  psql -v ON_ERROR_STOP=1 -d pdfstudio -f db/postgres/003_align_repositories.sql

-- Job result payload (JSON) kept alongside result_document_id.
ALTER TABLE pdf.pdf_jobs
    ADD COLUMN IF NOT EXISTS result_json jsonb NULL;

-- Per-client request ceiling used by the API layer.
ALTER TABLE pdf.api_clients
    ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer NOT NULL DEFAULT 60;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_api_clients_rate_limit') THEN
        ALTER TABLE pdf.api_clients
            ADD CONSTRAINT ck_api_clients_rate_limit CHECK (rate_limit_per_minute > 0);
    END IF;
END $$;
