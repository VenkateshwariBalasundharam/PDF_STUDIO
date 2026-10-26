/* ============================================================================
   PDFStudio - Phase 2 - SQL Server seed data (development / demo)
   Run once, after 001_schema.sql.

   SECURITY NOTE
   * No passwords, API keys, or webhook secrets are seeded. Seeded users have
     PasswordHash = NULL (cannot sign in) and no ApiKeys rows exist.
   * Credentials are created in Phase 4 by a dev-only CLI (set password,
     issue API key), so no secret ever lives in source control.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRAN;

/* ---------- Permission catalog (RBAC for users) ---------- */
INSERT INTO pdf.Permissions (Code, Description) VALUES
 ('pdf.generate',     N'Generate PDFs from the web/desktop app'),
 ('template.read',    N'View templates'),
 ('template.write',   N'Create and edit templates'),
 ('template.publish', N'Publish and deprecate template versions'),
 ('document.read',    N'View documents'),
 ('document.download',N'Download documents'),
 ('document.delete',  N'Delete or archive documents'),
 ('job.read',         N'View jobs'),
 ('job.manage',       N'Cancel and retry jobs'),
 ('apikey.read',      N'View API clients, keys and usage'),
 ('apikey.manage',    N'Create and revoke API clients and keys, edit rate limits and webhooks'),
 ('user.read',        N'View users'),
 ('user.manage',      N'Create and edit users'),
 ('role.manage',      N'Manage roles and permissions'),
 ('audit.read',       N'View audit and security logs'),
 ('storage.manage',   N'Storage administration'),
 ('tenant.manage',    N'Platform: manage organizations'),
 ('system.manage',    N'Platform: manage system settings');

/* ---------- API scope catalog (for API clients) ---------- */
INSERT INTO pdf.ApiScopes (Code, Description) VALUES
 ('pdf:generate',      N'Generate PDFs and create jobs'),
 ('pdf:read',          N'Read job status and PDF information'),
 ('pdf:merge',         N'Merge PDFs'),
 ('pdf:split',         N'Split PDFs'),
 ('pdf:stamp',         N'Stamp PDFs'),
 ('pdf:watermark',     N'Watermark PDFs'),
 ('template:read',     N'Read templates'),
 ('template:write',    N'Create and update templates'),
 ('document:read',     N'Read document records'),
 ('document:download', N'Download document files');

/* ---------- Organizations ---------- */
INSERT INTO pdf.Organizations (Id, Code, Name, Status, IsPlatform) VALUES
 ('00000000-0000-0000-0000-000000000001', N'platform', N'PDFStudio Platform',  1, 1),
 ('11111111-1111-1111-1111-111111111111', N'acme',     N'Acme Corporation',    1, 0),
 ('22222222-2222-2222-2222-222222222222', N'globex',   N'Globex Industries',   1, 0);

/* ---------- Users (no passwords seeded) ---------- */
INSERT INTO pdf.Users (Id, OrganizationId, Email, DisplayName, PasswordHash, IsActive) VALUES
 ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', N'platform.admin@pdfstudio.local', N'Platform Admin',  NULL, 1),
 ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', N'admin@acme.local',               N'Alice Admin',     NULL, 1),
 ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', N'dev@acme.local',                 N'Dave Developer',  NULL, 1),
 ('b1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', N'admin@globex.local',             N'Gina Admin',      NULL, 1);

/* ---------- Roles ---------- */
INSERT INTO pdf.Roles (Id, OrganizationId, Name, Description, IsSystem) VALUES
 ('f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', N'Platform Admin', N'Operates the platform',      1),
 ('a2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', N'Admin',          N'Full organization access', 1),
 ('a2000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', N'Developer',      N'Templates, PDFs, API keys', 1),
 ('a2000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', N'Viewer',         N'Read-only',                1),
 ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', N'Admin',          N'Full organization access', 1),
 ('b2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', N'Developer',      N'Templates, PDFs, API keys', 1),
 ('b2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', N'Viewer',         N'Read-only',                1);

INSERT INTO pdf.UserRoles (OrganizationId, UserId, RoleId) VALUES
 ('00000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001'),
 ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001'),
 ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002'),
 ('22222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001');

/* ---------- Role -> permission mapping ---------- */
-- Platform Admin: everything
INSERT INTO pdf.RolePermissions (OrganizationId, RoleId, PermissionId)
SELECT r.OrganizationId, r.Id, p.Id
FROM pdf.Roles r CROSS JOIN pdf.Permissions p
WHERE r.Name = N'Platform Admin';

-- Tenant Admin: everything except platform-only permissions
INSERT INTO pdf.RolePermissions (OrganizationId, RoleId, PermissionId)
SELECT r.OrganizationId, r.Id, p.Id
FROM pdf.Roles r CROSS JOIN pdf.Permissions p
WHERE r.Name = N'Admin' AND p.Code NOT IN ('tenant.manage','system.manage');

-- Developer
INSERT INTO pdf.RolePermissions (OrganizationId, RoleId, PermissionId)
SELECT r.OrganizationId, r.Id, p.Id
FROM pdf.Roles r JOIN pdf.Permissions p
  ON p.Code IN ('pdf.generate','template.read','template.write','template.publish',
                'document.read','document.download','job.read','apikey.read','apikey.manage')
WHERE r.Name = N'Developer';

-- Viewer
INSERT INTO pdf.RolePermissions (OrganizationId, RoleId, PermissionId)
SELECT r.OrganizationId, r.Id, p.Id
FROM pdf.Roles r JOIN pdf.Permissions p
  ON p.Code IN ('template.read','document.read','document.download','job.read')
WHERE r.Name = N'Viewer';

/* ---------- API clients (no keys issued here) ---------- */
INSERT INTO pdf.ApiClients (Id, OrganizationId, Name, Description, ClientType, Status, AllowedIps, CreatedByUserId) VALUES
 ('a3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', N'Acme Billing System',
     N'External billing app generating invoices', 1, 1, NULL, 'a1000000-0000-0000-0000-000000000001'),
 ('a3000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', N'CompanyStudio (internal)',
     N'Internal service identity for CompanyStudio', 3, 1, NULL, 'a1000000-0000-0000-0000-000000000001'),
 ('b3000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', N'Globex ERP',
     N'ERP connector', 1, 1, NULL, 'b1000000-0000-0000-0000-000000000001');

-- Acme Billing: generate/read + template/document read + download
INSERT INTO pdf.ApiClientScopes (OrganizationId, ApiClientId, ApiScopeId)
SELECT '11111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000001', s.Id
FROM pdf.ApiScopes s WHERE s.Code IN ('pdf:generate','pdf:read','template:read','document:read','document:download');

-- CompanyStudio: all scopes
INSERT INTO pdf.ApiClientScopes (OrganizationId, ApiClientId, ApiScopeId)
SELECT '11111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000002', s.Id
FROM pdf.ApiScopes s;

-- Globex ERP: generate/read/download
INSERT INTO pdf.ApiClientScopes (OrganizationId, ApiClientId, ApiScopeId)
SELECT '22222222-2222-2222-2222-222222222222', 'b3000000-0000-0000-0000-000000000001', s.Id
FROM pdf.ApiScopes s WHERE s.Code IN ('pdf:generate','pdf:read','template:read','document:read','document:download');

/* ---------- Rate limits: organization defaults + one client override ---------- */
INSERT INTO pdf.ApiRateLimits (Id, OrganizationId, ApiClientId, PermitsPerMinute, PermitsPerDay, MaxConcurrentJobs) VALUES
 (NEWID(), '11111111-1111-1111-1111-111111111111', NULL,                                   120, 50000, 5),
 (NEWID(), '11111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000001', 300, 100000, 10),
 (NEWID(), '22222222-2222-2222-2222-222222222222', NULL,                                    30,  2000, 2);

/* ---------- Templates ---------- */
DECLARE @invoiceHtml nvarchar(max) = N'
<h1>{{companyName}}</h1>
<p>Invoice: {{invoiceNo}}</p>
<p>Customer: {{customerName}}</p>
<p>Date: {{invoiceDate}}</p>
{{#items}}
<table>
  <tr><td>{{description}}</td><td>{{quantity}}</td><td>{{price}}</td></tr>
</table>
{{/items}}
{{^items}}<p>No line items.</p>{{/items}}
<p><strong>Total: {{amount}}</strong></p>';

DECLARE @invoiceCss nvarchar(max) = N'
body { font-family: Arial, sans-serif; font-size: 12pt; color: #222; }
h1 { font-size: 20pt; margin-bottom: 4pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
td { border-bottom: 1px solid #ddd; padding: 4pt 6pt; }';

DECLARE @receiptHtml nvarchar(max) = N'
<h1>Receipt</h1>
<p>Received from {{customerName}}</p>
<p>Amount: {{amount}}</p>';

DECLARE @pageSettings nvarchar(max) = N'{"size":"A4","orientation":"portrait","margins":{"top":"20mm","right":"15mm","bottom":"20mm","left":"15mm"}}';
DECLARE @footerHtml nvarchar(max) = N'<div style="font-size:9pt;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>';

-- Acme: invoice-standard (published v1), receipt-simple (draft v1)
INSERT INTO pdf.PdfTemplates (Id, OrganizationId, TemplateKey, Name, Description, Category, Status, CreatedByUserId) VALUES
 ('a4000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'invoice-standard', N'Standard Invoice', N'Standard single-currency invoice', N'Finance', 1, 'a1000000-0000-0000-0000-000000000002'),
 ('a4000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'receipt-simple',   N'Simple Receipt',   N'Draft receipt template',            N'Finance', 1, 'a1000000-0000-0000-0000-000000000002'),
 ('b4000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'invoice-standard', N'Standard Invoice', N'Globex invoice (same key as Acme, different tenant)', N'Finance', 1, 'b1000000-0000-0000-0000-000000000001');

INSERT INTO pdf.PdfTemplateVersions
 (Id, OrganizationId, TemplateId, VersionNumber, Status, HtmlContent, CssContent, FooterHtml, PageSettingsJson, Locale, ContentHash, ChangeNote, PublishedAtUtc, PublishedByUserId, CreatedByUserId) VALUES
 ('a5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a4000000-0000-0000-0000-000000000001', 1, 2,
    @invoiceHtml, @invoiceCss, @footerHtml, @pageSettings, 'en-US',
    LOWER(CONVERT(char(64), HASHBYTES('SHA2_256', @invoiceHtml), 2)), N'Initial version', SYSUTCDATETIME(),
    'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002'),
 ('a5000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a4000000-0000-0000-0000-000000000002', 1, 1,
    @receiptHtml, @invoiceCss, @footerHtml, @pageSettings, 'en-US',
    NULL, N'Draft', NULL, NULL, 'a1000000-0000-0000-0000-000000000002'),
 ('b5000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'b4000000-0000-0000-0000-000000000001', 1, 2,
    @invoiceHtml, @invoiceCss, @footerHtml, @pageSettings, 'en-US',
    LOWER(CONVERT(char(64), HASHBYTES('SHA2_256', @invoiceHtml), 2)), N'Initial version', SYSUTCDATETIME(),
    'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001');

UPDATE pdf.PdfTemplates SET CurrentVersionId = 'a5000000-0000-0000-0000-000000000001' WHERE Id = 'a4000000-0000-0000-0000-000000000001';
UPDATE pdf.PdfTemplates SET CurrentVersionId = 'b5000000-0000-0000-0000-000000000001' WHERE Id = 'b4000000-0000-0000-0000-000000000001';

-- Field definitions (data type: 1 String, 2 Number, 3 Boolean, 4 Date, 5 Array, 6 Object)
INSERT INTO pdf.PdfTemplateFields (Id, OrganizationId, TemplateVersionId, FieldPath, Label, DataType, IsRequired, FormatPattern, DefaultValue, SortOrder)
SELECT NEWID(), v.OrganizationId, v.VersionId, f.FieldPath, f.Label, f.DataType, f.IsRequired, f.FormatPattern, f.DefaultValue, f.SortOrder
FROM (VALUES
   ('a5000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
   ('b5000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222')
) AS v(VersionId, OrganizationId)
CROSS JOIN (VALUES
   ('companyName',          N'Company name',  1, 0, NULL,         N'',  1),
   ('invoiceNo',            N'Invoice number',1, 1, NULL,         NULL, 2),
   ('customerName',         N'Customer name', 1, 1, NULL,         NULL, 3),
   ('invoiceDate',          N'Invoice date',  4, 0, 'yyyy-MM-dd', NULL, 4),
   ('amount',               N'Total amount',  2, 1, 'N2',         NULL, 5),
   ('items',                N'Line items',    5, 0, NULL,         NULL, 6),
   ('items[].description',  N'Description',   1, 0, NULL,         NULL, 7),
   ('items[].quantity',     N'Quantity',      2, 0, 'N0',         NULL, 8),
   ('items[].price',        N'Unit price',    2, 0, 'N2',         NULL, 9)
) AS f(FieldPath, Label, DataType, IsRequired, FormatPattern, DefaultValue, SortOrder);

INSERT INTO pdf.PdfTemplateFields (Id, OrganizationId, TemplateVersionId, FieldPath, Label, DataType, IsRequired, FormatPattern, SortOrder) VALUES
 (NEWID(), '11111111-1111-1111-1111-111111111111', 'a5000000-0000-0000-0000-000000000002', 'customerName', N'Customer name', 1, 1, NULL, 1),
 (NEWID(), '11111111-1111-1111-1111-111111111111', 'a5000000-0000-0000-0000-000000000002', 'amount',       N'Amount',        2, 1, 'N2', 2);

/* ---------- Global system settings ---------- */
INSERT INTO pdf.SystemSettings (OrganizationId, SettingKey, SettingValue, IsSecret) VALUES
 (NULL, 'Storage.Provider',            N'LocalFileSystem', 0),
 (NULL, 'Upload.MaxBytes',             N'10485760',        0),
 (NULL, 'Documents.RetentionDays',     N'90',              0),
 (NULL, 'Jobs.MaxAttempts',            N'5',               0),
 (NULL, 'Jobs.LeaseSeconds',           N'300',             0),
 (NULL, 'Renderer.TimeoutSeconds',     N'60',              0),
 (NULL, 'Renderer.AllowRemoteResources', N'false',         0),
 (NULL, 'Webhooks.MaxAttempts',        N'8',               0),
 (NULL, 'Security.MaxFailedLogins',    N'5',               0),
 (NULL, 'Security.LockoutMinutes',     N'15',              0),
 (NULL, 'Security.AccessTokenMinutes', N'15',              0),
 (NULL, 'Security.RefreshTokenDays',   N'14',              0);
-- Per-organization override example
INSERT INTO pdf.SystemSettings (OrganizationId, SettingKey, SettingValue, IsSecret) VALUES
 ('22222222-2222-2222-2222-222222222222', 'Documents.RetentionDays', N'30', 0);

/* ---------- Licenses ---------- */
INSERT INTO pdf.Licenses (Id, OrganizationId, Edition, Status, StartsAtUtc, ExpiresAtUtc, LimitsJson) VALUES
 (NEWID(), '00000000-0000-0000-0000-000000000001', 'Enterprise',   1, SYSUTCDATETIME(), NULL,
   N'{"pdfPerMonth":-1,"apiCallsPerMonth":-1,"storageMb":-1,"users":-1,"templates":-1,"concurrentJobs":-1}'),
 (NEWID(), '11111111-1111-1111-1111-111111111111', 'Professional', 1, SYSUTCDATETIME(), DATEADD(YEAR, 1, SYSUTCDATETIME()),
   N'{"pdfPerMonth":50000,"apiCallsPerMonth":500000,"storageMb":51200,"users":50,"templates":200,"concurrentJobs":10}'),
 (NEWID(), '22222222-2222-2222-2222-222222222222', 'Trial',        1, SYSUTCDATETIME(), DATEADD(DAY, 30, SYSUTCDATETIME()),
   N'{"pdfPerMonth":500,"apiCallsPerMonth":5000,"storageMb":512,"users":3,"templates":10,"concurrentJobs":2}');

INSERT INTO pdf.SchemaVersions (ScriptName) VALUES (N'002_seed.sql');
COMMIT TRAN;
GO
