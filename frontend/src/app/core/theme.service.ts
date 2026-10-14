import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * Storefront colour theme. Light (bone) is the brand default; dark is opt-in via the header toggle
 * and remembered per browser. The admin portal always uses the light theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly chosen = signal<Theme>(readStoredTheme());
  private readonly admin = signal(false);

  readonly theme = computed<Theme>(() => (this.admin() ? 'light' : this.chosen()));
  readonly isDark = computed(() => this.theme() === 'dark');

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.chosen.set(this.chosen() === 'dark' ? 'light' : 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, this.chosen());
    } catch {
      // Storage unavailable: the choice lasts for this page session.
    }
    this.apply();
  }

  /** Admin pages call this with true (always light); the storefront with false. */
  setAdminScope(admin: boolean): void {
    this.admin.set(admin);
    this.apply();
  }

  private apply(): void {
    const html = this.document.documentElement;
    if (this.theme() === 'dark') {
      html.setAttribute('data-theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
    }
    this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.isDark() ? '#0b0b0c' : '#f5f2ec');
  }
}

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
