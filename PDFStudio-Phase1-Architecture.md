# PDFStudio — Phase 1: Architecture

Status: proposal for review. No implementation code yet (per spec §34).

---

## 0. Decisions that need your confirmation

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | .NET version | The spec says .NET 9. .NET 9 is an STS release and, to my knowledge, reaches end of support around Nov 2026 (please verify). For a commercial product starting now, **.NET 10 (LTS)** is safer. The architecture is identical either way. |
| D2 | HTML→PDF engine | .NET has **no built-in HTML→PDF**. A third-party/native component is unavoidable. Recommend **headless Chromium (PuppeteerSharp or Playwright .NET, Apache/MIT)** on the server, and **WebView2 `PrintToPdf` (Microsoft)** on Windows offline mode. |
| D3 | PDF manipulation (merge/split/stamp/encrypt) | **PdfSharp (MIT)** for merge, split, rotate, reorder, watermark, metadata, standard password encryption. **PdfPig (Apache-2.0)** for read/extract if needed. Avoid iText (AGPL) and check QuestPDF's license terms before using it commercially. |
| D4 | Template syntax | Your sample is Mustache. Use a **logic-less Mustache engine (Stubble, MIT)** with a strict data model. Logic-less is the strongest defense against template injection. Formatting (dates, numbers) is declared in `PdfTemplateFields`, not executed in templates. |
| D5 | Queue | **Database-backed queue** (Postgres `FOR UPDATE SKIP LOCKED`, SQL Server `READPAST`) behind `IJobQueue`. No broker needed initially; swap to RabbitMQ/Azure Service Bus later. |
| D6 | Gateway | **YARP** (Microsoft reverse proxy) as `PDFStudio.ApiGateway`; Caddy at the edge for TLS. |
| D7 | Data access | ADO.NET with hand-written SQL per provider, as specified. No Dapper/EF. |
| D8 | Logging | `Microsoft.Extensions.Logging` + own `IAuditLogger`/`ISecurityLogger` writing to DB. No Serilog dependency. |
| D9 | Tenancy model | Shared database, shared schema, `OrganizationId` on every business table, enforced centrally. |

Third-party dependencies are limited to D2, D3, D4 and justified above.

---

## 1. Complete architecture (overview)

Style: **modular monolith, Clean Architecture**. One deployable backend codebase, split into two hosts (Public API, Private API) plus a Worker host, all sharing the same Application/Domain/Infrastructure libraries. Splitting into microservices later only requires moving a module behind its interface.

Principles: dependencies point inward (Domain ← Application ← Infrastructure/Hosts); every replaceable concern (PDF engine, storage, DB provider, queue, licensing) is an interface in Application.

## 2. System architecture diagram

```text
 Browser (Angular 21)   WPF (Win 10/11)   MAUI (Android/iOS)   External apps / SDK
        |                    |                   |                     |
        |  (private API)     |  (private/public) |  (public API)       | (public API)
        v                    v                   v                     v
 +--------------------------------------------------------------------------+
 |  Edge: Caddy (TLS, HSTS, HTTP/2)                                          |
 +--------------------------------------------------------------------------+
        |                                                    |
        v                                                    v
 +-------------------+                              +-------------------+
 | Gateway (YARP)    |  /api/v1/public/*  --------> | Public API host   |
 | routing, rate     |                              +-------------------+
 | limit, CORS,      |  /api/v1/private/* (internal | network only)
 | correlation id    | ---------------------------> +-------------------+
 +-------------------+                              | Private API host  |
                                                    +-------------------+
                          both hosts reference
                                  |
                      +-----------v-----------+
                      |   Application Layer   |  use cases, validation, authz policies
                      +-----------+-----------+
          +-----------------------+------------------------+
          |                       |                        |
   Template Engine           PDF Engine (IPdfEngine)   Document Engine
          |                       |                        |
          +-----------------------+------------------------+
                                  |
                           Job Engine (IJobQueue)
                                  |
                  +---------------+----------------+
                  |                                |
        Worker host(s) (N replicas)         Webhook dispatcher (outbox)
                  |
     +------------+-------------+-------------------+
     |                          |                   |
 SQL Server / PostgreSQL   IStorageProvider     Chromium (render)
 (ADO.NET)                 (FS / S3 / Azure)
```

## 3. Component architecture

| Component | Responsibility | Depends on |
|-----------|----------------|------------|
| Application | Use cases (commands/queries), DTOs, validators, authorization policy checks, all interfaces for infrastructure | Domain |
| Domain | Entities, value objects, enums, domain rules (job state machine, template version lifecycle) | none |
| TemplateEngine | Parse, validate, render templates against a typed data model; sanitization | Application |
| PdfEngine | `IPdfEngine` implementations (Chromium render, PdfSharp manipulation) | Application |
| DocumentEngine | Document and version lifecycle, retention/expiry, metadata | Application |
| JobEngine | `IJobQueue`, worker loop, retry/backoff, idempotency, webhook outbox | Application |
| Storage | `IStorageProvider` implementations (local, S3-compatible, Azure Blob) | Application |
| Security | API key hashing, JWT validation, scope policies, tenant context, lockout | Application |
| Audit | Audit/security/API log writers | Application |
| Infrastructure | ADO.NET providers, repositories, transaction manager, licensing | Application |

Cross-cutting pipeline on every request: correlation ID → auth → tenant resolution (`ITenantContext`) → rate limit → license check → validation → handler → audit → standard error envelope.

## 4. Project / solution structure

```text
PDFStudio.sln
src/
  PDFStudio.Shared          Result<T>, error codes, ApiResponse envelope, constants, clock abstraction. No dependencies.
  PDFStudio.Domain          Entities, enums, state machines.
  PDFStudio.Application     Interfaces, use cases, DTOs, validators, policies.
  PDFStudio.Infrastructure  ADO.NET (SqlServer/, Postgres/ folders), repositories, transaction manager, DI wiring, licensing module.
  PDFStudio.PdfEngine       IPdfEngine implementations (Chromium, PdfSharp); engine selection.
  PDFStudio.TemplateEngine  Mustache rendering, schema validation, safe data model, sanitizer.
  PDFStudio.DocumentEngine  Document/version management, expiry.
  PDFStudio.JobEngine       Queue, worker BackgroundService, retries, webhook delivery.
  PDFStudio.Storage         Local FS, S3-compatible, Azure Blob providers.
  PDFStudio.Security        Auth handlers, key hashing, scope policies, tenant context.
  PDFStudio.Audit           Audit/security/performance/API log sinks.
  PDFStudio.ApiGateway      YARP host.
  PDFStudio.PublicApi       ASP.NET Core host, /api/v1/public/*.
  PDFStudio.PrivateApi      ASP.NET Core host, /api/v1/private/*.
  PDFStudio.Worker          Worker host (the spec lists JobEngine; the host project is added here).
  PDFStudio.SDK             .NET client for the Public API (no server references).
  PDFStudio.Web             Angular 21 workspace.
  PDFStudio.Windows         WPF MVVM app (+ local engine adapter).
  PDFStudio.Mobile          .NET MAUI app.
tests/
  PDFStudio.UnitTests / IntegrationTests / SecurityTests / ApiTests
```

Rules enforced by project references: Domain and Shared reference nothing; hosts never reference each other; SDK references only Shared contracts (or its own copies); Windows/Mobile reference SDK, not server projects (Windows additionally references PdfEngine for offline mode).

## 5. Public vs Private API

| | Public API | Private API |
|---|-----------|-------------|
| Route | `/api/v1/public/*` | `/api/v1/private/*` |
| Consumers | External apps, SDK, Mobile | Web, Windows, internal services, CompanyStudio |
| Network | Internet via gateway | Internal network / VPN only; not routed by the public gateway listener |
| Auth | API key, OAuth/OIDC, JWT; scopes (`pdf:generate`, ...) | Service-to-service JWT (issuer, audience, scope validation), user JWT for UI; optional mTLS |
| Scope | Generate, jobs, documents, templates (read), merge/split/stamp/watermark | Admin: templates, documents, storage, jobs, tenants, users, audit, system, API management |
| Limits | Per-client rate limits, quotas, license limits | Looser, per-service identity |

Both hosts call the **same Application use cases**; only the transport, auth and exposure differ. This keeps logic in one place while allowing them to be deployed and firewalled independently.

Standard conventions: URL-segment versioning, `X-Correlation-Id` in/out, cursor or page/size pagination with `X-Total-Count`, `Idempotency-Key` on POST for jobs/generate, error envelope from spec §22 mapped to 400/401/403/404/409/413/422/429/500.

## 6. Web / Windows / Mobile architecture

- **Web (Angular 21):** standalone components, lazy-loaded feature routes matching your navigation tree, typed API client generated from OpenAPI, HTTP interceptors (auth, correlation ID, error mapping), signals-based state, OIDC code flow + PKCE, Angular Material only for dialogs/tables/date pickers. Talks to the Private API through the gateway.
- **Windows (WPF, MVVM):** Views/ViewModels/Services; `IPdfBackend` with two implementations — `RemoteApiBackend` (SDK) and `LocalBackend` (reuses `PDFStudio.PdfEngine` with WebView2 for HTML→PDF plus PdfSharp). Offline queue stores pending work in local SQLite/file store and syncs when online. Credentials in Windows Credential Manager / DPAPI.
- **Mobile (MAUI):** MVVM, Public API only via SDK, tokens in `SecureStorage`, PDF preview via platform viewers, share/download via platform share sheets.

Offline caveat: offline Windows rendering needs a local template copy (published versions synced down) and cannot use server-only features (license metering is reconciled on reconnect).

## 7. Database architecture

- Two providers behind `IDbConnectionFactory` / `IDbCommandFactory` / `ITransactionManager`; SQL lives only in provider-specific repository classes, with the same repository interface for both.
- Table groups: Identity & access (Organizations, Users, Roles, Permissions, UserRoles, RolePermissions); API management (ApiClients, ApiKeys, ApiScopes, ApiUsage, ApiRateLimits); Templates (PdfTemplates, PdfTemplateVersions, PdfTemplateFields); Documents (Documents, DocumentVersions, DocumentMetadata, StorageObjects); Jobs (PdfJobs, PdfJobItems); Webhooks (Webhooks, WebhookEvents = outbox); Logs (AuditLogs, SecurityLogs); SystemSettings; plus Licenses/LicenseUsage.
- Conventions: GUID/UUID primary keys with public prefixed IDs (`DOC-`, `JOB-`) as a separate unique column; `OrganizationId` NOT NULL + indexed (leading column in composite indexes) on all business tables; `CreatedAtUtc`/`UpdatedAtUtc`, `RowVersion`/`xmin` concurrency; soft delete where retention matters; high-volume tables (ApiUsage, logs) designed for partitioning by month.
- Type mapping: SQL Server `uniqueidentifier`, `datetime2`, `nvarchar`, `varbinary`; PostgreSQL `uuid`, `timestamptz`, `text`/`varchar`, `jsonb` for metadata.
- Migrations: versioned SQL scripts per provider, applied by a migration runner at deploy time.

## 8. Security architecture

- **Identity:** API keys = random 256-bit secret, shown once, stored as hash (HMAC-SHA256 with server pepper, key prefix stored for lookup). Passwords: PBKDF2 (built into .NET) with per-user salt, or Argon2 if you accept a dependency. Lockout and progressive delay on failures.
- **Tokens:** short-lived access JWT + rotating refresh tokens with reuse detection; OIDC for external IdPs.
- **Authorization:** scopes for API clients, RBAC for users, policy-based checks in Application layer.
- **Tenant isolation (defense in depth):** (1) `ITenantContext` resolved from token, never from request body; (2) repositories require OrganizationId and append it to every query; (3) storage keys prefixed `org/{id}/`; (4) optional DB row-level security (PostgreSQL RLS, SQL Server security policy); (5) automated cross-tenant tests in SecurityTests for every endpoint.
- **Input/file safety:** size limits, content-type sniffing, extension allow-list, generated storage names (never user paths), path normalization checks, malware-scan hook `IFileScanner`.
- **SSRF:** the renderer runs with network disabled by default; remote resources only via an allow-list of hosts, DNS-resolved and blocked for private/link-local/metadata ranges.
- **Transport/headers:** HTTPS+HSTS, CSP, X-Content-Type-Options, frame-ancestors; strict CORS per environment; CSRF protection only for cookie-based flows.
- **Secrets:** environment/secret store, never in source; rotation supported via key overlap windows.
- **Webhooks:** HMAC-SHA256 signature header with timestamp (replay protection), HTTPS-only targets with the same SSRF filter, exponential backoff, dead-letter state.

## 9. PDF Engine architecture

```text
IPdfEngine (Generate / Merge / Split)  -- as specified in your spec
   |
   +-- PdfEngineRouter (selects implementation by operation/config)
        +-- ChromiumHtmlRenderer  : HTML -> PDF (server, worker containers)
        +-- WebView2HtmlRenderer  : HTML -> PDF (Windows offline)
        +-- PdfSharpManipulator   : merge, split, rotate, reorder, extract, stamp, watermark, metadata, encryption
```

- Additional interfaces (kept off `IPdfEngine` so it stays minimal, all in Application): `IPdfManipulator` (rotate/reorder/stamp/watermark/metadata), `IPdfSecurityService` (password/permissions), and extension points `IPdfSigner`, `IPdfAConverter`, `IPdfFormService`, `IOcrService`, `IPdfComparer` registered but unimplemented.
- Rendering runs in a **bounded pool of browser instances** in worker processes; timeouts, memory caps, one page context per job, no network by default. The API host never launches Chromium; sync `generate` for small documents delegates to an in-process pooled renderer only if configured, otherwise enqueues and waits briefly.
- Headers/footers/page numbers use the renderer's header/footer templates; watermarks via CSS for generation and PdfSharp for post-processing.

## 10. Template Engine architecture

- Pipeline: **load published version → validate data against declared fields (`PdfTemplateFields`: name, type, required, format, locale) → sanitize template HTML → render Mustache → inject into page shell (CSS, fonts, header/footer) → hand HTML to the PDF engine**.
- Data model: JSON only (string/number/bool/date/array/object); depth and size limits; no reflection on CLR objects; values HTML-encoded by default (triple-mustache disallowed unless a field is marked trusted-HTML and sanitized).
- Safety: no script execution (`<script>`, event handlers, `javascript:` stripped), restricted tags/attributes, images allowed as data URIs or storage-hosted assets only, CSS limited (no `@import` of remote URLs), render-time timeouts and output-size caps.
- Versioning: Draft → Published (immutable) → Deprecated/Inactive; each generation records the exact version used. Clone creates a new draft. Preview renders with sample data using the same path as production.
- Localization and formatting: locale on the request; dates/numbers pre-formatted by the engine according to field definitions, so templates stay logic-less.

## 11. Deployment architecture

```text
Internet -> Caddy (TLS) -> Gateway(YARP) -> Public API x N
                                 \-> (internal network) Private API x N
Worker x N  (Chromium installed, no inbound ports)
Web: static Angular build served by Caddy/nginx container
Data: PostgreSQL or SQL Server (managed in prod), object storage (S3/Azure/MinIO), optional Redis later for distributed rate limit
```

- Docker images: PublicApi, PrivateApi, ApiGateway, Worker (Chromium base), Web. `docker-compose.yml` for dev: api, worker, SQL Server, PostgreSQL, MinIO (S3-compatible storage).
- Scale-out: APIs are stateless; workers claim jobs via `SKIP LOCKED`; rate-limit counters start in-memory per node and move to Redis or DB when you run >1 node (decision needed at Phase 4).
- Environments: Development / Test / Staging / Production via environment variables and `appsettings.{env}.json` without secrets.
- CI/CD: build → unit → integration (containers) → security checks (dependency audit, secret scan, SAST) → docker build → publish → deploy.

## 12. Development phases and recommended order (with reasons)

| Phase | Scope | Why in this order |
|-------|-------|-------------------|
| 1 | Architecture + solution structure | Fixes boundaries and decisions D1–D9 before code exists. |
| 2 | Database (SQL Server + PostgreSQL scripts, seed) | Everything depends on the data model; tenancy columns and indexes are cheapest to get right now. |
| 3 | Domain + Application (interfaces, DTOs, ADO.NET infra) | Defines the contracts all later projects implement. |
| 4 | Authentication / security | Tenant context and authz must exist before any endpoint, otherwise isolation gets retrofitted. |
| 5 | Public API | First external surface; gives a testable vertical slice with stubs. |
| 6 | Private API | Reuses Application use cases; adds admin surface the Web needs. |
| 7 | PDF Engine abstraction + first implementation | Needed before generation is real; isolates the riskiest dependency early. |
| 8 | Template Engine | Generation requires templates; depends on engine output format. |
| 9 | Document management | Needs storage and generated output to manage. |
| 10 | Background jobs, webhooks | Wraps working generation in queue/retry; easier once sync path works. |
| 11 | Angular Web | Backend contracts stable enough to build against. |
| 12 | Windows WPF | Reuses SDK and PdfEngine; offline mode needs stable engine. |
| 13 | MAUI Mobile | Pure Public API consumer. |
| 14 | SDK | Formalizes the public contract (a thin early version can ship with Phase 5). |
| 15 | Docker | Packaging once the hosts exist. |
| 16 | Testing | Unit/security tests are written *per phase*; this phase fills gaps and adds UI tests. |
| 17 | CI/CD | Automates build/test/deploy of the above. |
| 18 | Production hardening | Load tests, pen test fixes, backup/DR, observability. |

Suggested tweak: write the tenant-isolation and auth tests **during Phases 4–6**, not at the end.

## 13. Major risks and technical decisions

| Risk | Impact | Mitigation |
|------|--------|------------|
| No built-in HTML→PDF in .NET | Spec says "prefer Microsoft libraries" but this is impossible | Chromium/WebView2 behind `IPdfEngine`; decision D2 |
| Chromium operational weight (memory, sandbox, container hardening) | Worker instability, security exposure | Dedicated workers, pooled instances, timeouts, no network, non-root, seccomp |
| Third-party license traps (iText AGPL, QuestPDF thresholds) | Legal risk for a commercial product | MIT/Apache choices (D3), license review in CI |
| PDF/A, digital signatures, OCR, forms | Large effort, often need commercial libs | Extension interfaces now; implement later per customer need |
| Offline mode scope | Divergent behavior, template sync, license metering | Define offline feature subset explicitly in Phase 12 |
| Two database providers | Double SQL maintenance, subtle behavior differences | Same repository interfaces, shared contract test suite run against both, keep SQL simple |
| Multi-tenancy bugs | Cross-tenant leak is existential | Central tenant enforcement, RLS option, automated cross-tenant tests |
| Template injection / SSRF | Server-side compromise, data exfiltration | Logic-less engine, sanitizer, network-off renderer, host allow-list |
| Scope size (6 clients + SDK + licensing) | Never reaching a shippable core | Ship vertical slice after Phase 7–8: generate a PDF from a template via API, then widen |
| .NET 9 lifecycle | Short support window | Decision D1 |
| Distributed rate limiting / idempotency | Inconsistent limits across nodes | DB- or Redis-backed counters decision at Phase 4 |

---

## Next step

Reply with your answers to D1–D9 (or "accept all recommendations"), and I'll start **Phase 2: Database** — SQL Server and PostgreSQL scripts, indexes, constraints, seed data, and the repository interface list.
