import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'pdfstudio-theme';
  readonly theme = signal<Theme>(this.initial());

  constructor() {
    this.apply(this.theme());
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.apply(next);
    try { localStorage.setItem(this.KEY, next); } catch { /* storage unavailable */ }
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(this.KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  private apply(t: Theme): void {
    document.documentElement.setAttribute('data-theme', t);
  }
}
