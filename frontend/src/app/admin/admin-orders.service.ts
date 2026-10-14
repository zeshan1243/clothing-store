import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Money } from '../core/catalog.models';

export type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'DELIVERY_FAILED'
  | 'RETURN_REQUESTED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'New',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  DELIVERY_FAILED: 'Delivery failed',
  RETURN_REQUESTED: 'Return requested',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Unpaid',
  PAID: 'Paid',
  PARTIALLY_REFUNDED: 'Partly refunded',
  REFUNDED: 'Refunded',
};

export interface AdminRef {
  id: number;
  name: string;
}

export interface OrderListItem {
  id: number;
  order_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  delivery_area: string;
  item_count: number;
  grand_total: Money;
  amount_paid: Money;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  assigned_admin: AdminRef | null;
}

export interface OrderListPage {
  items: OrderListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface OrderFilters {
  q?: string;
  status?: OrderStatus[];
  payment_status?: PaymentStatus | '';
  assigned_admin_id?: number | null;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export interface AdminOrderDetail {
  id: number;
  order_number: string;
  public_token: string;
  created_at: string;
  updated_at: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_area: string;
  delivery_distance_km?: number | null;
  delivery_zone: string | null;
  delivery_street: string | null;
  delivery_building: string | null;
  delivery_unit: string | null;
  delivery_landmark: string | null;
  delivery_instructions: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  items: {
    id: number;
    product_variant_id: number | null;
    product_id: number | null;
    product_name: string;
    sku: string;
    colour: string;
    size: string;
    image_url: string | null;
    unit_price: Money;
    quantity: number;
    line_total: Money;
  }[];
  subtotal: Money;
  delivery_fee: Money;
  discount_amount: Money;
  coupon_code?: string | null;
  tax_amount: Money;
  grand_total: Money;
  currency: string;
  payment_method: string;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  amount_collected: Money;
  amount_refunded: Money;
  balance_due: Money;
  assigned_admin: AdminRef | null;
  cancellation_reason: string | null;
  delivery_failure_reason: string | null;
  confirmed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  payments: {
    id: number;
    type: 'COD_COLLECTION' | 'REFUND' | 'ADJUSTMENT';
    amount: Money;
    currency: string;
    method: string;
    collected_at: string;
    reference: string | null;
    notes: string | null;
    recorded_by: AdminRef | null;
    created_at: string;
  }[];
  history: {
    id: number;
    old_status: OrderStatus | null;
    new_status: OrderStatus;
    note: string | null;
    changed_by: AdminRef | null;
    created_at: string;
  }[];
  allowed_transitions: OrderStatus[];
  customer_order_count: number;
}

export interface DashboardData {
  date_from: string;
  date_to: string;
  orders_new: number;
  orders_awaiting_delivery: number;
  orders_out_for_delivery: number;
  orders_delivery_failed: number;
  orders_placed: number;
  orders_delivered: number;
  orders_cancelled: number;
  gross_order_value: Money;
  cancelled_order_value: Money;
  cash_collected: Money;
  refunds_paid: Money;
  net_cash: Money;
  cod_outstanding: Money;
  cod_outstanding_orders: number;
  low_stock_count: number;
  low_stock: {
    variant_id: number;
    product_id: number;
    product_name: string;
    sku: string;
    colour: string;
    size: string;
    available_quantity: number;
  }[];
  supplier_outstanding: { currency: string; amount: Money }[];
}

export interface SalesReportRow {
  day: string;
  orders_placed: number;
  gross_order_value: Money;
  orders_cancelled: number;
  cancelled_order_value: Money;
  orders_delivered: number;
  delivered_order_value: Money;
  orders_failed: number;
  cash_collected: Money;
  refunds_paid: Money;
}

export interface SalesReport {
  date_from: string;
  date_to: string;
  rows: SalesReportRow[];
  totals: SalesReportRow;
  by_status: { status: OrderStatus; count: number; value: Money }[];
}

@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  admins(): Observable<AdminRef[]> {
    return this.http.get<AdminRef[]>(`${this.base}/admins`);
  }

  list(filters: OrderFilters): Observable<OrderListPage> {
    let params = new HttpParams();
    if (filters.q) params = params.set('q', filters.q);
    for (const s of filters.status ?? []) params = params.append('status', s);
    if (filters.payment_status) params = params.set('payment_status', filters.payment_status);
    if (filters.assigned_admin_id) params = params.set('assigned_admin_id', filters.assigned_admin_id);
    if (filters.date_from) params = params.set('date_from', filters.date_from);
    if (filters.date_to) params = params.set('date_to', filters.date_to);
    if (filters.page && filters.page > 1) params = params.set('page', filters.page);
    return this.http.get<OrderListPage>(`${this.base}/orders`, { params });
  }

  get(id: number): Observable<AdminOrderDetail> {
    return this.http.get<AdminOrderDetail>(`${this.base}/orders/${id}`);
  }

  confirm(id: number, note?: string): Observable<AdminOrderDetail> {
    return this.http.post<AdminOrderDetail>(`${this.base}/orders/${id}/confirm`, { note: note || null });
  }

  changeStatus(
    id: number,
    body: { status: OrderStatus; note?: string | null; reason?: string | null; collect_cash?: boolean },
  ): Observable<AdminOrderDetail> {
    return this.http.patch<AdminOrderDetail>(`${this.base}/orders/${id}/status`, body);
  }

  cancel(id: number, reason: string): Observable<AdminOrderDetail> {
    return this.http.post<AdminOrderDetail>(`${this.base}/orders/${id}/cancel`, { reason });
  }

  assign(id: number, adminId: number | null): Observable<AdminOrderDetail> {
    return this.http.post<AdminOrderDetail>(`${this.base}/orders/${id}/assign`, { admin_id: adminId });
  }

  updateNotes(id: number, internalNotes: string): Observable<AdminOrderDetail> {
    return this.http.patch<AdminOrderDetail>(`${this.base}/orders/${id}/notes`, {
      internal_notes: internalNotes || null,
    });
  }

  addPayment(
    id: number,
    body: { type: 'COD_COLLECTION' | 'REFUND'; amount: string; reference?: string | null; notes?: string | null },
  ): Observable<AdminOrderDetail> {
    return this.http.post<AdminOrderDetail>(`${this.base}/orders/${id}/payments`, body);
  }

  dashboard(dateFrom?: string, dateTo?: string): Observable<DashboardData> {
    let params = new HttpParams();
    if (dateFrom) params = params.set('date_from', dateFrom);
    if (dateTo) params = params.set('date_to', dateTo);
    return this.http.get<DashboardData>(`${this.base}/dashboard`, { params });
  }

  salesReport(dateFrom: string, dateTo: string): Observable<SalesReport> {
    const params = new HttpParams().set('date_from', dateFrom).set('date_to', dateTo);
    return this.http.get<SalesReport>(`${this.base}/reports/sales`, { params });
  }
}

/** YYYY-MM-DD for "today" in Qatar (UTC+3, no DST). */
export function qatarToday(offsetDays = 0): string {
  const now = new Date(Date.now() + 3 * 3600_000 + offsetDays * 86400_000);
  return now.toISOString().slice(0, 10);
}
