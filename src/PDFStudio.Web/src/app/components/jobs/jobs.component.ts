import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { PdfJobDto } from '../../core/models/api.models';

@Component({
  selector: 'app-jobs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="jobs-container">
      <div class="header">
        <div>
          <h2>Background Job Monitor</h2>
          <p style="color: var(--text-muted); font-size: 0.875rem;">
            Real-time tracking of queued, executing, and historical batch generation and manipulation jobs.
          </p>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">Polling active (every 3s)</span>
          <button class="btn-secondary" (click)="loadJobs()">🔄 Refresh Now</button>
          <button class="btn-danger" (click)="clearFinished()" [disabled]="jobs.length === 0">🧹 Clear Finished</button>
          <button class="btn-danger" (click)="clearAll()" [disabled]="jobs.length === 0" title="Also removes queued / stuck jobs">Clear All</button>
        </div>
      </div>

      <div class="card">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Job Identifier</th>
                <th>Task Type</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Queued At</th>
                <th>Completed At</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let job of jobs">
                <td class="mono font-semibold">{{ job.id }}</td>
                <td>{{ job.jobType }}</td>
                <td>
                  <span class="badge" [ngClass]="{
                    'badge-success': job.status === 'Completed',
                    'badge-info': job.status === 'Processing',
                    'badge-warning': job.status === 'Queued',
                    'badge-danger': job.status === 'Failed'
                  }">{{ job.status }}</span>
                </td>
                <td>
                  <div class="progress-bar-container">
                    <div class="progress-bar-fill" [style.width.%]="job.progressPercent"></div>
                  </div>
                  <span style="font-size: 0.75rem; color: var(--text-muted);">{{ job.progressPercent }}%</span>
                </td>
                <td>{{ job.createdAtUtc | date:'mediumTime' }}</td>
                <td>{{ (job.completedAtUtc | date:'mediumTime') || '—' }}</td>
                <td class="mono" style="font-size: 0.75rem;">{{ job.resultDocumentId || job.errorMessage || '—' }}</td>
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
      margin-bottom: 1.5rem;
    }
    .progress-bar-container {
      width: 100px;
      height: 6px;
      background: var(--bg-elevated);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 2px;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--accent);
      transition: width 0.3s ease;
    }
  `]
})
export class JobsComponent implements OnInit, OnDestroy {
  jobs: PdfJobDto[] = [];
  intervalId: any;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadJobs();
    this.intervalId = setInterval(() => this.loadJobs(), 3000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  clearFinished(): void {
    if (!confirm('Remove all completed and failed jobs from the list? Queued and running jobs are kept.')) {
      return;
    }
    this.api.clearJobs().subscribe({
      next: () => this.loadJobs(),
      error: err => {
        console.error('Clear failed', err);
        alert('Could not clear the jobs. Check that the Public API is running.');
      }
    });
  }

  clearAll(): void {
    if (!confirm('Remove ALL jobs, including queued and stuck ones? Jobs that are still running will be lost.')) {
      return;
    }
    this.api.clearJobs(true).subscribe({
      next: () => this.loadJobs(),
      error: err => {
        console.error('Clear all failed', err);
        alert('Could not clear the jobs. Check that the Public API is running (and restart it so it has the new code).');
      }
    });
  }

  loadJobs(): void {
    this.api.getJobs().subscribe(jobs => this.jobs = jobs);
  }
}

