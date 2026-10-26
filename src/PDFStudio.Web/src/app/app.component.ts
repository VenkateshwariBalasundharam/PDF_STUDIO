import { Component, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { NotificationService } from './core/services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <router-outlet *ngIf="!auth.currentSession()"></router-outlet>
    <div class="layout" *ngIf="auth.currentSession() as session">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5zM8 13h8v1.5H8zm0 3.5h8V18H8z"/></svg></span>
          <span class="brand-name">PDFStudio</span>
          <span class="version-pill">v1.0 LTS</span>
        </div>

        <nav class="nav-menu">
          <div class="nav-section-title">CORE PLATFORM</div>
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg> <span>Dashboard</span>
          </a>
          <a routerLink="/generate" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg> <span>PDF Generator</span>
          </a>
          <a routerLink="/editor" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg> <span>Editor</span>
          </a>
          <a routerLink="/templates" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg> <span>Templates</span>
          </a>
          <a routerLink="/documents" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> <span>Documents</span>
          </a>
          <a routerLink="/jobs" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> <span>Jobs Monitor</span>
          </a>

          <div class="nav-section-title" style="margin-top: 1.25rem;">DEVELOPER &amp; ADMIN</div>
          <a routerLink="/api-management" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l1-1v-2h2l1-1v-2l1.3-1.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.1-2.1z"/></svg> <span>API Keys &amp; Usage</span>
          </a>
          <a routerLink="/developer" routerLinkActive="active" class="nav-item">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/></svg> <span>Developer Portal</span>
          </a>
          <a routerLink="/admin" routerLinkActive="active" class="nav-item" (click)="adminClick($event)">
            <svg class="ni" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg> <span>Administration</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <div style="font-size: 0.75rem; color: var(--text-muted);">Tenant: Acme Corp</div>
          <div class="mono" style="font-size: 0.65rem; color: var(--accent-text);">Active: Worker Leases OK</div>
        </div>
      </aside>

      <div class="main-col">
        <!-- Top bar -->
        <header class="topbar">
          <h1 class="page-title">{{ pageTitle() }}</h1>
          <div class="theme-switch-wrap" [title]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'">
            <span class="theme-ico">
              <ng-container *ngIf="theme.theme() === 'light'"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></ng-container>
              <ng-container *ngIf="theme.theme() === 'dark'"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></ng-container>
            </span>
            <button type="button" role="switch" class="switch" [class.on]="theme.theme() === 'dark'"
                    [attr.aria-checked]="theme.theme() === 'dark'" aria-label="Toggle dark mode"
                    (click)="theme.toggle()"><span class="knob"></span></button>
          </div>
          <div class="bell-wrap">
            <button type="button" class="icon-btn bell" aria-label="Notifications" (click)="toggleBell($event)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="dot" *ngIf="notes.unread() > 0"></span></button>
            <div class="note-panel" *ngIf="bellOpen" (click)="$event.stopPropagation()">
              <div class="note-head">
                <strong>Notifications</strong>
                <span class="note-actions">
                  <button type="button" (click)="notes.markAllRead()" [disabled]="notes.unread() === 0">Mark all read</button>
                  <button type="button" (click)="notes.clear()" [disabled]="!notes.items().length">Clear</button>
                </span>
              </div>
              <div class="note-empty" *ngIf="!notes.items().length">You're all caught up.</div>
              <div class="note-list">
                <div class="note" *ngFor="let n of notes.items()" [class.unread]="!n.read" (click)="openNote(n)">
                  <span class="note-ico" [ngClass]="n.kind">{{ n.kind === 'success' ? '✓' : n.kind === 'error' ? '!' : 'i' }}</span>
                  <span class="note-body"><b>{{ n.title }}</b><span>{{ n.message }}</span><small>{{ n.atUtc | date:'medium' }}</small></span>
                  <button type="button" class="note-x" aria-label="Dismiss" (click)="dismiss($event, n.id)">×</button>
                </div>
              </div>
            </div>
          </div>
          <span class="who" [title]="session.email + ' (' + session.role + ')'">
            <span class="avatar">{{ session.email.charAt(0).toUpperCase() }}</span>
            <span class="who-mail">{{ session.email }}</span>
          </span>
          <button type="button" class="signout" (click)="signOut()">Sign out</button>
        </header>

        <main class="content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .who { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text-main); }
    .who-mail { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .signout { padding: 0.35rem 0.8rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-main); font-size: 0.8rem; cursor: pointer; }
    .signout:hover { border-color: var(--primary); }
    .layout { display: flex; min-height: 100vh; width: 100%; }
    .main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }

    .sidebar {
      width: 232px; position: sticky; top: 0; height: 100vh; overflow-y: auto;
      background: var(--bg-sidebar); border-right: 1px solid var(--border-color);
      display: flex; flex-direction: column; flex-shrink: 0;
    }
    .brand { display: flex; align-items: center; gap: 0.5rem; padding: 1.1rem 1.1rem; }
    .brand-icon { color: var(--primary); display: inline-flex; }
    .brand-name { font-size: 1.1rem; font-weight: 700; color: var(--brand-text); letter-spacing: -0.02em; }
    .version-pill {
      font-size: 0.6rem; font-weight: 600; padding: 0.15rem 0.45rem; border-radius: 999px;
      background: var(--tile-bg); color: var(--tile-fg);
    }
    .nav-menu { padding: 0.75rem 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; flex: 1; }
    .nav-section-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
      color: var(--text-muted); padding: 0 0.75rem; margin: 0.25rem 0 0.4rem;
    }
    .nav-item {
      display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.75rem;
      color: var(--nav-text); border-radius: 8px; font-size: 0.875rem; font-weight: 500;
      text-decoration: none; transition: all 0.15s ease;
    }
    .nav-item:hover { background: var(--bg-hover); color: var(--text-main); text-decoration: none; }
    .nav-item.active { background: var(--primary); color: #ffffff; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35); }
    .ni { flex-shrink: 0; }
    .sidebar-footer { padding: 1rem; border-top: 1px solid var(--border-color); background: var(--bg-sidebar-footer); }

    /* Top bar */
    .topbar {
      position: sticky; top: 0; z-index: 20; height: 56px; padding: 0 clamp(1rem, 2.5vw, 2.5rem);
      display: flex; align-items: center; justify-content: flex-end; gap: 1.1rem;
      background: var(--bg-sidebar); border-bottom: 1px solid var(--border-color);
    }
    .page-title { margin: 0 auto 0 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .theme-switch-wrap { display: flex; align-items: center; gap: 0.55rem; color: var(--text-muted); }
    .theme-ico { display: inline-flex; color: #f59e0b; }
    :host-context([data-theme="dark"]) .theme-ico { color: #a5b4fc; }
    .switch {
      position: relative; width: 38px; height: 22px; padding: 0; border: none; border-radius: 999px;
      background: var(--bg-elevated-hover); transition: background 0.2s ease;
    }
    .switch.on { background: var(--primary); }
    .switch .knob {
      position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
      background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.2s ease;
    }
    .switch.on .knob { transform: translateX(16px); }
    .icon-btn {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; padding: 0; background: transparent; border: none; color: var(--text-muted);
    }
    .icon-btn:hover { background: var(--bg-hover); color: var(--text-main); }
    .bell-wrap { position: relative; }
    .note-panel { position: absolute; right: 0; top: 42px; width: 340px; max-height: 420px; display: flex; flex-direction: column; background: var(--bg-sidebar); border: 1px solid var(--border-color); border-radius: 10px; box-shadow: 0 12px 30px rgba(0,0,0,0.25); z-index: 50; }
    .note-head { display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-main); }
    .note-actions button { background: none; border: none; color: var(--primary); font-size: 0.75rem; cursor: pointer; margin-left: 0.6rem; }
    .note-actions button:disabled { color: var(--text-muted); cursor: default; }
    .note-empty { padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
    .note-list { overflow-y: auto; }
    .note { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--border-color); cursor: pointer; font-size: 0.8rem; color: var(--text-main); }
    .note:hover { background: var(--bg-hover); }
    .note.unread { background: rgba(37, 99, 235, 0.07); }
    .note-ico { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 0.75rem; font-weight: 700; background: #64748b; }
    .note-ico.success { background: #16a34a; } .note-ico.error { background: #ef4444; }
    .note-body { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .note-body small { color: var(--text-muted); font-size: 0.7rem; }
    .note-x { background: none; border: none; color: var(--text-muted); font-size: 1.1rem; line-height: 1; cursor: pointer; }
    .bell .dot {
      position: absolute; top: 6px; right: 7px; width: 8px; height: 8px; border-radius: 50%;
      background: #ef4444; border: 2px solid var(--bg-sidebar);
    }
    .user-btn {
      display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.15rem 0.3rem;
      background: transparent; border: none; color: var(--text-muted);
    }
    .user-btn:hover { background: var(--bg-hover); }
    .avatar {
      width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center;
      justify-content: center; background: var(--primary); color: #fff; font-weight: 600; font-size: 0.85rem;
    }

    .content { flex: 1; min-width: 0; width: 100%; padding: clamp(1rem, 2.5vw, 2.25rem); overflow-x: hidden; }

    @media (max-width: 900px) {
      .layout { flex-direction: column; }
      .sidebar { width: 100%; height: auto; position: static; border-right: none; border-bottom: 1px solid var(--border-color); }
      .brand { padding: 0.75rem 1rem; }
      .nav-menu { flex-direction: row; flex-wrap: nowrap; overflow-x: auto; padding: 0.5rem; gap: 0.35rem; }
      .nav-section-title, .sidebar-footer { display: none; }
      .nav-item { white-space: nowrap; flex-shrink: 0; }
      .topbar { position: static; }
    }
  `]
})
export class AppComponent {
  title = 'PDFStudio Enterprise';
  theme = inject(ThemeService);
  auth = inject(AuthService);
  notes = inject(NotificationService);
  private router = inject(Router);
  bellOpen = false;
  pageTitle = signal('Dashboard');

  private static readonly TITLES: [string, string][] = [
    ['/dashboard', 'Dashboard'], ['/generate', 'PDF Generator'], ['/code-editor', 'Code Editor'],
    ['/editor', 'Editor'], ['/unlock', 'Unlock PDF'], ['/templates', 'Templates'], ['/documents', 'Documents'],
    ['/jobs', 'Jobs Monitor'], ['/api-management', 'API Keys & Usage'], ['/developer', 'Developer Portal'],
    ['/admin', 'Administration']
  ];

  constructor() {
    const set = (url: string) => {
      const path = url.split('?')[0].split('#')[0];
      this.pageTitle.set(AppComponent.TITLES.find(([p]) => path === p || path.startsWith(p + '/'))?.[1] ?? 'PDFStudio');
    };
    set(this.router.url);
    this.router.events.subscribe(e => { if (e instanceof NavigationEnd) set(e.urlAfterRedirects); });
  }

  /** Administration is listed for everyone; only Admin accounts may open it. */
  adminClick(ev: Event) {
    if (this.auth.isAdmin()) return;
    ev.preventDefault();
    this.notes.push('info', 'Administrators only', 'Your account does not have access to Administration.');
  }

  toggleBell(e: Event): void { e.stopPropagation(); this.bellOpen = !this.bellOpen; }
  openNote(n: { id: string; link?: string }): void {
    this.notes.markRead(n.id);
    if (n.link) { this.bellOpen = false; this.router.navigateByUrl(n.link); }
  }
  dismiss(e: Event, id: string): void { e.stopPropagation(); this.notes.remove(id); }
  @HostListener('document:click') closeBell(): void { this.bellOpen = false; }

  signOut(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
