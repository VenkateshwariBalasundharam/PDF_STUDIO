import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { DashboardMetricsDto, PdfJobDto } from '../../core/models/api.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard-container">
      <header class="header">
        <div>
          <h2>Enterprise PDF Overview</h2>
          <p class="subtitle">Real-time status of document generation, worker pool, and storage utilization.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="refresh-btn" (click)="load()" [class.spin]="loading" title="Refresh" aria-label="Refresh">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
          </button>
          <a routerLink="/generate" class="btn-primary quick">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Quick Generate
          </a>
        </div>
      </header>

      <!-- Stat Cards -->
      <div class="stats">
        <div class="card stat-card">
          <span class="tile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg></span>
          <div class="stat-body">
            <span class="stat-title">Total PDFs Generated</span>
            <span class="stat-value">{{ metrics ? (metrics.totalPdfsGenerated | number) : '…' }}</span>
            <span class="stat-desc">{{ metrics?.generatedToday || 0 }} today · {{ weekTotal }} in the last 7 days</span>
          </div>
          <svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity="0.25"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs><path [attr.d]="areaPath(daily)" fill="url(#g1)"/><path [attr.d]="linePath(daily)" fill="none" stroke="var(--primary)" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>
        </div>

        <div class="card stat-card">
          <span class="tile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3c2 .8 3.5 2.7 3.5 5.7"/></svg></span>
          <div class="stat-body">
            <span class="stat-title">Active Queue Jobs</span>
            <span class="stat-value">{{ metrics?.activeJobsCount }}</span>
            <span class="stat-desc"><i class="live-dot"></i>{{ metrics?.activeJobsCount ? 'Queued or running now' : 'No jobs waiting' }}</span>
          </div>
        </div>

        <div class="card stat-card">
          <span class="tile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg></span>
          <div class="stat-body">
            <span class="stat-title">Documents Stored</span>
            <span class="stat-value">{{ metrics?.totalDocumentsStored }}</span>
            <div class="usage">
              <span class="stat-desc">{{ usedMb | number:'1.1-1' }} MB of 2 GB</span>
              <div class="bar"><div class="fill" [style.width.%]="usedPercent"></div></div>
              <span class="stat-desc">{{ usedPercent | number:'1.0-0' }}%</span>
            </div>
          </div>
        </div>

        <div class="card stat-card">
          <span class="tile"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span>
          <div class="stat-body">
            <span class="stat-title">Avg Generation Latency</span>
            <span class="stat-value">{{ metrics?.latencySamples ? (metrics?.averageGenerationTimeMs + ' ms') : '—' }}</span>
            <span class="stat-desc" [class.text-success]="(metrics?.averageGenerationTimeMs || 0) < 1500">{{ !metrics?.latencySamples ? 'Generate a PDF to measure' : ((metrics?.averageGenerationTimeMs || 0) < 1500 ? 'Within 1.5 s target' : 'Slower than 1.5 s target') }} · last {{ metrics?.latencySamples || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- Recent Jobs -->
      <div class="card recent">
        <div class="recent-head">
          <div class="recent-title">
            <span class="accent-bar"></span>
            <span class="tile sm"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
            <h3>Recent Processing Activity</h3>
          </div>
          <a routerLink="/jobs" class="view-all">View all jobs →</a>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Operation</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let job of recentJobs">
                <td class="job-id">{{ job.id }}</td>
                <td><strong>{{ job.jobType }}</strong></td>
                <td>
                  <span class="badge" [ngClass]="{
                    'badge-success': job.status === 'Completed',
                    'badge-info': job.status === 'Processing',
                    'badge-warning': job.status === 'Queued',
                    'badge-danger': job.status === 'Failed'
                  }">{{ job.status }}</span>
                </td>
                <td>{{ job.progressPercent }}%</td>
                <td>{{ job.createdAtUtc | date:'shortTime' }}</td>
              </tr>
              <tr *ngIf="recentJobs.length === 0">
                <td colspan="5" class="empty">No jobs yet. Generate a PDF to see activity here.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .dashboard-container { display: flex; flex-direction: column; gap: 1.5rem; width: 100%; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .header h2 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
    .subtitle { color: var(--text-muted); font-size: 0.875rem; margin-top: 0.15rem; }
    .header-actions { display: flex; align-items: center; gap: 0.75rem; }
    .refresh-btn {
      display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; padding: 0;
      background: var(--bg-card); color: var(--primary); border: 1px solid var(--border-color); border-radius: 8px;
      box-shadow: var(--shadow-card);
    }
    .refresh-btn:hover { background: var(--bg-hover); }
    .refresh-btn.spin svg { animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .quick { gap: 0.5rem; padding: 0.6rem 1.1rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
    .stat-card { position: relative; display: flex; align-items: flex-start; gap: 0.9rem; padding: 1.1rem; overflow: hidden; }
    .tile {
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 42px; height: 42px; border-radius: 10px; background: var(--tile-bg); color: var(--tile-fg);
    }
    .tile.sm { width: 30px; height: 30px; border-radius: 8px; }
    .stat-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; flex: 1; }
    .stat-title { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
    .stat-value { font-size: 1.75rem; font-weight: 700; line-height: 1.2; letter-spacing: -0.02em; }
    .stat-desc { font-size: 0.72rem; color: var(--text-muted); display: inline-flex; align-items: center; gap: 0.4rem; }
    .text-success { color: var(--success-text); font-weight: 500; }
    .live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); display: inline-block; }
    .spark { flex: 0 0 84px; width: 84px; height: 38px; align-self: flex-end; }
    .usage { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.15rem; }
    .bar { flex: 1; height: 6px; border-radius: 99px; background: var(--bg-elevated); overflow: hidden; min-width: 40px; }
    .fill { height: 100%; border-radius: 99px; background: var(--primary); }

    .recent { padding: 0; overflow: hidden; }
    .recent-head { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; }
    .recent-title { display: flex; align-items: center; gap: 0.75rem; }
    .recent-title h3 { font-size: 1rem; font-weight: 600; }
    .accent-bar { width: 3px; height: 28px; border-radius: 3px; background: var(--primary); margin-left: -1.25rem; margin-right: 0.5rem; }
    .view-all { font-size: 0.8rem; font-weight: 500; }
    .recent .table-container { border: none; border-radius: 0; border-top: 1px solid var(--border-color); }
    th { font-size: 0.68rem; }
    .job-id { font-weight: 600; }
    .empty { text-align: center; color: var(--text-muted); padding: 1.5rem; }
    .badge { display: inline-flex; align-items: center; gap: 0.4rem; }
    .badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  `]
})
export class DashboardComponent implements OnInit {
  metrics: DashboardMetricsDto | null = null;
  recentJobs: PdfJobDto[] = [];
  loading = false;

  // Storage quota shown on the usage bar (fixed 2 GB display limit).
  private readonly storageQuotaBytes = 2 * 1024 * 1024 * 1024;

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.getMetrics().subscribe({ next: m => this.metrics = m, error: () => {} });
    this.api.getJobs().subscribe({
      next: jobs => { this.recentJobs = jobs.slice(0, 5); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  get daily(): number[] { return this.metrics?.generatedLast7Days ?? [0, 0, 0, 0, 0, 0, 0]; }
  get weekTotal(): number { return this.daily.reduce((a, b) => a + b, 0); }

  get usedMb(): number { return (this.metrics?.storageUsedBytes || 0) / 1048576; }
  get usedPercent(): number {
    return Math.min(100, ((this.metrics?.storageUsedBytes || 0) / this.storageQuotaBytes) * 100);
  }

  linePath(v: number[]): string {
    const max = Math.max(...v), min = Math.min(...v), span = max - min || 1;
    return v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * 100},${36 - ((y - min) / span) * 30}`).join(' ');
  }
  areaPath(v: number[]): string { return `${this.linePath(v)} L100,40 L0,40 Z`; }
}
