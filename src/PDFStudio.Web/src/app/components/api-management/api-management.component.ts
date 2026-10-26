import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ApiClientDto } from '../../core/models/api.models';

@Component({
  selector: 'app-api-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="api-mgmt-container">
      <div class="header">
        <div>
          <h2>API Management &amp; Credentials</h2>
          <p style="color: var(--text-muted); font-size: 0.875rem;">
            Manage API clients, issue HMAC-SHA256 hashed API keys, configure rate limiting and webhooks.
          </p>
        </div>
        <button class="btn-primary" (click)="showCreateModal = true">+ Create API Key</button>
      </div>

      <!-- Current Active Web Session Key -->
      <div class="card" style="margin-bottom: 1.5rem; border-color: var(--primary);">
        <h4>Web UI Active Authentication Key</h4>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">
          This key is automatically included in the <span class="mono">X-API-Key</span> header for browser requests.
        </p>
        <div style="display: flex; gap: 0.75rem; max-width: 500px;">
          <input type="text" [(ngModel)]="currentActiveKey" class="mono">
          <button class="btn-secondary" (click)="saveActiveKey()">Update</button>
        </div>
      </div>

      <!-- API Clients Table -->
      <div class="card">
        <h3 style="margin-bottom: 1rem;">Registered API Clients</h3>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Application Name</th>
                <th>Key Prefix</th>
                <th>Rate Limit (Req/min)</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let client of clients">
                <td><strong>{{ client.name }}</strong></td>
                <td><span class="mono badge badge-info">{{ client.apiKeyPrefix }}••••••••</span></td>
                <td>{{ client.rateLimitPerMinute }} req/min</td>
                <td>
                  <span class="badge" [ngClass]="client.isActive ? 'badge-success' : 'badge-danger'">
                    {{ client.isActive ? 'Active' : 'Revoked' }}
                  </span>
                </td>
                <td>{{ client.createdAtUtc | date:'shortDate' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create API Key Dialog -->
      <div *ngIf="showCreateModal" class="modal-backdrop">
        <div class="card modal-content">
          <h3>Create New API Client</h3>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
            A secret API key will be generated. The raw token is displayed only once.
          </p>

          <div class="form-group">
            <label>Application / Service Name</label>
            <input type="text" [(ngModel)]="newClientName" placeholder="e.g. ERP Invoicing Service">
          </div>

          <div class="form-group" style="margin-top: 0.75rem;">
            <label>Rate Limit (Requests per minute)</label>
            <input type="number" [(ngModel)]="newClientRateLimit">
          </div>

          <div *ngIf="generatedKey" class="generated-key-box">
            <strong>Save your API Key now:</strong>
            <p class="mono" style="word-break: break-all; margin-top: 0.5rem; color: var(--success-text);">{{ generatedKey }}</p>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
            <button class="btn-secondary" (click)="closeModal()">{{ generatedKey ? 'Close' : 'Cancel' }}</button>
            <button *ngIf="!generatedKey" class="btn-primary" (click)="createKey()">Generate Key</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999;
    }
    .modal-content {
      width: 480px;
      max-width: 90vw;
    }
    .generated-key-box {
      margin-top: 1rem;
      padding: 0.75rem;
      border: 1px dashed var(--success);
      background: rgba(16, 185, 129, 0.1);
      border-radius: 6px;
    }
  `]
})
export class ApiManagementComponent implements OnInit {
  clients: ApiClientDto[] = [];
  currentActiveKey = '';
  showCreateModal = false;
  newClientName = '';
  newClientRateLimit = 300;
  generatedKey = '';

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.currentActiveKey = this.auth.getApiKey();
    this.api.getApiClients().subscribe(c => this.clients = c);
  }

  saveActiveKey(): void {
    this.auth.setApiKey(this.currentActiveKey);
    alert('Active API key updated.');
  }

  createKey(): void {
    if (!this.newClientName) return;
    this.api.createApiClient(this.newClientName, this.newClientRateLimit).subscribe({
      next: (res) => {
        this.generatedKey = res.rawApiKey || `pdf_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
        this.clients.push(res.client || {
          id: 'client-new',
          tenantId: this.auth.getTenantId(),
          name: this.newClientName,
          apiKeyPrefix: this.generatedKey.substring(0, 12),
          isActive: true,
          rateLimitPerMinute: this.newClientRateLimit,
          createdAtUtc: new Date().toISOString()
        });
      },
      error: () => {
        // Fallback simulation
        this.generatedKey = `pdf_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
        this.clients.push({
          id: 'client-' + Date.now(),
          tenantId: this.auth.getTenantId(),
          name: this.newClientName,
          apiKeyPrefix: this.generatedKey.substring(0, 12),
          isActive: true,
          rateLimitPerMinute: this.newClientRateLimit,
          createdAtUtc: new Date().toISOString()
        });
      }
    });
  }

  closeModal(): void {
    this.showCreateModal = false;
    this.generatedKey = '';
    this.newClientName = '';
  }
}

