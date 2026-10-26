import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

export type NoteKind = 'success' | 'error' | 'info';
export interface AppNotification {
  id: string; kind: NoteKind; title: string; message: string;
  atUtc: string; read: boolean; link?: string;
}

const POLL_MS = 15000;
const MAX_KEPT = 50;

/** In-app notifications: job results (polled from the Jobs API) plus anything the app pushes. Stored per user in this browser. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private auth = inject(AuthService);
  private api = inject(ApiService);

  readonly items = signal<AppNotification[]>([]);
  readonly unread = computed(() => this.items().filter(n => !n.read).length);

  private timer: any = null;
  private seen = new Map<string, string>();   // jobId -> last status we have already handled
  private baselined = false;
  private user = '';

  constructor() {
    effect(() => {
      const s = this.auth.currentSession();
      if (s) this.start(s.email); else this.stop();
    });
  }

  push(kind: NoteKind, title: string, message: string, link?: string): void {
    const n: AppNotification = {
      id: Math.random().toString(36).slice(2, 10), kind, title, message,
      atUtc: new Date().toISOString(), read: false, link
    };
    this.items.update(a => [n, ...a].slice(0, MAX_KEPT));
    this.save();
  }

  markAllRead(): void { this.items.update(a => a.map(n => ({ ...n, read: true }))); this.save(); }
  markRead(id: string): void { this.items.update(a => a.map(n => n.id === id ? { ...n, read: true } : n)); this.save(); }
  remove(id: string): void { this.items.update(a => a.filter(n => n.id !== id)); this.save(); }
  clear(): void { this.items.set([]); this.save(); }

  // ---------- polling ----------
  private start(email: string): void {
    if (this.timer && this.user === email) return;
    this.stop();
    this.user = email;
    this.load();
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.items.set([]); this.seen.clear(); this.baselined = false; this.user = '';
  }

  private poll(): void {
    this.api.getJobs().subscribe(jobs => {
      for (const j of jobs) {
        const before = this.seen.get(j.id);
        this.seen.set(j.id, j.status);
        // The first poll only records what already exists, so old jobs do not flood the bell.
        if (!this.baselined || before === j.status) continue;
        const label = `Job ${j.id.slice(0, 8)}`;
        if (j.status === 'Completed') this.push('success', 'PDF ready', `${label} finished. Open Documents to view it.`, '/documents');
        else if (j.status === 'Failed') this.push('error', 'PDF job failed', `${label}: ${j.errorMessage || 'the job failed.'}`, '/jobs');
      }
      this.baselined = true;
    });
  }

  // ---------- storage ----------
  private key(): string { return `pdfstudio-notifications:${this.user}`; }
  private load(): void {
    try { this.items.set(JSON.parse(localStorage.getItem(this.key()) || '[]')); } catch { this.items.set([]); }
  }
  private save(): void {
    try { localStorage.setItem(this.key(), JSON.stringify(this.items())); } catch { /* storage unavailable */ }
  }
}
