import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';

export type AdminRole = 'OWNER' | 'ADMIN';

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
}

interface TokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  admin: AdminUser;
}

interface StoredSession {
  token: string;
  expiresAt: string;
  admin: AdminUser;
}

// sessionStorage: the admin session ends when the browser tab closes.
const STORAGE_KEY = 'admin_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly session = signal<StoredSession | null>(readStoredSession());

  readonly admin = computed(() => this.session()?.admin ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  get token(): string | null {
    const session = this.session();
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.clear();
      return null;
    }
    return session.token;
  }

  login(email: string, password: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${environment.apiBaseUrl}/admin/auth/login`, { email, password })
      .pipe(
        tap((res) =>
          this.store({ token: res.access_token, expiresAt: res.expires_at, admin: res.admin }),
        ),
      );
  }

  /** Keep the stored session in step after the admin edits their own profile. */
  updateAdmin(admin: AdminUser): void {
    const session = this.session();
    if (session) this.store({ ...session, admin });
  }

  logout(): void {
    this.clear();
    void this.router.navigate(['/admin/login']);
  }

  /** Called when the API rejects the token (expired, revoked or admin deactivated). */
  handleUnauthorised(): void {
    if (!this.session()) return;
    this.clear();
    void this.router.navigate(['/admin/login'], {
      queryParams: { returnUrl: this.router.url, expired: 1 },
    });
  }

  private store(session: StoredSession): void {
    this.session.set(session);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage unavailable (private mode): the session lives in memory only.
    }
  }

  private clear(): void {
    this.session.set(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    return new Date(session.expiresAt).getTime() > Date.now() ? session : null;
  } catch {
    return null;
  }
}
