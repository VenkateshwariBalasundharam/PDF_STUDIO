/* ============================================================================
   PDFStudio - Phase 2 - PostgreSQL schema
   Target: PostgreSQL 15+ (uses UNIQUE ... NULLS NOT DISTINCT).
   Run once on an empty database:  psql -v ON_ERROR_STOP=1 -f 001_schema.sql

   Conventions (mirror the SQL Server script):
     * Schema "pdf"; snake_case names (avoids quoted identifiers in ADO.NET SQL).
     * uuid primary keys; every business table has organization_id NOT NULL.
     * Tenant-safe foreign keys: parent has UNIQUE (organization_id, id) and the
       child references (organization_id, parent_id).
     * All times are timestamptz (UTC). Optimistic concurrency uses the built-in
       xmin system column (no explicit row_version column needed).
   ============================================================================ */
BEGIN;

CREATE SCHEMA IF NOT EXISTS pdf;

CREATE SEQUENCE pdf.document_number_seq AS bigint START WITH 100001 INCREMENT BY 1 CACHE 100;
CREATE SEQUENCE pdf.job_number_seq      AS bigint START WITH 100001 INCREMENT BY 1 CACHE 100;

/* ============================ Migration bookkeeping ============================ */
CREATE TABLE pdf.schema_versions (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    script_name    varchar(200) NOT NULL UNIQUE,
    applied_at_utc timestamptz  NOT NULL DEFAULT now()
);

/* ================================ Tenancy ================================ */
CREATE TABLE pdf.organizations (
    id             uuid         PRIMARY KEY,
    code           varchar(50)  NOT NULL UNIQUE,
    name           varchar(200) NOT NULL,
    status         smallint     NOT NULL DEFAULT 1 CHECK (status IN (1,2,3)),  -- 1 Active, 2 Suspended, 3 Deleted
    is_platform    boolean      NOT NULL DEFAULT false,
    created_at_utc timestamptz  NOT NULL DEFAULT now(),
    updated_at_utc timestamptz  NOT NULL DEFAULT now()
);

/* ============================ Identity & access ============================ */
CREATE TABLE pdf.users (
    id                 uuid          PRIMARY KEY,
    organization_id    uuid          NOT NULL REFERENCES pdf.organizations(id),
    email              varchar(256)  NOT NULL,
    display_name       varchar(200)  NOT NULL,
    password_hash      varchar(512)  NULL,
    external_subject   varchar(256)  NULL,
    is_active          boolean       NOT NULL DEFAULT true,
    failed_login_count integer       NOT NULL DEFAULT 0,
    lockout_end_utc    timestamptz   NULL,
    last_login_utc     timestamptz   NULL,
    created_at_utc     timestamptz   NOT NULL DEFAULT now(),
    updated_at_utc     timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_org_id    UNIQUE (organization_id, id),
    CONSTRAINT uq_users_org_email UNIQUE (organization_id, email)
);
CREATE INDEX ix_users_external_subject ON pdf.users (external_subject) WHERE external_subject IS NOT NULL;

CREATE TABLE pdf.roles (
    id              uuid         PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES pdf.organizations(id),
    name            varchar(100) NOT NULL,
    description     varchar(500) NULL,
    is_system       boolean      NOT NULL DEFAULT false,
    created_at_utc  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_roles_org_id   UNIQUE (organization_id, id),
    CONSTRAINT uq_roles_org_name UNIQUE (organization_id, name)
);

CREATE TABLE pdf.permissions (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(100) NOT NULL UNIQUE,
    description varchar(300) NULL
);

CREATE TABLE pdf.user_roles (
    organization_id uuid        NOT NULL,
    user_id         uuid        NOT NULL,
    role_id         uuid        NOT NULL,
    assigned_at_utc timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_users FOREIGN KEY (organization_id, user_id) REFERENCES pdf.users (organization_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_roles FOREIGN KEY (organization_id, role_id) REFERENCES pdf.roles (organization_id, id)
);
CREATE INDEX ix_user_roles_role ON pdf.user_roles (role_id);

CREATE TABLE pdf.role_permissions (
    organization_id uuid    NOT NULL,
    role_id         uuid    NOT NULL,
    permission_id   integer NOT NULL REFERENCES pdf.permissions(id),
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_roles FOREIGN KEY (organization_id, role_id) REFERENCES pdf.roles (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE pdf.refresh_tokens (
    id                   uuid        PRIMARY KEY,
    organization_id      uuid        NOT NULL,
    user_id              uuid        NOT NULL,
    token_hash           bytea       NOT NULL,
    family_id            uuid        NOT NULL,
    expires_at_utc       timestamptz NOT NULL,
    revoked_at_utc       timestamptz NULL,
    replaced_by_token_id uuid        NULL,
    created_at_utc       timestamptz NOT NULL DEFAULT now(),
    created_by_ip        varchar(45) NULL,
    CONSTRAINT fk_refresh_tokens_users FOREIGN KEY (organization_id, user_id) REFERENCES pdf.users (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ux_refresh_tokens_hash ON pdf.refresh_tokens (token_hash);
CREATE INDEX ix_refresh_tokens_family ON pdf.refresh_tokens (family_id);
CREATE INDEX ix_refresh_tokens_user   ON pdf.refresh_tokens (organization_id, user_id);

/* ============================ API management ============================ */
CREATE TABLE pdf.api_scopes (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        varchar(100) NOT NULL UNIQUE,
    description varchar(300) NULL
);

CREATE TABLE pdf.api_clients (
    id                 uuid          PRIMARY KEY,
    organization_id    uuid          NOT NULL REFERENCES pdf.organizations(id),
    name               varchar(200)  NOT NULL,
    description        varchar(500)  NULL,
    client_type        smallint      NOT NULL CHECK (client_type IN (1,2,3)),  -- 1 ApiKey, 2 OAuthClient, 3 InternalService
    status             smallint      NOT NULL DEFAULT 1 CHECK (status IN (1,2)), -- 1 Active, 2 Disabled
    allowed_ips        varchar(1000) NULL,
    oidc_client_id     varchar(200)  NULL,
    created_by_user_id uuid          NULL,
    created_at_utc     timestamptz   NOT NULL DEFAULT now(),
    updated_at_utc     timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_api_clients_org_id   UNIQUE (organization_id, id),
    CONSTRAINT uq_api_clients_org_name UNIQUE (organization_id, name),
    CONSTRAINT fk_api_clients_created_by FOREIGN KEY (organization_id, created_by_user_id) REFERENCES pdf.users (organization_id, id)
);
CREATE UNIQUE INDEX ux_api_clients_oidc_client_id ON pdf.api_clients (oidc_client_id) WHERE oidc_client_id IS NOT NULL;

CREATE TABLE pdf.api_client_scopes (
    organization_id uuid    NOT NULL,
    api_client_id   uuid    NOT NULL,
    api_scope_id    integer NOT NULL REFERENCES pdf.api_scopes(id),
    PRIMARY KEY (api_client_id, api_scope_id),
    CONSTRAINT fk_api_client_scopes_clients FOREIGN KEY (organization_id, api_client_id) REFERENCES pdf.api_clients (organization_id, id) ON DELETE CASCADE
);

CREATE TABLE pdf.api_keys (
    id                 uuid         PRIMARY KEY,
    organization_id    uuid         NOT NULL,
    api_client_id      uuid         NOT NULL,
    name               varchar(200) NOT NULL,
    key_prefix         varchar(24)  NOT NULL,
    key_hash           bytea        NOT NULL,
    status             smallint     NOT NULL DEFAULT 1 CHECK (status IN (1,2,3)),  -- 1 Active, 2 Revoked, 3 Expired
    expires_at_utc     timestamptz  NULL,
    last_used_at_utc   timestamptz  NULL,
    revoked_at_utc     timestamptz  NULL,
    revoked_by_user_id uuid         NULL,
    created_by_user_id uuid         NULL,
    created_at_utc     timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_api_keys_org_id UNIQUE (organization_id, id),
    CONSTRAINT fk_api_keys_clients FOREIGN KEY (organization_id, api_client_id) REFERENCES pdf.api_clients (organization_id, id)
);
CREATE UNIQUE INDEX ux_api_keys_prefix ON pdf.api_keys (key_prefix);
CREATE INDEX ix_api_keys_client ON pdf.api_keys (organization_id, api_client_id);

CREATE TABLE pdf.api_usage (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id   uuid         NOT NULL,
    api_client_id     uuid         NOT NULL,
    bucket_start_utc  timestamptz  NOT NULL,
    endpoint          varchar(120) NOT NULL,
    request_count     bigint       NOT NULL DEFAULT 0,
    error_count       bigint       NOT NULL DEFAULT 0,
    total_duration_ms bigint       NOT NULL DEFAULT 0,
    CONSTRAINT uq_api_usage_bucket UNIQUE (api_client_id, bucket_start_utc, endpoint),
    CONSTRAINT fk_api_usage_clients FOREIGN KEY (organization_id, api_client_id) REFERENCES pdf.api_clients (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_api_usage_org_bucket ON pdf.api_usage (organization_id, bucket_start_utc DESC);

CREATE TABLE pdf.api_rate_limits (
    id                  uuid        PRIMARY KEY,
    organization_id     uuid        NOT NULL REFERENCES pdf.organizations(id),
    api_client_id       uuid        NULL,
    permits_per_minute  integer     NOT NULL,
    permits_per_day     integer     NOT NULL,
    max_concurrent_jobs integer     NOT NULL,
    updated_at_utc      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_api_rate_limits_positive CHECK (permits_per_minute > 0 AND permits_per_day > 0 AND max_concurrent_jobs > 0),
    CONSTRAINT fk_api_rate_limits_clients FOREIGN KEY (organization_id, api_client_id) REFERENCES pdf.api_clients (organization_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ux_api_rate_limits_client   ON pdf.api_rate_limits (organization_id, api_client_id) WHERE api_client_id IS NOT NULL;
CREATE UNIQUE INDEX ux_api_rate_limits_org_dflt ON pdf.api_rate_limits (organization_id) WHERE api_client_id IS NULL;

/* ================================ Templates ================================ */
CREATE TABLE pdf.pdf_templates (
    id                 uuid          PRIMARY KEY,
    organization_id    uuid          NOT NULL REFERENCES pdf.organizations(id),
    template_key       varchar(100)  NOT NULL,
    name               varchar(200)  NOT NULL,
    description        varchar(1000) NULL,
    category           varchar(100)  NULL,
    status             smallint      NOT NULL DEFAULT 1 CHECK (status IN (1,2,3)),  -- 1 Active, 2 Inactive, 3 Archived
    current_version_id uuid          NULL,
    created_by_user_id uuid          NULL,
    created_at_utc     timestamptz   NOT NULL DEFAULT now(),
    updated_at_utc     timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_pdf_templates_org_id  UNIQUE (organization_id, id),
    CONSTRAINT uq_pdf_templates_org_key UNIQUE (organization_id, template_key),
    CONSTRAINT fk_pdf_templates_created_by FOREIGN KEY (organization_id, created_by_user_id) REFERENCES pdf.users (organization_id, id)
);

CREATE TABLE pdf.pdf_template_versions (
    id                   uuid        PRIMARY KEY,
    organization_id      uuid        NOT NULL,
    template_id          uuid        NOT NULL,
    version_number       integer     NOT NULL,
    status               smallint    NOT NULL DEFAULT 1 CHECK (status IN (1,2,3)),  -- 1 Draft, 2 Published, 3 Deprecated
    html_content         text        NOT NULL,
    css_content          text        NULL,
    header_html          text        NULL,
    footer_html          text        NULL,
    page_settings_json   jsonb       NULL,
    locale               varchar(20) NOT NULL DEFAULT 'en-US',
    content_hash         char(64)    NULL,
    change_note          varchar(500) NULL,
    published_at_utc     timestamptz NULL,
    published_by_user_id uuid        NULL,
    created_by_user_id   uuid        NULL,
    created_at_utc       timestamptz NOT NULL DEFAULT now(),
    updated_at_utc       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_pdf_template_versions_org_id UNIQUE (organization_id, id),
    CONSTRAINT uq_pdf_template_versions_number UNIQUE (template_id, version_number),
    CONSTRAINT fk_pdf_template_versions_templates FOREIGN KEY (organization_id, template_id) REFERENCES pdf.pdf_templates (organization_id, id)
);

ALTER TABLE pdf.pdf_templates ADD CONSTRAINT fk_pdf_templates_current_version
    FOREIGN KEY (organization_id, current_version_id) REFERENCES pdf.pdf_template_versions (organization_id, id);

CREATE TABLE pdf.pdf_template_fields (
    id                  uuid          PRIMARY KEY,
    organization_id     uuid          NOT NULL,
    template_version_id uuid          NOT NULL,
    field_path          varchar(200)  NOT NULL,
    label               varchar(200)  NULL,
    data_type           smallint      NOT NULL CHECK (data_type BETWEEN 1 AND 6),  -- 1 String, 2 Number, 3 Boolean, 4 Date, 5 Array, 6 Object
    is_required         boolean       NOT NULL DEFAULT false,
    format_pattern      varchar(100)  NULL,
    default_value       varchar(1000) NULL,
    sort_order          integer       NOT NULL DEFAULT 0,
    CONSTRAINT uq_pdf_template_fields_path UNIQUE (template_version_id, field_path),
    CONSTRAINT fk_pdf_template_fields_versions FOREIGN KEY (organization_id, template_version_id) REFERENCES pdf.pdf_template_versions (organization_id, id) ON DELETE CASCADE
);

/* ============================ Storage & documents ============================ */
CREATE TABLE pdf.storage_objects (
    id              uuid         PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES pdf.organizations(id),
    provider        varchar(30)  NOT NULL,
    container       varchar(200) NULL,
    object_key      varchar(500) NOT NULL,
    size_bytes      bigint       NOT NULL CHECK (size_bytes >= 0),
    content_type    varchar(100) NOT NULL,
    sha256          char(64)     NULL,
    status          smallint     NOT NULL DEFAULT 1 CHECK (status IN (1,2,3)),  -- 1 Active, 2 PendingDelete, 3 Deleted
    created_at_utc  timestamptz  NOT NULL DEFAULT now(),
    deleted_at_utc  timestamptz  NULL,
    CONSTRAINT uq_storage_objects_org_id  UNIQUE (organization_id, id),
    CONSTRAINT uq_storage_objects_org_key UNIQUE (organization_id, provider, object_key)
);
CREATE INDEX ix_storage_objects_cleanup ON pdf.storage_objects (status, created_at_utc) WHERE status <> 1;

CREATE TABLE pdf.documents (
    id                      uuid         PRIMARY KEY,
    organization_id         uuid         NOT NULL REFERENCES pdf.organizations(id),
    public_id               varchar(30)  NOT NULL,
    title                   varchar(300) NOT NULL,
    template_id             uuid         NULL,
    template_version_id     uuid         NULL,
    current_version_id      uuid         NULL,
    status                  smallint     NOT NULL DEFAULT 1 CHECK (status IN (1,2,3,4)),  -- 1 Active, 2 Archived, 3 Deleted, 4 Expired
    is_favorite             boolean      NOT NULL DEFAULT false,
    expires_at_utc          timestamptz  NULL,
    created_by_user_id      uuid         NULL,
    created_by_api_client_id uuid        NULL,
    created_at_utc          timestamptz  NOT NULL DEFAULT now(),
    updated_at_utc          timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_documents_org_id        UNIQUE (organization_id, id),
    CONSTRAINT uq_documents_org_public_id UNIQUE (organization_id, public_id),
    CONSTRAINT fk_documents_templates         FOREIGN KEY (organization_id, template_id)             REFERENCES pdf.pdf_templates (organization_id, id),
    CONSTRAINT fk_documents_template_versions FOREIGN KEY (organization_id, template_version_id)     REFERENCES pdf.pdf_template_versions (organization_id, id),
    CONSTRAINT fk_documents_created_by_user   FOREIGN KEY (organization_id, created_by_user_id)      REFERENCES pdf.users (organization_id, id),
    CONSTRAINT fk_documents_created_by_client FOREIGN KEY (organization_id, created_by_api_client_id) REFERENCES pdf.api_clients (organization_id, id)
);
CREATE INDEX ix_documents_org_created  ON pdf.documents (organization_id, status, created_at_utc DESC);
CREATE INDEX ix_documents_org_favorite ON pdf.documents (organization_id, created_at_utc DESC) WHERE is_favorite;
CREATE INDEX ix_documents_expiry       ON pdf.documents (expires_at_utc) WHERE expires_at_utc IS NOT NULL AND status = 1;

CREATE TABLE pdf.document_versions (
    id                uuid        PRIMARY KEY,
    organization_id   uuid        NOT NULL,
    document_id       uuid        NOT NULL,
    version_number    integer     NOT NULL,
    storage_object_id uuid        NOT NULL,
    page_count        integer     NULL,
    size_bytes        bigint      NOT NULL,
    sha256            char(64)    NULL,
    is_encrypted      boolean     NOT NULL DEFAULT false,
    created_at_utc    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_document_versions_org_id UNIQUE (organization_id, id),
    CONSTRAINT uq_document_versions_number UNIQUE (document_id, version_number),
    CONSTRAINT fk_document_versions_documents FOREIGN KEY (organization_id, document_id)       REFERENCES pdf.documents (organization_id, id),
    CONSTRAINT fk_document_versions_storage   FOREIGN KEY (organization_id, storage_object_id) REFERENCES pdf.storage_objects (organization_id, id)
);
CREATE INDEX ix_document_versions_storage ON pdf.document_versions (storage_object_id);

ALTER TABLE pdf.documents ADD CONSTRAINT fk_documents_current_version
    FOREIGN KEY (organization_id, current_version_id) REFERENCES pdf.document_versions (organization_id, id);

CREATE TABLE pdf.document_metadata (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id uuid          NOT NULL,
    document_id     uuid          NOT NULL,
    meta_key        varchar(100)  NOT NULL,
    meta_value      varchar(2000) NULL,
    CONSTRAINT uq_document_metadata_key UNIQUE (document_id, meta_key),
    CONSTRAINT fk_document_metadata_documents FOREIGN KEY (organization_id, document_id) REFERENCES pdf.documents (organization_id, id) ON DELETE CASCADE
);

/* ================================== Jobs ================================== */
CREATE TABLE pdf.pdf_jobs (
    id                  uuid         PRIMARY KEY,
    organization_id     uuid         NOT NULL REFERENCES pdf.organizations(id),
    public_id           varchar(30)  NOT NULL,
    job_type            smallint     NOT NULL CHECK (job_type BETWEEN 1 AND 6),  -- 1 Generate, 2 Merge, 3 Split, 4 Stamp, 5 Watermark, 6 Batch
    status              smallint     NOT NULL DEFAULT 1 CHECK (status BETWEEN 1 AND 6), -- 1 Queued, 2 Processing, 3 Completed, 4 Failed, 5 Cancelled, 6 Expired
    priority            smallint     NOT NULL DEFAULT 5,
    template_version_id uuid         NULL,
    request_payload     jsonb        NOT NULL,
    result_document_id  uuid         NULL,
    idempotency_key     varchar(100) NULL,
    attempt_count       integer      NOT NULL DEFAULT 0,
    max_attempts        integer      NOT NULL DEFAULT 5,
    next_attempt_at_utc timestamptz  NOT NULL DEFAULT now(),
    locked_by           varchar(100) NULL,
    locked_until_utc    timestamptz  NULL,
    error_code          varchar(100) NULL,
    error_message       varchar(1000) NULL,
    api_client_id       uuid         NULL,
    user_id             uuid         NULL,
    correlation_id      varchar(64)  NULL,
    queued_at_utc       timestamptz  NOT NULL DEFAULT now(),
    started_at_utc      timestamptz  NULL,
    completed_at_utc    timestamptz  NULL,
    expires_at_utc      timestamptz  NULL,
    CONSTRAINT uq_pdf_jobs_org_id        UNIQUE (organization_id, id),
    CONSTRAINT uq_pdf_jobs_org_public_id UNIQUE (organization_id, public_id),
    CONSTRAINT fk_pdf_jobs_template_versions FOREIGN KEY (organization_id, template_version_id) REFERENCES pdf.pdf_template_versions (organization_id, id),
    CONSTRAINT fk_pdf_jobs_result_document   FOREIGN KEY (organization_id, result_document_id)  REFERENCES pdf.documents (organization_id, id),
    CONSTRAINT fk_pdf_jobs_api_clients       FOREIGN KEY (organization_id, api_client_id)       REFERENCES pdf.api_clients (organization_id, id),
    CONSTRAINT fk_pdf_jobs_users             FOREIGN KEY (organization_id, user_id)             REFERENCES pdf.users (organization_id, id)
);
CREATE UNIQUE INDEX ux_pdf_jobs_idempotency ON pdf.pdf_jobs (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Dequeue:  SELECT ... WHERE status = 1 AND next_attempt_at_utc <= now() ORDER BY priority DESC, next_attempt_at_utc
--           FOR UPDATE SKIP LOCKED LIMIT n
CREATE INDEX ix_pdf_jobs_dequeue ON pdf.pdf_jobs (priority DESC, next_attempt_at_utc, queued_at_utc) WHERE status = 1;
CREATE INDEX ix_pdf_jobs_lease   ON pdf.pdf_jobs (locked_until_utc) WHERE status = 2;
CREATE INDEX ix_pdf_jobs_org_status ON pdf.pdf_jobs (organization_id, status, queued_at_utc DESC);

CREATE TABLE pdf.pdf_job_items (
    id                 uuid          PRIMARY KEY,
    organization_id    uuid          NOT NULL,
    job_id             uuid          NOT NULL,
    item_index         integer       NOT NULL,
    status             smallint      NOT NULL DEFAULT 1 CHECK (status BETWEEN 1 AND 6),
    input_payload      jsonb         NULL,
    result_document_id uuid          NULL,
    error_code         varchar(100)  NULL,
    error_message      varchar(1000) NULL,
    completed_at_utc   timestamptz   NULL,
    CONSTRAINT uq_pdf_job_items_index UNIQUE (job_id, item_index),
    CONSTRAINT fk_pdf_job_items_jobs      FOREIGN KEY (organization_id, job_id)             REFERENCES pdf.pdf_jobs (organization_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_pdf_job_items_documents FOREIGN KEY (organization_id, result_document_id) REFERENCES pdf.documents (organization_id, id)
);

/* ================================ Webhooks ================================ */
CREATE TABLE pdf.webhooks (
    id               uuid          PRIMARY KEY,
    organization_id  uuid          NOT NULL REFERENCES pdf.organizations(id),
    name             varchar(200)  NOT NULL,
    target_url       varchar(1000) NOT NULL CHECK (target_url LIKE 'https://%'),
    secret_protected bytea         NOT NULL,   -- encrypted (must be recoverable to sign payloads), unlike API keys
    event_types      varchar(500)  NOT NULL,
    is_active        boolean       NOT NULL DEFAULT true,
    api_client_id    uuid          NULL,
    created_at_utc   timestamptz   NOT NULL DEFAULT now(),
    updated_at_utc   timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT uq_webhooks_org_id   UNIQUE (organization_id, id),
    CONSTRAINT uq_webhooks_org_name UNIQUE (organization_id, name),
    CONSTRAINT fk_webhooks_api_clients FOREIGN KEY (organization_id, api_client_id) REFERENCES pdf.api_clients (organization_id, id)
);

CREATE TABLE pdf.webhook_events (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id     uuid         NOT NULL,
    webhook_id          uuid         NOT NULL,
    event_type          varchar(60)  NOT NULL,
    entity_public_id    varchar(30)  NULL,
    payload             jsonb        NOT NULL,
    status              smallint     NOT NULL DEFAULT 1 CHECK (status BETWEEN 1 AND 4),  -- 1 Pending, 2 Delivered, 3 Retrying, 4 DeadLetter
    attempt_count       integer      NOT NULL DEFAULT 0,
    next_attempt_at_utc timestamptz  NOT NULL DEFAULT now(),
    locked_by           varchar(100) NULL,
    locked_until_utc    timestamptz  NULL,
    last_status_code    integer      NULL,
    last_error          varchar(500) NULL,
    created_at_utc      timestamptz  NOT NULL DEFAULT now(),
    delivered_at_utc    timestamptz  NULL,
    CONSTRAINT fk_webhook_events_webhooks FOREIGN KEY (organization_id, webhook_id) REFERENCES pdf.webhooks (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_webhook_events_dispatch ON pdf.webhook_events (next_attempt_at_utc) WHERE status IN (1,3);
CREATE INDEX ix_webhook_events_webhook  ON pdf.webhook_events (organization_id, webhook_id, created_at_utc DESC);

/* ============================ Audit & security logs ============================ */
CREATE TABLE pdf.audit_logs (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id uuid         NULL,
    event_type      varchar(60)  NOT NULL,
    actor_type      smallint     NOT NULL,   -- 1 User, 2 ApiClient, 3 System
    actor_id        uuid         NULL,
    entity_type     varchar(60)  NULL,
    entity_id       varchar(64)  NULL,
    details         jsonb        NULL,
    ip_address      varchar(45)  NULL,
    correlation_id  varchar(64)  NULL,
    occurred_at_utc timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_logs_org_time   ON pdf.audit_logs (organization_id, occurred_at_utc DESC);
CREATE INDEX ix_audit_logs_event_time ON pdf.audit_logs (event_type, occurred_at_utc DESC);
CREATE INDEX ix_audit_logs_entity     ON pdf.audit_logs (entity_type, entity_id);

CREATE TABLE pdf.security_logs (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id uuid         NULL,
    event_type      varchar(60)  NOT NULL,
    severity        smallint     NOT NULL CHECK (severity BETWEEN 1 AND 4),  -- 1 Info, 2 Warning, 3 High, 4 Critical
    subject         varchar(256) NULL,
    ip_address      varchar(45)  NULL,
    user_agent      varchar(300) NULL,
    details         jsonb        NULL,
    correlation_id  varchar(64)  NULL,
    occurred_at_utc timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_security_logs_org_time ON pdf.security_logs (organization_id, occurred_at_utc DESC);
CREATE INDEX ix_security_logs_ip_time  ON pdf.security_logs (ip_address, occurred_at_utc DESC);
CREATE INDEX ix_security_logs_severity ON pdf.security_logs (severity, occurred_at_utc DESC) WHERE severity >= 3;

/* ============================ Settings & licensing ============================ */
CREATE TABLE pdf.system_settings (
    id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id uuid         NULL REFERENCES pdf.organizations(id),   -- NULL = global default
    setting_key     varchar(150) NOT NULL,
    setting_value   text         NULL,
    is_secret       boolean      NOT NULL DEFAULT false,
    updated_at_utc  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_system_settings_key UNIQUE NULLS NOT DISTINCT (organization_id, setting_key)
);

CREATE TABLE pdf.licenses (
    id              uuid        PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES pdf.organizations(id),
    edition         varchar(30) NOT NULL CHECK (edition IN ('Trial','Community','Professional','Enterprise')),
    status          smallint    NOT NULL DEFAULT 1 CHECK (status IN (1,2,3)),  -- 1 Active, 2 Expired, 3 Suspended
    starts_at_utc   timestamptz NOT NULL,
    expires_at_utc  timestamptz NULL,
    limits_json     jsonb       NOT NULL,
    created_at_utc  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_licenses_org ON pdf.licenses (organization_id, status);

CREATE TABLE pdf.license_usage (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id uuid        NOT NULL REFERENCES pdf.organizations(id),
    period_start    date        NOT NULL,
    metric          varchar(50) NOT NULL,
    used_value      bigint      NOT NULL DEFAULT 0,
    CONSTRAINT uq_license_usage UNIQUE (organization_id, period_start, metric)
);

INSERT INTO pdf.schema_versions (script_name) VALUES ('001_schema.sql');

COMMIT;
