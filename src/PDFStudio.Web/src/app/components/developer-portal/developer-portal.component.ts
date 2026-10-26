import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-developer-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="portal-container">
      <header class="portal-header">
        <div>
          <h2>Developer Portal &amp; API Documentation</h2>
          <p class="subtitle">Complete technical reference, multi-language code snippets, and interactive sandbox.</p>
        </div>
        <div class="tabs">
          <button [class.active]="activeTab === 'quickstart'" (click)="activeTab = 'quickstart'">Quickstart &amp; Auth</button>
          <button [class.active]="activeTab === 'snippets'" (click)="activeTab = 'snippets'">Code Examples</button>
          <button [class.active]="activeTab === 'reference'" (click)="activeTab = 'reference'">API Reference</button>
          <button [class.active]="activeTab === 'sandbox'" (click)="activeTab = 'sandbox'">Interactive Sandbox</button>
          <button [class.active]="activeTab === 'webhooks'" (click)="activeTab = 'webhooks'">Webhooks</button>
        </div>
      </header>

      <!-- 1. Quickstart & Auth -->
      <section *ngIf="activeTab === 'quickstart'" class="tab-pane">
        <div class="card" style="margin-bottom: 1.5rem;">
          <h3>Authentication Scheme</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem;">
            PDFStudio supports two primary authentication models:
          </p>
          <ul style="margin: 1rem 0 1rem 1.5rem; font-size: 0.875rem; color: var(--text-muted);">
            <li><strong>API Key Authentication (Public API):</strong> Pass your API Key in the <code class="mono">X-API-Key</code> request header. Ideal for server-to-server and backend integration.</li>
            <li><strong>Bearer Token / JWT (Private API &amp; UI):</strong> Pass standard <code class="mono">Authorization: Bearer &lt;token&gt;</code> for tenant admin operations.</li>
          </ul>
          <div class="code-box">
            <span class="code-header">HTTP Headers Required</span>
            <pre class="mono">X-API-Key: pdf_live_a89f41b9...
X-Tenant-Id: 11111111-1111-1111-1111-111111111111
Content-Type: application/json</pre>
          </div>
        </div>

        <div class="card">
          <h3>Standard Response Envelope</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem;">
            All endpoints return a uniform JSON envelope with correlation tracking:
          </p>
          <div class="code-box">
            <span class="code-header">ApiResponse&lt;T&gt; Format</span>
            <pre class="mono">{{ responseEnvelopeExample }}</pre>
          </div>
        </div>
      </section>

      <!-- 2. Code Examples (C#, JS/TS, Angular, curl) -->
      <section *ngIf="activeTab === 'snippets'" class="tab-pane">
        <div class="card">
          <div class="snippet-lang-bar">
            <button [class.active]="activeLang === 'csharp'" (click)="activeLang = 'csharp'">C# (.NET SDK)</button>
            <button [class.active]="activeLang === 'ts'" (click)="activeLang = 'ts'">JavaScript / TypeScript</button>
            <button [class.active]="activeLang === 'angular'" (click)="activeLang = 'angular'">Angular (HttpClient)</button>
            <button [class.active]="activeLang === 'curl'" (click)="activeLang = 'curl'">cURL</button>
          </div>

          <div class="code-box" style="margin-top: 1rem;">
            <span class="code-header">Generate PDF Example ({{ activeLang | uppercase }})</span>
            <pre class="mono">{{ getSnippet() }}</pre>
          </div>
        </div>
      </section>

      <!-- 3. API Reference -->
      <section *ngIf="activeTab === 'reference'" class="tab-pane">
        <div class="card">
          <h3>Public API Route Catalog</h3>
          <div class="table-container" style="margin-top: 1rem;">
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Endpoint</th>
                  <th>Required Scope</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="badge badge-success">POST</span></td>
                  <td class="mono">/api/v1/public/pdf/generate</td>
                  <td>pdf:generate</td>
                  <td>Generate PDF synchronously or enqueue background job</td>
                </tr>
                <tr>
                  <td><span class="badge badge-info">GET</span></td>
                  <td class="mono">/api/v1/public/pdf/jobs/&#123;jobId&#125;</td>
                  <td>pdf:read</td>
                  <td>Retrieve status and progress of a background job</td>
                </tr>
                <tr>
                  <td><span class="badge badge-success">POST</span></td>
                  <td class="mono">/api/v1/public/pdf/merge</td>
                  <td>pdf:merge</td>
                  <td>Merge two or more existing PDF documents</td>
                </tr>
                <tr>
                  <td><span class="badge badge-success">POST</span></td>
                  <td class="mono">/api/v1/public/pdf/split</td>
                  <td>pdf:split</td>
                  <td>Extract specified pages from an existing PDF</td>
                </tr>
                <tr>
                  <td><span class="badge badge-success">POST</span></td>
                  <td class="mono">/api/v1/public/pdf/watermark</td>
                  <td>pdf:generate</td>
                  <td>Apply diagonal semi-transparent watermark text</td>
                </tr>
                <tr>
                  <td><span class="badge badge-info">GET</span></td>
                  <td class="mono">/api/v1/public/documents/&#123;id&#125;/download</td>
                  <td>document:download</td>
                  <td>Stream binary PDF document bytes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- 4. Interactive Sandbox -->
      <section *ngIf="activeTab === 'sandbox'" class="tab-pane">
        <div class="card">
          <h3>Live Sandbox Request Tester</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted);">Request Payload</label>
              <textarea [(ngModel)]="sandboxPayload" rows="12" class="mono"></textarea>
              <button class="btn-primary" style="margin-top: 1rem;" (click)="executeSandbox()">
                Send Test Request
              </button>
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-muted);">Raw Response</label>
              <pre class="mono sandbox-response">{{ sandboxResponse }}</pre>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. Webhooks -->
      <section *ngIf="activeTab === 'webhooks'" class="tab-pane">
        <div class="card">
          <h3>Asynchronous Webhook Notifications</h3>
          <p style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem;">
            When generating large documents asynchronously, PDFStudio posts real-time completion webhooks with HMAC-SHA256 signature verification headers.
          </p>
          <div class="code-box" style="margin-top: 1rem;">
            <span class="code-header">Signature Verification Header</span>
            <pre class="mono">X-PDFStudio-Signature: t=1728472901,v1=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
X-PDFStudio-Event: pdf.job.completed</pre>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .portal-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .portal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 1rem;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    .tabs {
      display: flex;
      gap: 0.5rem;
    }
    .tabs button {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 0.4rem 0.85rem;
    }
    .tabs button.active {
      background: var(--primary);
      color: white;
      border-color: var(--primary);
    }
    .code-box {
      background: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      overflow: hidden;
      margin-top: 0.75rem;
    }
    .code-header {
      display: block;
      background: var(--code-header-bg);
      padding: 0.35rem 0.75rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      font-weight: 600;
    }
    .code-box pre {
      padding: 0.75rem;
      font-size: 0.825rem;
      color: #38bdf8;
      overflow-x: auto;
    }
    .snippet-lang-bar {
      display: flex;
      gap: 0.5rem;
    }
    .snippet-lang-bar button {
      background: var(--bg-elevated);
      color: var(--text-main);
      border: none;
      padding: 0.35rem 0.75rem;
    }
    .snippet-lang-bar button.active {
      background: var(--primary);
      color: white;
    }
    .sandbox-response {
      background: var(--code-bg);
      padding: 0.75rem;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      min-height: 250px;
      color: #34d399;
      font-size: 0.8rem;
    }
  `]
})
export class DeveloperPortalComponent {
  activeTab: 'quickstart' | 'snippets' | 'reference' | 'sandbox' | 'webhooks' = 'quickstart';
  activeLang: 'csharp' | 'ts' | 'angular' | 'curl' = 'csharp';

  responseEnvelopeExample = `{\n  "success": true,\n  "code": "SUCCESS",\n  "message": "Operation completed successfully.",\n  "correlationId": "req-9872-41a",\n  "data": { ... },\n  "timestamp": "2026-10-09T12:00:00Z"\n}`;

  sandboxPayload = `{\n  "templateId": "invoice-default",\n  "data": {\n    "customerName": "Acme Global",\n    "total": "$1,250.00"\n  },\n  "pageSize": "A4",\n  "orientation": "Portrait"\n}`;

  sandboxResponse = `// Click 'Send Test Request' to simulate endpoint response`;

  constructor(private auth: AuthService) {}

  getSnippet(): string {
    switch (this.activeLang) {
      case 'csharp':
        return `// Using PDFStudio.SDK (.NET 10 LTS)
using PDFStudio.SDK.Client;
using PDFStudio.SDK.Models;

var client = new PdfStudioClient(new HttpClient(), new PdfStudioClientOptions
{
    BaseUrl = "https://api.pdfstudio.io",
    ApiKey = "pdf_live_your_secret_key"
});

var response = await client.GeneratePdfAsync(new SdkGeneratePdfRequest(
    TemplateId: "invoice-default",
    Data: new { InvoiceNumber = "INV-101", Amount = "$450.00" },
    PageSize: "A4",
    Orientation: "Portrait"
));

if (response.Success)
{
    Console.WriteLine($"Document created: {response.Data.DocumentId}");
}`;

      case 'ts':
        return `// TypeScript / Node.js
import axios from 'axios';

const response = await axios.post('https://api.pdfstudio.io/api/v1/public/pdf/generate', {
  templateId: 'invoice-default',
  data: { invoiceNumber: 'INV-101', amount: '$450.00' },
  pageSize: 'A4',
  orientation: 'Portrait'
}, {
  headers: {
    'X-API-Key': 'pdf_live_your_secret_key',
    'Content-Type': 'application/json'
  }
});

console.log('Result:', response.data.data.documentId);`;

      case 'angular':
        return `// Angular HttpClient Service
@Injectable({ providedIn: 'root' })
export class PdfClientService {
  constructor(private http: HttpClient) {}

  generatePdf(payload: any) {
    const headers = new HttpHeaders({
      'X-API-Key': 'pdf_live_your_secret_key',
      'Content-Type': 'application/json'
    });
    return this.http.post('https://api.pdfstudio.io/api/v1/public/pdf/generate', payload, { headers });
  }
}`;

      case 'curl':
        return `curl -X POST https://api.pdfstudio.io/api/v1/public/pdf/generate \\
  -H "X-API-Key: pdf_live_your_secret_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "templateId": "invoice-default",
    "data": { "invoiceNumber": "INV-101", "amount": "$450.00" },
    "pageSize": "A4",
    "orientation": "Portrait"
  }'`;
    }
  }

  executeSandbox(): void {
    this.sandboxResponse = `HTTP/1.1 200 OK
Content-Type: application/json
X-Correlation-Id: req-sandbox-${Date.now()}

{
  "success": true,
  "code": "SUCCESS",
  "message": "PDF document generated successfully in sandbox mode.",
  "data": {
    "documentId": "DOC-SANDBOX-8910",
    "status": "completed",
    "fileSizeBytes": 45120,
    "pageCount": 1,
    "downloadUrl": "/api/v1/public/pdf/DOC-SANDBOX-8910/download"
  },
  "timestamp": "${new Date().toISOString()}"
}`;
  }
}

