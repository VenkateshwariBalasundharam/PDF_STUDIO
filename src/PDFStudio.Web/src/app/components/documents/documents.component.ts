import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { DocumentDto } from '../../core/models/api.models';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="documents-container">
      <div class="header">
        <div>
          <h2>Document Repository</h2>
          <p style="color: var(--text-muted); font-size: 0.875rem;">
            Secure multi-tenant document storage with SHA-256 integrity checksums and automated lifecycle retention.
          </p>
        </div>
        <div class="header-actions">
          <button class="btn-danger" (click)="clearAll()" [disabled]="documents.length === 0">🗑 Clear All</button>
          <div class="filter-tabs">
            <button [class.active]="filter === 'all'" (click)="filter = 'all'">All ({{ activeDocuments.length }})</button>
            <button [class.active]="filter === 'favorites'" (click)="filter = 'favorites'">Favorites ({{ favoriteDocuments.length }})</button>
            <button [class.active]="filter === 'archived'" (click)="filter = 'archived'">Archived ({{ archivedDocuments.length }})</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Version</th>
                <th>Size</th>
                <th>Pages</th>
                <th>Checksum (SHA-256)</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let doc of filteredDocuments">
                <td>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <button type="button"
                            class="star-btn"
                            [class.starred]="doc.isFavorite"
                            (click)="toggleFavorite(doc)"
                            [title]="doc.isFavorite ? 'Remove from favorites' : 'Mark as favorite'">
                      {{ doc.isFavorite ? '★' : '☆' }}
                    </button>
                    <strong>{{ doc.title }}</strong>
                    <span *ngIf="doc.isArchived" class="badge badge-warning" style="font-size: 0.7rem;">Archived</span>
                  </div>
                  <span style="font-size: 0.75rem; color: var(--text-muted);">{{ doc.fileName }}</span>
                </td>
                <td><span class="badge badge-info">v{{ doc.version }}</span></td>
                <td>{{ (doc.fileSizeBytes / 1024) | number:'1.1-1' }} KB</td>
                <td>{{ doc.pageCount }}</td>
                <td class="mono" style="font-size: 0.75rem;" title="{{ doc.sha256Checksum }}">
                  {{ doc.sha256Checksum ? (doc.sha256Checksum | slice:0:12) + '...' : '—' }}
                </td>
                <td>{{ doc.createdAtUtc | date:'short' }}</td>
                <td>
                  <div style="display: flex; align-items: center; gap: 0.35rem;">
                    <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" (click)="download(doc)" title="Download document">
                      ⬇ Download
                    </button>
                    <button *ngIf="!doc.isArchived"
                            class="btn-secondary"
                            style="padding: 0.25rem 0.5rem; font-size: 0.75rem;"
                            (click)="toggleArchive(doc)"
                            title="Archive this document">
                      📦 Archive
                    </button>
                    <button *ngIf="doc.isArchived"
                            class="btn-secondary"
                            style="padding: 0.25rem 0.5rem; font-size: 0.75rem;"
                            (click)="toggleArchive(doc)"
                            title="Restore document from archive">
                      ↺ Restore
                    </button>
                    <button class="btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" (click)="remove(doc)" title="Delete document">
                      🗑 Delete
                    </button>
                  </div>
                </td>
              </tr>
              <tr *ngIf="filteredDocuments.length === 0">
                <td colspan="7" style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
                  <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">
                    {{ filter === 'favorites' ? '⭐' : (filter === 'archived' ? '📦' : '📄') }}
                  </div>
                  <div style="font-weight: 500;">
                    {{ filter === 'favorites' ? 'No favorite documents' : (filter === 'archived' ? 'No archived documents' : 'No documents available') }}
                  </div>
                  <div style="font-size: 0.8rem; margin-top: 0.25rem;">
                    {{ filter === 'favorites' ? 'Click the star icon (☆) beside any document title to add it to your favorites.' : (filter === 'archived' ? 'Click the "Archive" button on any active document to move it here.' : 'Generate invoices or bills to populate this repository.') }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .filter-tabs {
      display: flex;
      gap: 0.5rem;
      background: var(--bg-card);
      padding: 0.25rem;
      border-radius: 6px;
      border: 1px solid var(--border-color);
    }
    .filter-tabs button {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 0.35rem 0.75rem;
      cursor: pointer;
    }
    .filter-tabs button.active {
      background: var(--primary);
      color: white;
      border-radius: 4px;
    }
    .star-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 1.15rem;
      line-height: 1;
      padding: 0.1rem 0.2rem;
      color: var(--text-muted);
      transition: color 0.15s ease, transform 0.1s ease;
    }
    .star-btn:hover {
      transform: scale(1.2);
      color: #f59e0b;
    }
    .star-btn.starred {
      color: #f59e0b;
    }
  `]
})
export class DocumentsComponent implements OnInit {
  documents: DocumentDto[] = [];
  filter: 'all' | 'favorites' | 'archived' = 'all';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.getDocuments().subscribe(d => this.documents = d);
  }

  get activeDocuments(): DocumentDto[] {
    return this.documents.filter(d => !d.isArchived);
  }

  get favoriteDocuments(): DocumentDto[] {
    return this.documents.filter(d => d.isFavorite && !d.isArchived);
  }

  get archivedDocuments(): DocumentDto[] {
    return this.documents.filter(d => d.isArchived);
  }

  get filteredDocuments(): DocumentDto[] {
    if (this.filter === 'favorites') return this.favoriteDocuments;
    if (this.filter === 'archived') return this.archivedDocuments;
    return this.activeDocuments;
  }

  toggleFavorite(doc: DocumentDto): void {
    const nextVal = !doc.isFavorite;
    doc.isFavorite = nextVal;
    this.api.toggleFavoriteDocument(doc.id, nextVal).subscribe({
      error: err => {
        doc.isFavorite = !nextVal;
        console.error('Failed to update favorite status', err);
        alert('Could not update favorite status. Check that the Public API is running.');
      }
    });
  }

  toggleArchive(doc: DocumentDto): void {
    const nextVal = !doc.isArchived;
    doc.isArchived = nextVal;
    doc.status = nextVal ? 'archived' : 'Ready';
    this.api.toggleArchiveDocument(doc.id, nextVal).subscribe({
      error: err => {
        doc.isArchived = !nextVal;
        doc.status = !nextVal ? 'archived' : 'Ready';
        console.error('Failed to update archive status', err);
        alert('Could not update archive status. Check that the Public API is running.');
      }
    });
  }

  remove(doc: DocumentDto): void {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) {
      return;
    }
    this.api.deleteDocument(doc.id).subscribe({
      next: () => (this.documents = this.documents.filter(d => d.id !== doc.id)),
      error: err => {
        console.error('Delete failed', err);
        alert('Could not delete the document. Check that the Public API is running.');
      }
    });
  }

  clearAll(): void {
    if (this.documents.length === 0) {
      return;
    }
    if (!confirm(`Delete all ${this.documents.length} documents? This cannot be undone.`)) {
      return;
    }
    this.api.clearDocuments().subscribe({
      next: () => (this.documents = []),
      error: err => {
        console.error('Clear failed', err);
        alert('Could not clear the documents. Check that the Public API is running.');
      }
    });
  }

  download(doc: DocumentDto): void {
    this.api.downloadDocument(doc.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName;
        a.click();
      },
      error: (err) => {
        console.error('Download failed', err);
        alert('Download failed. Check that the Public API is running and the document file exists.');
      }
    });
  }
}

