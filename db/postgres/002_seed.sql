/* ============================================================================
   PDFStudio - Phase 2 - PostgreSQL seed data (development / demo)
   Run once, after 001_schema.sql.

   SECURITY NOTE
   * No passwords, API keys, or webhook secrets are seeded. Seeded users have
     password_hash = NULL (cannot sign in) and no api_keys rows exist.
   * Credentials are created in Phase 4 by a dev-only CLI.
   ============================================================================ */
BEGIN;

/* ---------- Permission catalog ---------- */
INSERT INTO pdf.permissions (code, description) VALUES
 ('pdf.generate',      'Generate PDFs from the web/desktop app'),
 ('template.read',     'View templates'),
 ('template.write',    'Create and edit templates'),
 ('template.publish',  'Publish and deprecate template versions'),
 ('document.read',     'View documents'),
 ('document.download', 'Download documents'),
 ('document.delete',   'Delete or archive documents'),
 ('job.read',          'View jobs'),
 ('job.manage',        'Cancel and retry jobs'),
 ('apikey.read',       'View API clients, keys and usage'),
 ('apikey.manage',     'Create and revoke API clients and keys, edit rate limits and webhooks'),
 ('user.read',         'View users'),
 ('user.manage',       'Create and edit users'),
 ('role.manage',       'Manage roles and permissions'),
 ('audit.read',        'View audit and security logs'),
 ('storage.manage',    'Storage administration'),
 ('tenant.manage',     'Platform: manage organizations'),
 ('system.manage',     'Platform: manage system settings');

/* ---------- API scope catalog ---------- */
INSERT INTO pdf.api_scopes (code, description) VALUES
 ('pdf:generate',      'Generate PDFs and create jobs'),
 ('pdf:read',          'Read job status and PDF information'),
 ('pdf:merge',         'Merge PDFs'),
 ('pdf:split',         'Split PDFs'),
 ('pdf:stamp',         'Stamp PDFs'),
 ('pdf:watermark',     'Watermark PDFs'),
 ('template:read',     'Read templates'),
 ('template:write',    'Create and update templates'),
 ('document:read',     'Read document records'),
 ('document:download', 'Download document files');

/* ---------- Organizations ---------- */
INSERT INTO pdf.organizations (id, code, name, status, is_platform) VALUES
 ('00000000-0000-0000-0000-000000000001', 'platform', 'PDFStudio Platform', 1, true),
 ('11111111-1111-1111-1111-111111111111', 'acme',     'Acme Corporation',   1, false),
 ('22222222-2222-2222-2222-222222222222', 'globex',   'Globex Industries',  1, false);

/* ---------- Users (no passwords seeded) ---------- */
INSERT INTO pdf.users (id, organization_id, email, display_name, password_hash, is_active) VALUES
 ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'platform.admin@pdfstudio.local', 'Platform Admin',  NULL, true),
 ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'admin@acme.local',               'Alice Admin',     NULL, true),
 ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'dev@acme.local',                 'Dave Developer',  NULL, true),
 ('b1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin@globex.local',             'Gina Admin',      NULL, true);

/* ---------- Roles ---------- */
INSERT INTO pdf.roles (id, organization_id, name, description, is_system) VALUES
 ('f2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Platform Admin', 'Operates the platform',       true),
 ('a2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Admin',          'Full organization access',  true),
 ('a2000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Developer',      'Templates, PDFs, API keys', true),
 ('a2000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Viewer',         'Read-only',                 true),
 ('b2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Admin',          'Full organization access',  true),
 ('b2000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Developer',      'Templates, PDFs, API keys', true),
 ('b2000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Viewer',         'Read-only',                 true);

INSERT INTO pdf.user_roles (organization_id, user_id, role_id) VALUES
 ('00000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001'),
 ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001'),
 ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002'),
 ('22222222-2222-2222-2222-222222222222', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001');

/* ---------- Role -> permission mapping ---------- */
INSERT INTO pdf.role_permissions (organization_id, role_id, permission_id)
SELECT r.organization_id, r.id, p.id
FROM pdf.roles r CROSS JOIN pdf.permissions p
WHERE r.name = 'Platform Admin';

INSERT INTO pdf.role_permissions (organization_id, role_id, permission_id)
SELECT r.organization_id, r.id, p.id
FROM pdf.roles r CROSS JOIN pdf.permissions p
WHERE r.name = 'Admin' AND p.code NOT IN ('tenant.manage','system.manage');

INSERT INTO pdf.role_permissions (organization_id, role_id, permission_id)
SELECT r.organization_id, r.id, p.id
FROM pdf.roles r JOIN pdf.permissions p
  ON p.code IN ('pdf.generate','template.read','template.write','template.publish',
                'document.read','document.download','job.read','apikey.read','apikey.manage')
WHERE r.name = 'Developer';

INSERT INTO pdf.role_permissions (organization_id, role_id, permission_id)
SELECT r.organization_id, r.id, p.id
FROM pdf.roles r JOIN pdf.permissions p
  ON p.code IN ('template.read','document.read','document.download','job.read')
WHERE r.name = 'Viewer';

/* ---------- API clients (no keys issued here) ---------- */
INSERT INTO pdf.api_clients (id, organization_id, name, description, client_type, status, allowed_ips, created_by_user_id) VALUES
 ('a3000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Acme Billing System',
     'External billing app generating invoices', 1, 1, NULL, 'a1000000-0000-0000-0000-000000000001'),
 ('a3000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'CompanyStudio (internal)',
     'Internal service identity for CompanyStudio', 3, 1, NULL, 'a1000000-0000-0000-0000-000000000001'),
 ('b3000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Globex ERP',
     'ERP connector', 1, 1, NULL, 'b1000000-0000-0000-0000-000000000001');

INSERT INTO pdf.api_client_scopes (organization_id, api_client_id, api_scope_id)
SELECT '11111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000001', s.id
FROM pdf.api_scopes s WHERE s.code IN ('pdf:generate','pdf:read','template:read','document:read','document:download');

INSERT INTO pdf.api_client_scopes (organization_id, api_client_id, api_scope_id)
SELECT '11111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000002', s.id
FROM pdf.api_scopes s;

INSERT INTO pdf.api_client_scopes (organization_id, api_client_id, api_scope_id)
SELECT '22222222-2222-2222-2222-222222222222', 'b3000000-0000-0000-0000-000000000001', s.id
FROM pdf.api_scopes s WHERE s.code IN ('pdf:generate','pdf:read','template:read','document:read','document:download');

/* ---------- Rate limits ---------- */
INSERT INTO pdf.api_rate_limits (id, organization_id, api_client_id, permits_per_minute, permits_per_day, max_concurrent_jobs) VALUES
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', NULL,                                   120,  50000, 5),
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000001', 300, 100000, 10),
 (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', NULL,                                    30,   2000, 2);

/* ---------- Templates ---------- */
CREATE TEMP TABLE _seed_tpl ON COMMIT DROP AS
SELECT
 $html$
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
<p><strong>Total: {{amount}}</strong></p>$html$ AS invoice_html,
 $css$
body { font-family: Arial, sans-serif; font-size: 12pt; color: #222; }
h1 { font-size: 20pt; margin-bottom: 4pt; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
td { border-bottom: 1px solid #ddd; padding: 4pt 6pt; }$css$ AS css,
 $r$
<h1>Receipt</h1>
<p>Received from {{customerName}}</p>
<p>Amount: {{amount}}</p>$r$ AS receipt_html,
 '<div style="font-size:9pt;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>' AS footer_html,
 '{"size":"A4","orientation":"portrait","margins":{"top":"20mm","right":"15mm","bottom":"20mm","left":"15mm"}}'::jsonb AS page_settings;

INSERT INTO pdf.pdf_templates (id, organization_id, template_key, name, description, category, status, created_by_user_id) VALUES
 ('a4000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'invoice-standard', 'Standard Invoice', 'Standard single-currency invoice', 'Finance', 1, 'a1000000-0000-0000-0000-000000000002'),
 ('a4000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'receipt-simple',   'Simple Receipt',   'Draft receipt template',            'Finance', 1, 'a1000000-0000-0000-0000-000000000002'),
 ('b4000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'invoice-standard', 'Standard Invoice', 'Globex invoice (same key as Acme, different tenant)', 'Finance', 1, 'b1000000-0000-0000-0000-000000000001');

INSERT INTO pdf.pdf_template_versions
 (id, organization_id, template_id, version_number, status, html_content, css_content, footer_html, page_settings_json, locale, content_hash, change_note, published_at_utc, published_by_user_id, created_by_user_id)
SELECT 'a5000000-0000-0000-0000-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'a4000000-0000-0000-0000-000000000001'::uuid, 1, 2,
       invoice_html, css, footer_html, page_settings, 'en-US', encode(sha256(convert_to(invoice_html,'UTF8')),'hex'), 'Initial version', now(),
       'a1000000-0000-0000-0000-000000000001'::uuid, 'a1000000-0000-0000-0000-000000000002'::uuid
FROM _seed_tpl
UNION ALL
SELECT 'a5000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a4000000-0000-0000-0000-000000000002', 1, 1,
       receipt_html, css, footer_html, page_settings, 'en-US', NULL, 'Draft', NULL,
       NULL, 'a1000000-0000-0000-0000-000000000002'
FROM _seed_tpl
UNION ALL
SELECT 'b5000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'b4000000-0000-0000-0000-000000000001', 1, 2,
       invoice_html, css, footer_html, page_settings, 'en-US', encode(sha256(convert_to(invoice_html,'UTF8')),'hex'), 'Initial version', now(),
       'b1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001'
FROM _seed_tpl;

UPDATE pdf.pdf_templates SET current_version_id = 'a5000000-0000-0000-0000-000000000001' WHERE id = 'a4000000-0000-0000-0000-000000000001';
UPDATE pdf.pdf_templates SET current_version_id = 'b5000000-0000-0000-0000-000000000001' WHERE id = 'b4000000-0000-0000-0000-000000000001';

-- data_type: 1 String, 2 Number, 3 Boolean, 4 Date, 5 Array, 6 Object
INSERT INTO pdf.pdf_template_fields (id, organization_id, template_version_id, field_path, label, data_type, is_required, format_pattern, default_value, sort_order)
SELECT gen_random_uuid(), v.organization_id, v.version_id, f.field_path, f.label, f.data_type, f.is_required, f.format_pattern, f.default_value, f.sort_order
FROM (VALUES
   ('a5000000-0000-0000-0000-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid),
   ('b5000000-0000-0000-0000-000000000001'::uuid, '22222222-2222-2222-2222-222222222222'::uuid)
) AS v(version_id, organization_id)
CROSS JOIN (VALUES
   ('companyName',         'Company name',   1::smallint, false, NULL::varchar,  ''::varchar,        1),
   ('invoiceNo',           'Invoice number', 1::smallint, true,  NULL,           NULL,             2),
   ('customerName',        'Customer name',  1::smallint, true,  NULL,           NULL,             3),
   ('invoiceDate',         'Invoice date',   4::smallint, false, 'yyyy-MM-dd',   NULL,             4),
   ('amount',              'Total amount',   2::smallint, true,  'N2',           NULL,             5),
   ('items',               'Line items',     5::smallint, false, NULL,           NULL,             6),
   ('items[].description', 'Description',    1::smallint, false, NULL,           NULL,             7),
   ('items[].quantity',    'Quantity',       2::smallint, false, 'N0',           NULL,             8),
   ('items[].price',       'Unit price',     2::smallint, false, 'N2',           NULL,             9)
) AS f(field_path, label, data_type, is_required, format_pattern, default_value, sort_order);

INSERT INTO pdf.pdf_template_fields (id, organization_id, template_version_id, field_path, label, data_type, is_required, format_pattern, sort_order) VALUES
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a5000000-0000-0000-0000-000000000002', 'customerName', 'Customer name', 1, true, NULL, 1),
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a5000000-0000-0000-0000-000000000002', 'amount',       'Amount',        2, true, 'N2', 2);

/* ---------- Global system settings ---------- */
INSERT INTO pdf.system_settings (organization_id, setting_key, setting_value, is_secret) VALUES
 (NULL, 'Storage.Provider',              'LocalFileSystem', false),
 (NULL, 'Upload.MaxBytes',               '10485760',        false),
 (NULL, 'Documents.RetentionDays',       '90',              false),
 (NULL, 'Jobs.MaxAttempts',              '5',               false),
 (NULL, 'Jobs.LeaseSeconds',             '300',             false),
 (NULL, 'Renderer.TimeoutSeconds',       '60',              false),
 (NULL, 'Renderer.AllowRemoteResources', 'false',           false),
 (NULL, 'Webhooks.MaxAttempts',          '8',               false),
 (NULL, 'Security.MaxFailedLogins',      '5',               false),
 (NULL, 'Security.LockoutMinutes',       '15',              false),
 (NULL, 'Security.AccessTokenMinutes',   '15',              false),
 (NULL, 'Security.RefreshTokenDays',     '14',              false);
INSERT INTO pdf.system_settings (organization_id, setting_key, setting_value, is_secret) VALUES
 ('22222222-2222-2222-2222-222222222222', 'Documents.RetentionDays', '30', false);

/* ---------- Licenses ---------- */
INSERT INTO pdf.licenses (id, organization_id, edition, status, starts_at_utc, expires_at_utc, limits_json) VALUES
 (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'Enterprise',   1, now(), NULL,
   '{"pdfPerMonth":-1,"apiCallsPerMonth":-1,"storageMb":-1,"users":-1,"templates":-1,"concurrentJobs":-1}'),
 (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Professional', 1, now(), now() + interval '1 year',
   '{"pdfPerMonth":50000,"apiCallsPerMonth":500000,"storageMb":51200,"users":50,"templates":200,"concurrentJobs":10}'),
 (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Trial',        1, now(), now() + interval '30 days',
   '{"pdfPerMonth":500,"apiCallsPerMonth":5000,"storageMb":512,"users":3,"templates":10,"concurrentJobs":2}');

INSERT INTO pdf.schema_versions (script_name) VALUES ('002_seed.sql');

COMMIT;
