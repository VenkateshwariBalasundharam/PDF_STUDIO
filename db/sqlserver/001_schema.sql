/* ============================================================================
   PDFStudio - Phase 2 - SQL Server schema
   Target: SQL Server 2019+ (works on 2022). Idempotent: run once on an empty DB.
   Conventions:
     * Schema [pdf]; PascalCase names; UNIQUEIDENTIFIER primary keys.
     * Every business table carries OrganizationId NOT NULL.
     * Tenant-safe foreign keys: parent has UNIQUE (OrganizationId, Id) and the
       child references (OrganizationId, ParentId), so a child row can never
       point at a parent in another organization.
     * All times are UTC (datetime2). RowVersion used for optimistic concurrency.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF SCHEMA_ID(N'pdf') IS NULL EXEC(N'CREATE SCHEMA pdf AUTHORIZATION dbo;');
GO

/* ---------- Sequences for public, human-readable IDs (DOC-100001, JOB-100001) ---------- */
CREATE SEQUENCE pdf.DocumentNumberSeq AS bigint START WITH 100001 INCREMENT BY 1 CACHE 100;
CREATE SEQUENCE pdf.JobNumberSeq      AS bigint START WITH 100001 INCREMENT BY 1 CACHE 100;
GO

/* ============================ Migration bookkeeping ============================ */
CREATE TABLE pdf.SchemaVersions (
    Id            int IDENTITY(1,1) CONSTRAINT PK_SchemaVersions PRIMARY KEY,
    ScriptName    nvarchar(200) NOT NULL CONSTRAINT UQ_SchemaVersions_ScriptName UNIQUE,
    AppliedAtUtc  datetime2(3)  NOT NULL CONSTRAINT DF_SchemaVersions_Applied DEFAULT SYSUTCDATETIME()
);
GO

/* ================================ Tenancy ================================ */
CREATE TABLE pdf.Organizations (
    Id            uniqueidentifier NOT NULL CONSTRAINT PK_Organizations PRIMARY KEY,
    Code          nvarchar(50)     NOT NULL,                       -- stable slug, e.g. 'acme'
    Name          nvarchar(200)    NOT NULL,
    Status        tinyint          NOT NULL CONSTRAINT DF_Organizations_Status DEFAULT 1, -- 1 Active, 2 Suspended, 3 Deleted
    IsPlatform    bit              NOT NULL CONSTRAINT DF_Organizations_IsPlatform DEFAULT 0, -- operator org (platform admins)
    CreatedAtUtc  datetime2(3)     NOT NULL CONSTRAINT DF_Organizations_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc  datetime2(3)     NOT NULL CONSTRAINT DF_Organizations_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion    rowversion       NOT NULL,
    CONSTRAINT UQ_Organizations_Code UNIQUE (Code),
    CONSTRAINT CK_Organizations_Status CHECK (Status IN (1,2,3))
);
GO

/* ============================ Identity & access ============================ */
CREATE TABLE pdf.Users (
    Id                uniqueidentifier NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    OrganizationId    uniqueidentifier NOT NULL,
    Email             nvarchar(256)    NOT NULL,
    DisplayName       nvarchar(200)    NOT NULL,
    PasswordHash      nvarchar(512)    NULL,              -- PBKDF2 string incl. salt/iterations; NULL = cannot sign in locally
    ExternalSubject   nvarchar(256)    NULL,              -- OIDC 'sub'
    IsActive          bit              NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
    FailedLoginCount  int              NOT NULL CONSTRAINT DF_Users_Failed DEFAULT 0,
    LockoutEndUtc     datetime2(3)     NULL,
    LastLoginUtc      datetime2(3)     NULL,
    CreatedAtUtc      datetime2(3)     NOT NULL CONSTRAINT DF_Users_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc      datetime2(3)     NOT NULL CONSTRAINT DF_Users_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion        rowversion       NOT NULL,
    CONSTRAINT FK_Users_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT UQ_Users_Org_Id    UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_Users_Org_Email UNIQUE (OrganizationId, Email)
);
CREATE INDEX IX_Users_ExternalSubject ON pdf.Users (ExternalSubject) WHERE ExternalSubject IS NOT NULL;
GO

CREATE TABLE pdf.Roles (
    Id              uniqueidentifier NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    Name            nvarchar(100)    NOT NULL,
    Description     nvarchar(500)    NULL,
    IsSystem        bit              NOT NULL CONSTRAINT DF_Roles_IsSystem DEFAULT 0,
    CreatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_Roles_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Roles_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT UQ_Roles_Org_Id   UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_Roles_Org_Name UNIQUE (OrganizationId, Name)
);
GO

-- Global permission catalog (not tenant data).
CREATE TABLE pdf.Permissions (
    Id           int IDENTITY(1,1) CONSTRAINT PK_Permissions PRIMARY KEY,
    Code         varchar(100)  NOT NULL CONSTRAINT UQ_Permissions_Code UNIQUE,
    Description  nvarchar(300) NULL
);
GO

CREATE TABLE pdf.UserRoles (
    OrganizationId uniqueidentifier NOT NULL,
    UserId         uniqueidentifier NOT NULL,
    RoleId         uniqueidentifier NOT NULL,
    AssignedAtUtc  datetime2(3)     NOT NULL CONSTRAINT DF_UserRoles_Assigned DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId),
    CONSTRAINT FK_UserRoles_Users FOREIGN KEY (OrganizationId, UserId) REFERENCES pdf.Users(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT FK_UserRoles_Roles FOREIGN KEY (OrganizationId, RoleId) REFERENCES pdf.Roles(OrganizationId, Id)
);
CREATE INDEX IX_UserRoles_Role ON pdf.UserRoles (RoleId);
GO

CREATE TABLE pdf.RolePermissions (
    OrganizationId uniqueidentifier NOT NULL,
    RoleId         uniqueidentifier NOT NULL,
    PermissionId   int              NOT NULL,
    CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleId, PermissionId),
    CONSTRAINT FK_RolePermissions_Roles FOREIGN KEY (OrganizationId, RoleId) REFERENCES pdf.Roles(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT FK_RolePermissions_Permissions FOREIGN KEY (PermissionId) REFERENCES pdf.Permissions(Id)
);
GO

CREATE TABLE pdf.RefreshTokens (
    Id                 uniqueidentifier NOT NULL CONSTRAINT PK_RefreshTokens PRIMARY KEY,
    OrganizationId     uniqueidentifier NOT NULL,
    UserId             uniqueidentifier NOT NULL,
    TokenHash          varbinary(64)    NOT NULL,         -- hash only; raw token is never stored
    FamilyId           uniqueidentifier NOT NULL,         -- rotation family, for reuse detection
    ExpiresAtUtc       datetime2(3)     NOT NULL,
    RevokedAtUtc       datetime2(3)     NULL,
    ReplacedByTokenId  uniqueidentifier NULL,
    CreatedAtUtc       datetime2(3)     NOT NULL CONSTRAINT DF_RefreshTokens_Created DEFAULT SYSUTCDATETIME(),
    CreatedByIp        varchar(45)      NULL,
    CONSTRAINT FK_RefreshTokens_Users FOREIGN KEY (OrganizationId, UserId) REFERENCES pdf.Users(OrganizationId, Id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX UX_RefreshTokens_Hash ON pdf.RefreshTokens (TokenHash);
CREATE INDEX IX_RefreshTokens_Family ON pdf.RefreshTokens (FamilyId);
CREATE INDEX IX_RefreshTokens_User   ON pdf.RefreshTokens (OrganizationId, UserId);
GO

/* ============================ API management ============================ */
-- Global scope catalog (pdf:generate, ...).
CREATE TABLE pdf.ApiScopes (
    Id           int IDENTITY(1,1) CONSTRAINT PK_ApiScopes PRIMARY KEY,
    Code         varchar(100)  NOT NULL CONSTRAINT UQ_ApiScopes_Code UNIQUE,
    Description  nvarchar(300) NULL
);
GO

CREATE TABLE pdf.ApiClients (
    Id              uniqueidentifier NOT NULL CONSTRAINT PK_ApiClients PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    Name            nvarchar(200)    NOT NULL,
    Description     nvarchar(500)    NULL,
    ClientType      tinyint          NOT NULL,            -- 1 ApiKey, 2 OAuthClient, 3 InternalService
    Status          tinyint          NOT NULL CONSTRAINT DF_ApiClients_Status DEFAULT 1, -- 1 Active, 2 Disabled
    AllowedIps      nvarchar(1000)   NULL,                -- comma-separated CIDR/IP allow-list; NULL = any
    OidcClientId    nvarchar(200)    NULL,
    CreatedByUserId uniqueidentifier NULL,
    CreatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_ApiClients_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_ApiClients_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion      rowversion       NOT NULL,
    CONSTRAINT FK_ApiClients_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT FK_ApiClients_CreatedBy FOREIGN KEY (OrganizationId, CreatedByUserId) REFERENCES pdf.Users(OrganizationId, Id),
    CONSTRAINT UQ_ApiClients_Org_Id   UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_ApiClients_Org_Name UNIQUE (OrganizationId, Name),
    CONSTRAINT CK_ApiClients_Type   CHECK (ClientType IN (1,2,3)),
    CONSTRAINT CK_ApiClients_Status CHECK (Status IN (1,2))
);
CREATE UNIQUE INDEX UX_ApiClients_OidcClientId ON pdf.ApiClients (OidcClientId) WHERE OidcClientId IS NOT NULL;
GO

CREATE TABLE pdf.ApiClientScopes (
    OrganizationId uniqueidentifier NOT NULL,
    ApiClientId    uniqueidentifier NOT NULL,
    ApiScopeId     int              NOT NULL,
    CONSTRAINT PK_ApiClientScopes PRIMARY KEY (ApiClientId, ApiScopeId),
    CONSTRAINT FK_ApiClientScopes_Clients FOREIGN KEY (OrganizationId, ApiClientId) REFERENCES pdf.ApiClients(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT FK_ApiClientScopes_Scopes  FOREIGN KEY (ApiScopeId) REFERENCES pdf.ApiScopes(Id)
);
GO

CREATE TABLE pdf.ApiKeys (
    Id              uniqueidentifier NOT NULL CONSTRAINT PK_ApiKeys PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    ApiClientId     uniqueidentifier NOT NULL,
    Name            nvarchar(200)    NOT NULL,
    KeyPrefix       varchar(24)      NOT NULL,            -- non-secret lookup prefix, shown in UI
    KeyHash         varbinary(64)    NOT NULL,            -- HMAC-SHA256(pepper, secret); raw secret never stored
    Status          tinyint          NOT NULL CONSTRAINT DF_ApiKeys_Status DEFAULT 1, -- 1 Active, 2 Revoked, 3 Expired
    ExpiresAtUtc    datetime2(3)     NULL,
    LastUsedAtUtc   datetime2(3)     NULL,
    RevokedAtUtc    datetime2(3)     NULL,
    RevokedByUserId uniqueidentifier NULL,
    CreatedByUserId uniqueidentifier NULL,
    CreatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_ApiKeys_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ApiKeys_Clients FOREIGN KEY (OrganizationId, ApiClientId) REFERENCES pdf.ApiClients(OrganizationId, Id),
    CONSTRAINT UQ_ApiKeys_Org_Id UNIQUE (OrganizationId, Id),
    CONSTRAINT CK_ApiKeys_Status CHECK (Status IN (1,2,3))
);
-- Prefix is looked up BEFORE the tenant is known, so it is globally unique.
CREATE UNIQUE INDEX UX_ApiKeys_Prefix ON pdf.ApiKeys (KeyPrefix);
CREATE INDEX IX_ApiKeys_Client ON pdf.ApiKeys (OrganizationId, ApiClientId);
GO

-- Hourly aggregated usage (keeps the table small; raw request logs go to the log sink).
CREATE TABLE pdf.ApiUsage (
    Id              bigint IDENTITY(1,1) CONSTRAINT PK_ApiUsage PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    ApiClientId     uniqueidentifier NOT NULL,
    BucketStartUtc  datetime2(0)     NOT NULL,            -- start of the hour
    Endpoint        varchar(120)     NOT NULL,            -- route template, e.g. POST /pdf/generate
    RequestCount    bigint           NOT NULL CONSTRAINT DF_ApiUsage_Req DEFAULT 0,
    ErrorCount      bigint           NOT NULL CONSTRAINT DF_ApiUsage_Err DEFAULT 0,
    TotalDurationMs bigint           NOT NULL CONSTRAINT DF_ApiUsage_Dur DEFAULT 0,
    CONSTRAINT FK_ApiUsage_Clients FOREIGN KEY (OrganizationId, ApiClientId) REFERENCES pdf.ApiClients(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT UQ_ApiUsage_Bucket UNIQUE (ApiClientId, BucketStartUtc, Endpoint)
);
CREATE INDEX IX_ApiUsage_Org_Bucket ON pdf.ApiUsage (OrganizationId, BucketStartUtc DESC);
GO

CREATE TABLE pdf.ApiRateLimits (
    Id               uniqueidentifier NOT NULL CONSTRAINT PK_ApiRateLimits PRIMARY KEY,
    OrganizationId   uniqueidentifier NOT NULL,
    ApiClientId      uniqueidentifier NULL,               -- NULL = organization default
    PermitsPerMinute int              NOT NULL,
    PermitsPerDay    int              NOT NULL,
    MaxConcurrentJobs int             NOT NULL,
    UpdatedAtUtc     datetime2(3)     NOT NULL CONSTRAINT DF_ApiRateLimits_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_ApiRateLimits_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT FK_ApiRateLimits_Clients FOREIGN KEY (OrganizationId, ApiClientId) REFERENCES pdf.ApiClients(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT CK_ApiRateLimits_Positive CHECK (PermitsPerMinute > 0 AND PermitsPerDay > 0 AND MaxConcurrentJobs > 0)
);
-- one row per client, and one organization-default row (ApiClientId IS NULL)
CREATE UNIQUE INDEX UX_ApiRateLimits_Client  ON pdf.ApiRateLimits (OrganizationId, ApiClientId) WHERE ApiClientId IS NOT NULL;
CREATE UNIQUE INDEX UX_ApiRateLimits_OrgDflt ON pdf.ApiRateLimits (OrganizationId) WHERE ApiClientId IS NULL;
GO

/* ================================ Templates ================================ */
CREATE TABLE pdf.PdfTemplates (
    Id               uniqueidentifier NOT NULL CONSTRAINT PK_PdfTemplates PRIMARY KEY,
    OrganizationId   uniqueidentifier NOT NULL,
    TemplateKey      varchar(100)     NOT NULL,           -- public identifier, e.g. 'invoice-standard'
    Name             nvarchar(200)    NOT NULL,
    Description      nvarchar(1000)   NULL,
    Category         nvarchar(100)    NULL,
    Status           tinyint          NOT NULL CONSTRAINT DF_PdfTemplates_Status DEFAULT 1, -- 1 Active, 2 Inactive, 3 Archived
    CurrentVersionId uniqueidentifier NULL,               -- latest PUBLISHED version
    CreatedByUserId  uniqueidentifier NULL,
    CreatedAtUtc     datetime2(3)     NOT NULL CONSTRAINT DF_PdfTemplates_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc     datetime2(3)     NOT NULL CONSTRAINT DF_PdfTemplates_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion       rowversion       NOT NULL,
    CONSTRAINT FK_PdfTemplates_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT FK_PdfTemplates_CreatedBy FOREIGN KEY (OrganizationId, CreatedByUserId) REFERENCES pdf.Users(OrganizationId, Id),
    CONSTRAINT UQ_PdfTemplates_Org_Id  UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_PdfTemplates_Org_Key UNIQUE (OrganizationId, TemplateKey),
    CONSTRAINT CK_PdfTemplates_Status CHECK (Status IN (1,2,3))
);
GO

CREATE TABLE pdf.PdfTemplateVersions (
    Id               uniqueidentifier NOT NULL CONSTRAINT PK_PdfTemplateVersions PRIMARY KEY,
    OrganizationId   uniqueidentifier NOT NULL,
    TemplateId       uniqueidentifier NOT NULL,
    VersionNumber    int              NOT NULL,
    Status           tinyint          NOT NULL CONSTRAINT DF_PdfTemplateVersions_Status DEFAULT 1, -- 1 Draft, 2 Published, 3 Deprecated
    HtmlContent      nvarchar(max)    NOT NULL,
    CssContent       nvarchar(max)    NULL,
    HeaderHtml       nvarchar(max)    NULL,
    FooterHtml       nvarchar(max)    NULL,
    PageSettingsJson nvarchar(max)    NULL,               -- {"size":"A4","orientation":"portrait","margins":{...}}
    Locale           varchar(20)      NOT NULL CONSTRAINT DF_PdfTemplateVersions_Locale DEFAULT 'en-US',
    ContentHash      char(64)         NULL,               -- SHA-256 hex of the sanitized content (published versions are immutable)
    ChangeNote       nvarchar(500)    NULL,
    PublishedAtUtc   datetime2(3)     NULL,
    PublishedByUserId uniqueidentifier NULL,
    CreatedByUserId  uniqueidentifier NULL,
    CreatedAtUtc     datetime2(3)     NOT NULL CONSTRAINT DF_PdfTemplateVersions_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc     datetime2(3)     NOT NULL CONSTRAINT DF_PdfTemplateVersions_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_PdfTemplateVersions_Templates FOREIGN KEY (OrganizationId, TemplateId) REFERENCES pdf.PdfTemplates(OrganizationId, Id),
    CONSTRAINT UQ_PdfTemplateVersions_Org_Id UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_PdfTemplateVersions_Number UNIQUE (TemplateId, VersionNumber),
    CONSTRAINT CK_PdfTemplateVersions_Status CHECK (Status IN (1,2,3)),
    CONSTRAINT CK_PdfTemplateVersions_Json CHECK (PageSettingsJson IS NULL OR ISJSON(PageSettingsJson) = 1)
);
GO

ALTER TABLE pdf.PdfTemplates ADD CONSTRAINT FK_PdfTemplates_CurrentVersion
    FOREIGN KEY (OrganizationId, CurrentVersionId) REFERENCES pdf.PdfTemplateVersions(OrganizationId, Id);
GO

CREATE TABLE pdf.PdfTemplateFields (
    Id                uniqueidentifier NOT NULL CONSTRAINT PK_PdfTemplateFields PRIMARY KEY,
    OrganizationId    uniqueidentifier NOT NULL,
    TemplateVersionId uniqueidentifier NOT NULL,
    FieldPath         varchar(200)     NOT NULL,          -- e.g. 'customerName' or 'items[].description'
    Label             nvarchar(200)    NULL,
    DataType          tinyint          NOT NULL,          -- 1 String, 2 Number, 3 Boolean, 4 Date, 5 Array, 6 Object
    IsRequired        bit              NOT NULL CONSTRAINT DF_PdfTemplateFields_Req DEFAULT 0,
    FormatPattern     varchar(100)     NULL,              -- e.g. 'N2', 'yyyy-MM-dd'; applied by the engine, not by the template
    DefaultValue      nvarchar(1000)   NULL,
    SortOrder         int              NOT NULL CONSTRAINT DF_PdfTemplateFields_Sort DEFAULT 0,
    CONSTRAINT FK_PdfTemplateFields_Versions FOREIGN KEY (OrganizationId, TemplateVersionId) REFERENCES pdf.PdfTemplateVersions(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT UQ_PdfTemplateFields_Path UNIQUE (TemplateVersionId, FieldPath),
    CONSTRAINT CK_PdfTemplateFields_Type CHECK (DataType BETWEEN 1 AND 6)
);
GO

/* ============================ Storage & documents ============================ */
CREATE TABLE pdf.StorageObjects (
    Id              uniqueidentifier NOT NULL CONSTRAINT PK_StorageObjects PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    Provider        varchar(30)      NOT NULL,            -- LocalFileSystem, S3, AzureBlob
    Container       nvarchar(200)    NULL,                -- bucket / container / root alias
    ObjectKey       nvarchar(500)    NOT NULL,            -- server-generated, always prefixed 'org/{OrganizationId}/'
    SizeBytes       bigint           NOT NULL,
    ContentType     varchar(100)     NOT NULL,
    Sha256          char(64)         NULL,
    Status          tinyint          NOT NULL CONSTRAINT DF_StorageObjects_Status DEFAULT 1, -- 1 Active, 2 PendingDelete, 3 Deleted
    CreatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_StorageObjects_Created DEFAULT SYSUTCDATETIME(),
    DeletedAtUtc    datetime2(3)     NULL,
    CONSTRAINT FK_StorageObjects_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT UQ_StorageObjects_Org_Id  UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_StorageObjects_Org_Key UNIQUE (OrganizationId, Provider, ObjectKey),
    CONSTRAINT CK_StorageObjects_Size CHECK (SizeBytes >= 0)
);
CREATE INDEX IX_StorageObjects_Cleanup ON pdf.StorageObjects (Status, CreatedAtUtc) WHERE Status <> 1;
GO

CREATE TABLE pdf.Documents (
    Id                uniqueidentifier NOT NULL CONSTRAINT PK_Documents PRIMARY KEY,
    OrganizationId    uniqueidentifier NOT NULL,
    PublicId          varchar(30)      NOT NULL,          -- 'DOC-100001' from pdf.DocumentNumberSeq
    Title             nvarchar(300)    NOT NULL,
    TemplateId        uniqueidentifier NULL,
    TemplateVersionId uniqueidentifier NULL,
    CurrentVersionId  uniqueidentifier NULL,
    Status            tinyint          NOT NULL CONSTRAINT DF_Documents_Status DEFAULT 1, -- 1 Active, 2 Archived, 3 Deleted, 4 Expired
    IsFavorite        bit              NOT NULL CONSTRAINT DF_Documents_Fav DEFAULT 0,
    ExpiresAtUtc      datetime2(3)     NULL,
    CreatedByUserId   uniqueidentifier NULL,
    CreatedByApiClientId uniqueidentifier NULL,
    CreatedAtUtc      datetime2(3)     NOT NULL CONSTRAINT DF_Documents_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc      datetime2(3)     NOT NULL CONSTRAINT DF_Documents_Updated DEFAULT SYSUTCDATETIME(),
    RowVersion        rowversion       NOT NULL,
    CONSTRAINT FK_Documents_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT FK_Documents_Templates FOREIGN KEY (OrganizationId, TemplateId) REFERENCES pdf.PdfTemplates(OrganizationId, Id),
    CONSTRAINT FK_Documents_TemplateVersions FOREIGN KEY (OrganizationId, TemplateVersionId) REFERENCES pdf.PdfTemplateVersions(OrganizationId, Id),
    CONSTRAINT FK_Documents_CreatedByUser FOREIGN KEY (OrganizationId, CreatedByUserId) REFERENCES pdf.Users(OrganizationId, Id),
    CONSTRAINT FK_Documents_CreatedByClient FOREIGN KEY (OrganizationId, CreatedByApiClientId) REFERENCES pdf.ApiClients(OrganizationId, Id),
    CONSTRAINT UQ_Documents_Org_Id       UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_Documents_Org_PublicId UNIQUE (OrganizationId, PublicId),
    CONSTRAINT CK_Documents_Status CHECK (Status IN (1,2,3,4))
);
CREATE INDEX IX_Documents_Org_Created ON pdf.Documents (OrganizationId, Status, CreatedAtUtc DESC);
CREATE INDEX IX_Documents_Org_Favorite ON pdf.Documents (OrganizationId, CreatedAtUtc DESC) WHERE IsFavorite = 1;
CREATE INDEX IX_Documents_Expiry ON pdf.Documents (ExpiresAtUtc) WHERE ExpiresAtUtc IS NOT NULL AND Status = 1;
GO

CREATE TABLE pdf.DocumentVersions (
    Id               uniqueidentifier NOT NULL CONSTRAINT PK_DocumentVersions PRIMARY KEY,
    OrganizationId   uniqueidentifier NOT NULL,
    DocumentId       uniqueidentifier NOT NULL,
    VersionNumber    int              NOT NULL,
    StorageObjectId  uniqueidentifier NOT NULL,
    PageCount        int              NULL,
    SizeBytes        bigint           NOT NULL,
    Sha256           char(64)         NULL,
    IsEncrypted      bit              NOT NULL CONSTRAINT DF_DocumentVersions_Enc DEFAULT 0,
    CreatedAtUtc     datetime2(3)     NOT NULL CONSTRAINT DF_DocumentVersions_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_DocumentVersions_Documents FOREIGN KEY (OrganizationId, DocumentId) REFERENCES pdf.Documents(OrganizationId, Id),
    CONSTRAINT FK_DocumentVersions_Storage   FOREIGN KEY (OrganizationId, StorageObjectId) REFERENCES pdf.StorageObjects(OrganizationId, Id),
    CONSTRAINT UQ_DocumentVersions_Org_Id UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_DocumentVersions_Number UNIQUE (DocumentId, VersionNumber)
);
CREATE INDEX IX_DocumentVersions_Storage ON pdf.DocumentVersions (StorageObjectId);
GO

ALTER TABLE pdf.Documents ADD CONSTRAINT FK_Documents_CurrentVersion
    FOREIGN KEY (OrganizationId, CurrentVersionId) REFERENCES pdf.DocumentVersions(OrganizationId, Id);
GO

CREATE TABLE pdf.DocumentMetadata (
    Id              bigint IDENTITY(1,1) CONSTRAINT PK_DocumentMetadata PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    DocumentId      uniqueidentifier NOT NULL,
    MetaKey         varchar(100)     NOT NULL,
    MetaValue       nvarchar(2000)   NULL,
    CONSTRAINT FK_DocumentMetadata_Documents FOREIGN KEY (OrganizationId, DocumentId) REFERENCES pdf.Documents(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT UQ_DocumentMetadata_Key UNIQUE (DocumentId, MetaKey)
);
GO

/* ================================== Jobs ================================== */
CREATE TABLE pdf.PdfJobs (
    Id                uniqueidentifier NOT NULL CONSTRAINT PK_PdfJobs PRIMARY KEY,
    OrganizationId    uniqueidentifier NOT NULL,
    PublicId          varchar(30)      NOT NULL,          -- 'JOB-100001' from pdf.JobNumberSeq
    JobType           tinyint          NOT NULL,          -- 1 Generate, 2 Merge, 3 Split, 4 Stamp, 5 Watermark, 6 Batch
    Status            tinyint          NOT NULL CONSTRAINT DF_PdfJobs_Status DEFAULT 1, -- 1 Queued, 2 Processing, 3 Completed, 4 Failed, 5 Cancelled, 6 Expired
    Priority          smallint         NOT NULL CONSTRAINT DF_PdfJobs_Priority DEFAULT 5, -- higher = sooner
    TemplateVersionId uniqueidentifier NULL,
    RequestPayload    nvarchar(max)    NOT NULL,          -- JSON request (validated before enqueue)
    ResultDocumentId  uniqueidentifier NULL,
    IdempotencyKey    varchar(100)     NULL,
    AttemptCount      int              NOT NULL CONSTRAINT DF_PdfJobs_Attempts DEFAULT 0,
    MaxAttempts       int              NOT NULL CONSTRAINT DF_PdfJobs_MaxAttempts DEFAULT 5,
    NextAttemptAtUtc  datetime2(3)     NOT NULL CONSTRAINT DF_PdfJobs_Next DEFAULT SYSUTCDATETIME(),
    LockedBy          varchar(100)     NULL,              -- worker instance id
    LockedUntilUtc    datetime2(3)     NULL,              -- lease; expired lease => job is reclaimable
    ErrorCode         varchar(100)     NULL,
    ErrorMessage      nvarchar(1000)   NULL,              -- sanitized; never internal exception text for public clients
    ApiClientId       uniqueidentifier NULL,
    UserId            uniqueidentifier NULL,
    CorrelationId     varchar(64)      NULL,
    QueuedAtUtc       datetime2(3)     NOT NULL CONSTRAINT DF_PdfJobs_Queued DEFAULT SYSUTCDATETIME(),
    StartedAtUtc      datetime2(3)     NULL,
    CompletedAtUtc    datetime2(3)     NULL,
    ExpiresAtUtc      datetime2(3)     NULL,
    CONSTRAINT FK_PdfJobs_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT FK_PdfJobs_TemplateVersions FOREIGN KEY (OrganizationId, TemplateVersionId) REFERENCES pdf.PdfTemplateVersions(OrganizationId, Id),
    CONSTRAINT FK_PdfJobs_ResultDocument FOREIGN KEY (OrganizationId, ResultDocumentId) REFERENCES pdf.Documents(OrganizationId, Id),
    CONSTRAINT FK_PdfJobs_ApiClients FOREIGN KEY (OrganizationId, ApiClientId) REFERENCES pdf.ApiClients(OrganizationId, Id),
    CONSTRAINT FK_PdfJobs_Users FOREIGN KEY (OrganizationId, UserId) REFERENCES pdf.Users(OrganizationId, Id),
    CONSTRAINT UQ_PdfJobs_Org_Id       UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_PdfJobs_Org_PublicId UNIQUE (OrganizationId, PublicId),
    CONSTRAINT CK_PdfJobs_Type   CHECK (JobType BETWEEN 1 AND 6),
    CONSTRAINT CK_PdfJobs_Status CHECK (Status BETWEEN 1 AND 6),
    CONSTRAINT CK_PdfJobs_Json   CHECK (ISJSON(RequestPayload) = 1)
);
-- Idempotency: same key within an organization returns the existing job.
CREATE UNIQUE INDEX UX_PdfJobs_Idempotency ON pdf.PdfJobs (OrganizationId, IdempotencyKey) WHERE IdempotencyKey IS NOT NULL;
-- Worker dequeue: READPAST-friendly, covers only claimable rows.
CREATE INDEX IX_PdfJobs_Dequeue ON pdf.PdfJobs (Priority DESC, NextAttemptAtUtc, QueuedAtUtc) INCLUDE (OrganizationId) WHERE Status = 1;
-- Lease recovery: processing jobs whose lease expired.
CREATE INDEX IX_PdfJobs_Lease ON pdf.PdfJobs (LockedUntilUtc) WHERE Status = 2;
CREATE INDEX IX_PdfJobs_Org_Status ON pdf.PdfJobs (OrganizationId, Status, QueuedAtUtc DESC);
GO

CREATE TABLE pdf.PdfJobItems (
    Id               uniqueidentifier NOT NULL CONSTRAINT PK_PdfJobItems PRIMARY KEY,
    OrganizationId   uniqueidentifier NOT NULL,
    JobId            uniqueidentifier NOT NULL,
    ItemIndex        int              NOT NULL,
    Status           tinyint          NOT NULL CONSTRAINT DF_PdfJobItems_Status DEFAULT 1, -- same codes as PdfJobs.Status
    InputPayload     nvarchar(max)    NULL,
    ResultDocumentId uniqueidentifier NULL,
    ErrorCode        varchar(100)     NULL,
    ErrorMessage     nvarchar(1000)   NULL,
    CompletedAtUtc   datetime2(3)     NULL,
    CONSTRAINT FK_PdfJobItems_Jobs FOREIGN KEY (OrganizationId, JobId) REFERENCES pdf.PdfJobs(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT FK_PdfJobItems_Documents FOREIGN KEY (OrganizationId, ResultDocumentId) REFERENCES pdf.Documents(OrganizationId, Id),
    CONSTRAINT UQ_PdfJobItems_Index UNIQUE (JobId, ItemIndex),
    CONSTRAINT CK_PdfJobItems_Status CHECK (Status BETWEEN 1 AND 6)
);
GO

/* ================================ Webhooks ================================ */
CREATE TABLE pdf.Webhooks (
    Id              uniqueidentifier NOT NULL CONSTRAINT PK_Webhooks PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    Name            nvarchar(200)    NOT NULL,
    TargetUrl       nvarchar(1000)   NOT NULL,            -- https only; SSRF-validated at save and at delivery
    SecretProtected varbinary(512)   NOT NULL,            -- ENCRYPTED (must be recoverable to sign payloads), unlike API keys
    EventTypes      varchar(500)     NOT NULL,            -- comma-separated, or '*'
    IsActive        bit              NOT NULL CONSTRAINT DF_Webhooks_Active DEFAULT 1,
    ApiClientId     uniqueidentifier NULL,
    CreatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_Webhooks_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_Webhooks_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Webhooks_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT FK_Webhooks_ApiClients FOREIGN KEY (OrganizationId, ApiClientId) REFERENCES pdf.ApiClients(OrganizationId, Id),
    CONSTRAINT UQ_Webhooks_Org_Id   UNIQUE (OrganizationId, Id),
    CONSTRAINT UQ_Webhooks_Org_Name UNIQUE (OrganizationId, Name),
    CONSTRAINT CK_Webhooks_Https CHECK (TargetUrl LIKE 'https://%')
);
GO

-- Transactional outbox: rows are inserted in the same transaction as the business change.
CREATE TABLE pdf.WebhookEvents (
    Id               bigint IDENTITY(1,1) CONSTRAINT PK_WebhookEvents PRIMARY KEY,
    OrganizationId   uniqueidentifier NOT NULL,
    WebhookId        uniqueidentifier NOT NULL,
    EventType        varchar(60)      NOT NULL,           -- pdf.created, pdf.generated, pdf.failed, pdf.deleted, pdf.expired, job.completed, job.failed
    EntityPublicId   varchar(30)      NULL,
    Payload          nvarchar(max)    NOT NULL,
    Status           tinyint          NOT NULL CONSTRAINT DF_WebhookEvents_Status DEFAULT 1, -- 1 Pending, 2 Delivered, 3 Retrying, 4 DeadLetter
    AttemptCount     int              NOT NULL CONSTRAINT DF_WebhookEvents_Attempts DEFAULT 0,
    NextAttemptAtUtc datetime2(3)     NOT NULL CONSTRAINT DF_WebhookEvents_Next DEFAULT SYSUTCDATETIME(),
    LockedBy         varchar(100)     NULL,
    LockedUntilUtc   datetime2(3)     NULL,
    LastStatusCode   int              NULL,
    LastError        nvarchar(500)    NULL,
    CreatedAtUtc     datetime2(3)     NOT NULL CONSTRAINT DF_WebhookEvents_Created DEFAULT SYSUTCDATETIME(),
    DeliveredAtUtc   datetime2(3)     NULL,
    CONSTRAINT FK_WebhookEvents_Webhooks FOREIGN KEY (OrganizationId, WebhookId) REFERENCES pdf.Webhooks(OrganizationId, Id) ON DELETE CASCADE,
    CONSTRAINT CK_WebhookEvents_Status CHECK (Status BETWEEN 1 AND 4),
    CONSTRAINT CK_WebhookEvents_Json CHECK (ISJSON(Payload) = 1)
);
CREATE INDEX IX_WebhookEvents_Dispatch ON pdf.WebhookEvents (NextAttemptAtUtc) WHERE Status IN (1,3);
CREATE INDEX IX_WebhookEvents_Webhook ON pdf.WebhookEvents (OrganizationId, WebhookId, CreatedAtUtc DESC);
GO

/* ============================ Audit & security logs ============================ */
-- Append-only. OrganizationId is NULL only for platform-level events.
CREATE TABLE pdf.AuditLogs (
    Id              bigint IDENTITY(1,1) CONSTRAINT PK_AuditLogs PRIMARY KEY,
    OrganizationId  uniqueidentifier NULL,
    EventType       varchar(60)      NOT NULL,            -- LOGIN, PDF_GENERATED, TEMPLATE_PUBLISHED, API_KEY_REVOKED, ...
    ActorType       tinyint          NOT NULL,            -- 1 User, 2 ApiClient, 3 System
    ActorId         uniqueidentifier NULL,
    EntityType      varchar(60)      NULL,
    EntityId        varchar(64)      NULL,
    Details         nvarchar(max)    NULL,                -- JSON, no secrets or PII beyond need
    IpAddress       varchar(45)      NULL,
    CorrelationId   varchar(64)      NULL,
    OccurredAtUtc   datetime2(3)     NOT NULL CONSTRAINT DF_AuditLogs_Occurred DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_AuditLogs_Json CHECK (Details IS NULL OR ISJSON(Details) = 1)
);
CREATE INDEX IX_AuditLogs_Org_Time   ON pdf.AuditLogs (OrganizationId, OccurredAtUtc DESC);
CREATE INDEX IX_AuditLogs_Event_Time ON pdf.AuditLogs (EventType, OccurredAtUtc DESC);
CREATE INDEX IX_AuditLogs_Entity     ON pdf.AuditLogs (EntityType, EntityId);
GO

CREATE TABLE pdf.SecurityLogs (
    Id              bigint IDENTITY(1,1) CONSTRAINT PK_SecurityLogs PRIMARY KEY,
    OrganizationId  uniqueidentifier NULL,                -- may be unknown (e.g. invalid API key)
    EventType       varchar(60)      NOT NULL,            -- LOGIN_FAILED, ACCOUNT_LOCKED, API_KEY_INVALID, SCOPE_DENIED, CROSS_TENANT_ATTEMPT, RATE_LIMITED, ...
    Severity        tinyint          NOT NULL,            -- 1 Info, 2 Warning, 3 High, 4 Critical
    Subject         nvarchar(256)    NULL,                -- email, key prefix, client name (never secrets)
    IpAddress       varchar(45)      NULL,
    UserAgent       nvarchar(300)    NULL,
    Details         nvarchar(max)    NULL,
    CorrelationId   varchar(64)      NULL,
    OccurredAtUtc   datetime2(3)     NOT NULL CONSTRAINT DF_SecurityLogs_Occurred DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_SecurityLogs_Severity CHECK (Severity BETWEEN 1 AND 4),
    CONSTRAINT CK_SecurityLogs_Json CHECK (Details IS NULL OR ISJSON(Details) = 1)
);
CREATE INDEX IX_SecurityLogs_Org_Time ON pdf.SecurityLogs (OrganizationId, OccurredAtUtc DESC);
CREATE INDEX IX_SecurityLogs_Ip_Time  ON pdf.SecurityLogs (IpAddress, OccurredAtUtc DESC);
CREATE INDEX IX_SecurityLogs_Severity ON pdf.SecurityLogs (Severity, OccurredAtUtc DESC) WHERE Severity >= 3;
GO

/* ============================ Settings & licensing ============================ */
CREATE TABLE pdf.SystemSettings (
    Id              int IDENTITY(1,1) CONSTRAINT PK_SystemSettings PRIMARY KEY,
    OrganizationId  uniqueidentifier NULL,                -- NULL = global default; a row with an OrganizationId overrides it
    SettingKey      varchar(150)     NOT NULL,
    SettingValue    nvarchar(max)    NULL,
    IsSecret        bit              NOT NULL CONSTRAINT DF_SystemSettings_Secret DEFAULT 0, -- if 1, value is protected and masked in admin UI
    UpdatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_SystemSettings_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_SystemSettings_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id)
);
-- SQL Server treats NULLs as equal in unique indexes, so this allows exactly one global row per key.
CREATE UNIQUE INDEX UX_SystemSettings_Key ON pdf.SystemSettings (OrganizationId, SettingKey);
GO

CREATE TABLE pdf.Licenses (
    Id              uniqueidentifier NOT NULL CONSTRAINT PK_Licenses PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    Edition         varchar(30)      NOT NULL,            -- Trial, Community, Professional, Enterprise
    Status          tinyint          NOT NULL CONSTRAINT DF_Licenses_Status DEFAULT 1, -- 1 Active, 2 Expired, 3 Suspended
    StartsAtUtc     datetime2(3)     NOT NULL,
    ExpiresAtUtc    datetime2(3)     NULL,
    LimitsJson      nvarchar(max)    NOT NULL,            -- {"pdfPerMonth":1000,"apiCallsPerMonth":10000,"storageMb":1024,"users":5,"templates":20,"concurrentJobs":2}
    CreatedAtUtc    datetime2(3)     NOT NULL CONSTRAINT DF_Licenses_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Licenses_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT CK_Licenses_Edition CHECK (Edition IN ('Trial','Community','Professional','Enterprise')),
    CONSTRAINT CK_Licenses_Json CHECK (ISJSON(LimitsJson) = 1)
);
CREATE INDEX IX_Licenses_Org ON pdf.Licenses (OrganizationId, Status);
GO

CREATE TABLE pdf.LicenseUsage (
    Id              bigint IDENTITY(1,1) CONSTRAINT PK_LicenseUsage PRIMARY KEY,
    OrganizationId  uniqueidentifier NOT NULL,
    PeriodStartUtc  date             NOT NULL,            -- first day of the month
    Metric          varchar(50)      NOT NULL,            -- PdfGenerated, ApiCalls, StorageBytes
    UsedValue       bigint           NOT NULL CONSTRAINT DF_LicenseUsage_Used DEFAULT 0,
    CONSTRAINT FK_LicenseUsage_Organizations FOREIGN KEY (OrganizationId) REFERENCES pdf.Organizations(Id),
    CONSTRAINT UQ_LicenseUsage UNIQUE (OrganizationId, PeriodStartUtc, Metric)
);
GO

INSERT INTO pdf.SchemaVersions (ScriptName) VALUES (N'001_schema.sql');
GO
