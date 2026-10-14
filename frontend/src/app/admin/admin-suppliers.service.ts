import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Money } from '../core/catalog.models';

export type SupplierBillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export const BILL_STATUS_LABELS: Record<SupplierBillStatus, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Part paid',
  PAID: 'Paid',
};

export interface CurrencyBalance {
  currency: string;
  billed: Money;
  paid: Money;
  outstanding: Money;
  overdue: Money;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  default_currency: string;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  balances: CurrencyBalance[];
  open_bills: number;
}

export interface SupplierInput {
  name: string;
  phone: string | null;
  email: string | null;
  default_currency: string;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface SupplierBillListItem {
  id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_reference: string | null;
  bill_date: string;
  due_date: string | null;
  currency: string;
  total_amount: Money;
  paid_amount: Money;
  outstanding_amount: Money;
  status: SupplierBillStatus;
  is_overdue: boolean;
  items_pending: number;
}

export interface SupplierBillDetail extends SupplierBillListItem {
  description: string | null;
  notes: string | null;
  items: {
    id: number;
    product_variant_id: number | null;
    sku: string | null;
    description: string;
    quantity: number;
    quantity_received: number;
    unit_cost: Money | null;
  }[];
  payments: {
    id: number;
    amount: Money;
    currency: string;
    exchange_rate_to_qar: string | null;
    amount_qar: Money | null;
    paid_at: string;
    payment_reference: string | null;
    notes: string | null;
    recorded_by: string | null;
  }[];
  created_by: string | null;
  created_at: string;
}

export interface SupplierBillInput {
  supplier_id: number;
  supplier_reference: string | null;
  bill_date: string;
  due_date: string | null;
  description: string | null;
  currency: string;
  total_amount: string;
  notes: string | null;
  items: { product_variant_id: number | null; description: string; quantity: number; unit_cost: string | null }[];
  receive_now: boolean;
}

export interface SupplierPaymentInput {
  amount: string;
  paid_at?: string | null;
  exchange_rate_to_qar?: string | null;
  amount_qar?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminSuppliersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  suppliers(includeInactive = false): Observable<Supplier[]> {
    const params = includeInactive ? new HttpParams().set('include_inactive', 'true') : undefined;
    return this.http.get<Supplier[]>(`${this.base}/suppliers`, { params });
  }

  createSupplier(body: SupplierInput): Observable<Supplier> {
    return this.http.post<Supplier>(`${this.base}/suppliers`, body);
  }

  updateSupplier(id: number, body: SupplierInput): Observable<Supplier> {
    return this.http.patch<Supplier>(`${this.base}/suppliers/${id}`, body);
  }

  bills(filters: { supplier_id?: number | null; status?: SupplierBillStatus | ''; outstanding_only?: boolean } = {}): Observable<SupplierBillListItem[]> {
    let params = new HttpParams();
    if (filters.supplier_id) params = params.set('supplier_id', filters.supplier_id);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.outstanding_only) params = params.set('outstanding_only', 'true');
    return this.http.get<SupplierBillListItem[]>(`${this.base}/supplier-bills`, { params });
  }

  bill(id: number): Observable<SupplierBillDetail> {
    return this.http.get<SupplierBillDetail>(`${this.base}/supplier-bills/${id}`);
  }

  createBill(body: SupplierBillInput): Observable<SupplierBillDetail> {
    return this.http.post<SupplierBillDetail>(`${this.base}/supplier-bills`, body);
  }

  updateBill(id: number, body: { supplier_reference?: string | null; due_date?: string | null; notes?: string | null }): Observable<SupplierBillDetail> {
    return this.http.patch<SupplierBillDetail>(`${this.base}/supplier-bills/${id}`, body);
  }

  addPayment(id: number, body: SupplierPaymentInput): Observable<SupplierBillDetail> {
    return this.http.post<SupplierBillDetail>(`${this.base}/supplier-bills/${id}/payments`, body);
  }

  receive(id: number, lines: { item_id: number; quantity: number }[]): Observable<SupplierBillDetail> {
    return this.http.post<SupplierBillDetail>(`${this.base}/supplier-bills/${id}/receive`, { lines });
  }
}

/** "PKR 250,000.00" — supplier amounts are shown in their own currency, never assumed QAR. */
export function money(amount: string | number, currency: string): string {
  const n = Number(amount);
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
