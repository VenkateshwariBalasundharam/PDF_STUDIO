import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-container">
      <h2>Tenant &amp; Platform Administration</h2>
      <p style="color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem;">
        Configure organization tenant settings, storage quotas, and security boundaries.
      </p>

      <div class="card" style="margin-bottom: 1.5rem;">
        <h3>Tenant Information</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div>
            <label style="font-size: 0.8rem; color: var(--text-muted);">Tenant Identifier (GUID)</label>
            <input type="text" [value]="tenantId" readonly class="mono" style="background: var(--bg-secondary);">
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-muted);">Current Subscription Tier</label>
            <input type="text" value="Enterprise Dedicated (Unlimited Worker Pool)" readonly style="background: var(--bg-secondary);">
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 1.5rem;">
        <h3>Security &amp; Isolation Policies</h3>
        <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;">
            <input type="checkbox" checked disabled> Strict Tenant Isolation via ADO.NET WHERE tenant_id
          </label>
          <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;">
            <input type="checkbox" checked disabled> Anti-SSRF URL Sanitizer Enabled (Chromium Headless)
          </label>
          <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;">
            <input type="checkbox" checked disabled> SHA-256 Cryptographic Checksum Integrity Verification
          </label>
          <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;">
            <input type="checkbox" checked disabled> Stubble Logic-less Template Engine Sandboxing
          </label>
        </div>
      </div>

      <div class="card">
        <h3>System Audit Stream</h3>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
          Recent security events and authorization activities.
        </p>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Status</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Just now</td>
                <td class="mono">admin&#64;pdfstudio.io</td>
                <td>GeneratePdf</td>
                <td><span class="badge badge-success">Success</span></td>
                <td class="mono">127.0.0.1</td>
              </tr>
              <tr>
                <td>10 mins ago</td>
                <td class="mono">pdf_live_92f...</td>
                <td>ClaimLeasedJob</td>
                <td><span class="badge badge-success">Success</span></td>
                <td class="mono">10.0.2.14</td>
              </tr>
              <tr>
                <td>1 hour ago</td>
                <td class="mono">anonymous</td>
                <td>AuthorizeApiKey</td>
                <td><span class="badge badge-danger">Denied (401)</span></td>
                <td class="mono">198.51.100.22</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-container {
      display: flex;
      flex-direction: column;
    }
  `]
})
export class AdminComponent implements OnInit {
  tenantId = '';

  constructor(private auth: AuthService) {}

  ngOnInit(): void {
    this.tenantId = this.auth.getTenantId();
  }
}

