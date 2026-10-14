import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Money } from '../core/catalog.models';
import { SavedAddress } from '../core/customer-auth.service';
import { OrderStatus, PaymentStatus } from './admin-orders.service';

export type CustomerKind = 'registered' | 'guests' | 'all';

export interface AdminCustomer {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  registered: boolean;
  registered_at: string | null;
  phone_verified: boolean;
  order_count: number;
  total_ordered: Money;
  last_order_at: string | null;
  created_at: string;
}

export interface AdminCustomerDetail extends AdminCustomer {
  default_address: SavedAddress | null;
  last_login_at: string | null;
  must_change_password: boolean;
  orders: {
    id: number;
    order_number: string;
    created_at: string;
    order_status: OrderStatus;
    payment_status: PaymentStatus;
    grand_total: Money;
    placed_signed_in: boolean;
  }[];
}

@Injectable({ providedIn: 'root' })
export class AdminCustomersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/customers`;

  list(filters: { q?: string; kind: CustomerKind; page: number; page_size: number }): Observable<{ items: AdminCustomer[]; total: number }> {
    let params = new HttpParams().set('kind', filters.kind).set('page', filters.page).set('page_size', filters.page_size);
    if (filters.q?.trim()) params = params.set('q', filters.q.trim());
    return this.http.get<{ items: AdminCustomer[]; total: number }>(this.base, { params });
  }

  get(id: number): Observable<AdminCustomerDetail> {
    return this.http.get<AdminCustomerDetail>(`${this.base}/${id}`);
  }

  update(id: number, body: { full_name: string; phone: string; email: string | null; phone_verified: boolean }): Observable<AdminCustomerDetail> {
    return this.http.patch<AdminCustomerDetail>(`${this.base}/${id}`, body);
  }

  resetPassword(id: number): Observable<{ temporary_password: string }> {
    return this.http.post<{ temporary_password: string }>(`${this.base}/${id}/reset-password`, {});
  }

  deleteAccount(id: number): Observable<AdminCustomerDetail> {
    return this.http.delete<AdminCustomerDetail>(`${this.base}/${id}/account`);
  }
}
