import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Money } from './catalog.models';
import { OrderStatus, PaymentStatus } from './orders.service';

export interface SavedAddress {
  area?: string | null;
  zone?: string | null;
  street?: string | null;
  building?: string | null;
  unit?: string | null;
  landmark?: string | null;
  instructions?: string | null;
}

export interface CustomerProfile {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  default_address: SavedAddress | null;
  phone_verified: boolean;
  must_change_password: boolean;
  registered_at: string;
}

export interface AccountOrder {
  order_number: string;
  public_token: string;
  created_at: string;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  grand_total: Money;
  currency: string;
  item_count: number;
  item_names: string[];
  image_url: string | null;
}

interface Session {
  token: string;
  expires_at: string;
  customer: CustomerProfile;
}

const STORAGE_KEY = 'customer_session';

/**
 * Optional storefront account (phone + password). Kept apart from the admin session: its own
 * storage key, token type and interceptor rules. Stays signed in across visits until expiry.
 */
@Injectable({ providedIn: 'root' })
export class CustomerAuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/account`;
  private readonly session = signal<Session | null>(readSession());

  readonly customer = computed(() => this.session()?.customer ?? null);
  readonly signedIn = computed(() => this.session() !== null);

  get token(): string | null {
    const s = this.session();
    if (!s) return null;
    if (new Date(s.expires_at).getTime() <= Date.now()) {
      this.clear();
      return null;
    }
    return s.token;
  }

  register(body: { full_name: string; phone: string; email: string | null; password: string }): Observable<Session> {
    return this.http.post<Session>(`${this.base}/register`, body).pipe(tap((s) => this.store(s)));
  }

  login(phone: string, password: string): Observable<Session> {
    return this.http.post<Session>(`${this.base}/login`, { phone, password }).pipe(tap((s) => this.store(s)));
  }

  /** Re-read the profile (e.g. after an admin verified the phone). */
  refresh(): void {
    if (!this.token) return;
    this.http.get<CustomerProfile>(`${this.base}/me`).subscribe({ next: (c) => this.setCustomer(c) });
  }

  updateProfile(body: { full_name: string; email: string | null; default_address: SavedAddress | null }): Observable<CustomerProfile> {
    return this.http.patch<CustomerProfile>(`${this.base}/me`, body).pipe(tap((c) => this.setCustomer(c)));
  }

  changePassword(current_password: string, new_password: string): Observable<Session> {
    return this.http.post<Session>(`${this.base}/change-password`, { current_password, new_password }).pipe(tap((s) => this.store(s)));
  }

  orders(): Observable<AccountOrder[]> {
    return this.http.get<AccountOrder[]>(`${this.base}/orders`);
  }

  /** Called on sign out, and when the API says the session is no longer valid. */
  clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private setCustomer(customer: CustomerProfile): void {
    const s = this.session();
    if (s) this.store({ ...s, customer });
  }

  private store(s: Session): void {
    this.session.set(s);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Private mode: the session lasts until the tab closes.
    }
  }
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return new Date(s.expires_at).getTime() > Date.now() ? s : null;
  } catch {
    return null;
  }
}
