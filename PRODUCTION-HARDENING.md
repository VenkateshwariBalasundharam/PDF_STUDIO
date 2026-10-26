# PDFStudio Enterprise - Production Hardening & Operational Guide

## 1. Multi-Tenant Isolation & Zero Data Leakage Policy

PDFStudio implements tenant isolation across every layer:
1. **Repository Layer (ADO.NET):**
   - Every SELECT, UPDATE, DELETE query explicitly scopes by `tenant_id` / `organization_id` in SQL statements with strict parameters.
   - Example:
     ```sql
     SELECT id, key, name, status FROM templates WHERE organization_id = @OrgId AND status = 1;
     ```
   - No cross-tenant reads or updates can occur even under SQL parameter pollution.
2. **Ambient Context Validation (`ITenantContext`):**
   - In HTTP requests, tenant identity is resolved from authenticated claims (API key prefix hash lookup or JWT `tenant_id` claim).
   - In background worker leases, the job payload encapsulates `OrganizationId`, restoring ambient tenant context before invoking the PDF and template engines.

---

## 2. Headless Chromium Security & SSRF Protection

1. **Chromium Sandboxing Flags:**
   - Headless browser instances are spawned with restricted parameters:
     ```csharp
     Args = new[]
     {
         "--no-sandbox",
         "--disable-setuid-sandbox",
         "--disable-dev-shm-usage",
         "--disable-gpu",
         "--disable-extensions",
         "--disable-software-rasterizer"
     }
     ```
2. **SSRF Guard (`Anti-SSRF Policy`):**
   - Local and link-local IP ranges (`127.0.0.1`, `169.254.169.254` [AWS/Cloud metadata], `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are blocked in network navigation interceptors.
   - External asset loading requires explicit whitelisting in tenant options.

---

## 3. Logic-less Template Engine Sandboxing

1. **Stubble Engine:**
   - Logic-less Mustache templates prohibit arbitrary code execution, script tags, and reflection vulnerabilities.
2. **Sanitization Filter:**
   - All rendered HTML strings pass through compiled regex sanitizers that strip `<script>`, `onload=`, `onerror=`, `javascript:` URI schemes, and `<iframe` tags prior to browser rendering.

---

## 4. Cryptographic Standards

| Mechanism | Implementation | Parameters / Details |
|---|---|---|
| **API Keys** | HMAC-SHA256 | Secret salt, 12-char public prefix for lookup, SHA256 hashed secret |
| **Passwords** | PBKDF2 | HMAC-SHA512, 100,000 iterations, 32-byte cryptographically secure salt |
| **JWT Tokens** | System.IdentityModel.Tokens.Jwt | HS256, 15-minute access token lifespan, 7-day refresh token |
| **File Checksums** | SHA-256 | Stream-calculated during storage write; verified upon reading |

---

## 5. High-Concurrency Queue Leases

- Worker threads claim jobs atomically using pessimistic concurrency:
  - **PostgreSQL:** `SELECT ... FOR UPDATE SKIP LOCKED`
  - **SQL Server:** `SELECT ... WITH (UPDLOCK, READPAST)`
- Workers claim a 5-minute lease with automatic heartbeat renewal. If a worker process abruptly crashes (OOM, container restart), stale leases automatically return to `Queued` status for failover processing after the lease timeout expires.

---

## 6. Docker Container Security & Non-Root Execution

- All production containers (`Dockerfile.public-api`, `Dockerfile.private-api`, `Dockerfile.worker`) run as unprivileged `$APP_UID` (non-root).
- Read-only root filesystems where appropriate with mounted volume `/data/storage` for file outputs.

---

## 7. Operational Health Checks & Observability

- Endpoints:
  - `GET /health` on Gateway and APIs returns HTTP 200 with database connectivity and worker lease status.
  - Correlation IDs (`X-Correlation-Id`) propagated from client -> API -> DB -> Worker -> Webhook.

