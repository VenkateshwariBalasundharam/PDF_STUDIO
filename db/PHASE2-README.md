# PDFStudio — Phase 2: Database

```text
db/
  sqlserver/001_schema.sql   tables, constraints, indexes, sequences
  sqlserver/002_seed.sql     permissions, scopes, 3 orgs, users, roles, API clients, templates, settings, licenses
  postgres/001_schema.sql    same model, PostgreSQL 15+
  postgres/002_seed.sql      same seed data
```

## Verification status

| Script | Status |
|--------|--------|
| PostgreSQL 001 + 002 | **Executed on PostgreSQL 16**: clean run. Tenant FKs, idempotency index, https-only webhook check, global-setting uniqueness and the `SKIP LOCKED` dequeue query were tested. |
| SQL Server 001 + 002 | **Not executed** (no SQL Server available where I worked). Written to mirror the PostgreSQL model; please run it on SQL Server 2019/2022 and send me any error text. |

## Run

```bash
# PostgreSQL
createdb pdfstudio
psql -v ON_ERROR_STOP=1 -d pdfstudio -f db/postgres/001_schema.sql
psql -v ON_ERROR_STOP=1 -d pdfstudio -f db/postgres/002_seed.sql

# SQL Server (empty database selected)
sqlcmd -S localhost -d PDFStudio -b -i db/sqlserver/001_schema.sql
sqlcmd -S localhost -d PDFStudio -b -i db/sqlserver/002_seed.sql
```

Naming: SQL Server uses PascalCase (`pdf.PdfJobs`, `OrganizationId`); PostgreSQL uses snake_case (`pdf.pdf_jobs`, `organization_id`). Same columns, same meaning. The provider-specific repositories hide the difference.

## Key design points

1. **Tenant-safe foreign keys.** Every tenant-owned parent has `UNIQUE (OrganizationId, Id)`, and children reference `(OrganizationId, ParentId)`. The database itself rejects a child that points at another organization's parent (e.g. assigning Globex's role to an Acme user, or setting Acme's template to a Globex version). This is a second line of defense behind the repository filters.
2. **Public IDs.** `DOC-100001` / `JOB-100001` come from sequences (`pdf.DocumentNumberSeq`, `pdf.JobNumberSeq`) and are unique per organization. Sequences are global, so a tenant can infer overall volume from gaps; acceptable now, switch to per-org counters if that matters.
3. **API keys.** `KeyPrefix` (globally unique, used to find the row before the tenant is known) + `KeyHash` (HMAC-SHA256 with server pepper). The raw secret is never stored.
4. **Webhook secrets are encrypted, not hashed**, because the server must recover them to sign payloads. Encryption key comes from configuration (Phase 4).
5. **Job queue.** `Status = 1` partial index serves the dequeue; `LockedUntilUtc` is a lease so crashed workers' jobs are reclaimed; `IdempotencyKey` is unique per organization.
6. **Webhook outbox.** `WebhookEvents` rows are written in the same transaction as the business change; the dispatcher retries with backoff and moves exhausted rows to dead-letter (status 4).
7. **Settings.** `OrganizationId NULL` = global default; a row with an organization overrides it. One global row per key is enforced (PostgreSQL via `NULLS NOT DISTINCT`, hence 15+).
8. **High-volume tables** (`ApiUsage` hourly aggregates, `AuditLogs`, `SecurityLogs`) are append-style; partition by month in Phase 18 if volume demands.
9. **No credentials in seed data.** Seeded users have no password and there are no API keys. A dev-only CLI in Phase 4 will set passwords and issue keys.

## Code values (will become enums in `PDFStudio.Domain`)

| Column | Values |
|--------|--------|
| Organizations.Status | 1 Active, 2 Suspended, 3 Deleted |
| ApiClients.ClientType | 1 ApiKey, 2 OAuthClient, 3 InternalService |
| ApiClients.Status | 1 Active, 2 Disabled |
| ApiKeys.Status | 1 Active, 2 Revoked, 3 Expired |
| PdfTemplates.Status | 1 Active, 2 Inactive, 3 Archived |
| PdfTemplateVersions.Status | 1 Draft, 2 Published, 3 Deprecated |
| PdfTemplateFields.DataType | 1 String, 2 Number, 3 Boolean, 4 Date, 5 Array, 6 Object |
| StorageObjects.Status | 1 Active, 2 PendingDelete, 3 Deleted |
| Documents.Status | 1 Active, 2 Archived, 3 Deleted, 4 Expired |
| PdfJobs.JobType | 1 Generate, 2 Merge, 3 Split, 4 Stamp, 5 Watermark, 6 Batch |
| PdfJobs.Status / PdfJobItems.Status | 1 Queued, 2 Processing, 3 Completed, 4 Failed, 5 Cancelled, 6 Expired |
| WebhookEvents.Status | 1 Pending, 2 Delivered, 3 Retrying, 4 DeadLetter |
| AuditLogs.ActorType | 1 User, 2 ApiClient, 3 System |
| SecurityLogs.Severity | 1 Info, 2 Warning, 3 High, 4 Critical |
| Licenses.Edition | Trial, Community, Professional, Enterprise |
| Licenses.Status | 1 Active, 2 Expired, 3 Suspended |

## Seed data

| Organization | Users | API clients | Templates |
|--------------|-------|-------------|-----------|
| platform (operator) | platform.admin@pdfstudio.local | none | none |
| acme (Professional) | admin@acme.local (Admin), dev@acme.local (Developer) | Acme Billing System (key client), CompanyStudio (internal service, all scopes) | `invoice-standard` (published v1), `receipt-simple` (draft v1) |
| globex (Trial) | admin@globex.local (Admin) | Globex ERP | `invoice-standard` (published v1, same key as Acme, different tenant) |

The `invoice-standard` template uses the flat field names from your spec example (`invoiceNo`, `customerName`, `amount`), plus optional `companyName`, `invoiceDate` and an `items` list, so this request works as written:

```json
{ "templateId": "invoice-standard", "data": { "invoiceNo": "INV-10001", "customerName": "ABC Technologies", "amount": 12500 } }
```

## Repository interfaces (Phase 3 will implement; defined in `PDFStudio.Application`)

Rule: **every method takes `organizationId` explicitly** (except the global catalogs and pre-auth lookups marked †), and every method takes a `CancellationToken`. SQL lives only in `Infrastructure/SqlServer` and `Infrastructure/Postgres`.

| Interface | Main operations |
|-----------|-----------------|
| `IOrganizationRepository` | Get, GetByCode†, List, Create, UpdateStatus |
| `IUserRepository` | Get, GetByEmail, List, Create, Update, RecordLoginSuccess/Failure, SetLockout, GetRolesAndPermissions |
| `IRoleRepository` | Get, List, Create, Update, Delete, SetPermissions, AssignUser, UnassignUser |
| `IPermissionCatalog` | ListAll (global) |
| `IRefreshTokenRepository` | Add, GetByHash†, Revoke, RevokeFamily |
| `IApiClientRepository` | Get, List, Create, Update, Disable, GetScopes, SetScopes |
| `IApiKeyRepository` | FindByPrefix†, ListByClient, Create, Revoke, TouchLastUsed |
| `IApiScopeCatalog` | ListAll (global) |
| `IApiUsageRepository` | IncrementBucket (upsert), Query |
| `IRateLimitRepository` | GetEffective(client), Upsert |
| `ITemplateRepository` | Get, GetByKey, List (paged), Create, Update, SetStatus, SetCurrentVersion |
| `ITemplateVersionRepository` | Get, ListByTemplate, CreateDraft, UpdateDraft, Publish (immutable), Deprecate, GetFields, ReplaceFields |
| `IDocumentRepository` | Get, GetByPublicId, List (paged, filters: status/favorite/recent), Create, SetStatus, SetFavorite, ListExpired |
| `IDocumentVersionRepository` | Add, GetCurrent, ListByDocument |
| `IDocumentMetadataRepository` | Get, Set, Delete |
| `IStorageObjectRepository` | Add, Get, MarkPendingDelete, ListPendingDelete |
| `IJobRepository` | Create (idempotent), Get, GetByPublicId, List (paged), ClaimNext (`SKIP LOCKED` / `READPAST`), ExtendLease, Complete, Fail (with backoff), Cancel, ReclaimExpiredLeases, ExpireOld |
| `IJobItemRepository` | AddRange, ListByJob, Update |
| `IWebhookRepository` | Get, List, Create, Update, Delete |
| `IWebhookOutbox` | Enqueue, ClaimDue, MarkDelivered, MarkFailed (retry or dead-letter) |
| `IAuditLogRepository` / `ISecurityLogRepository` | Append, Query (paged, by org/event/date) |
| `ISystemSettingsRepository` | GetEffective(key, org), Set, Delete |
| `ILicenseRepository` | GetActive, Create, Update, IncrementUsage, GetUsage |
| `ISequenceService` | NextDocumentNumber, NextJobNumber |

Plumbing (per spec §15): `IDbConnectionFactory`, `IDbCommandFactory`, `ITransactionManager`, with `SqlServerDbConnectionFactory` / `PostgresDbConnectionFactory` selected by configuration (`Database:Provider`).

## Open items for Phase 3

* Choose the dequeue claim batch size and lease default (seeded: 300 s lease, 5 attempts).
* Decide whether to adopt PostgreSQL row-level security / SQL Server security policies now or in Phase 18 (the composite FKs and repository filters already protect writes and reads; RLS adds a third layer for ad-hoc queries).
