import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../environments/environment';
import { Money } from '../core/catalog.models';

export type CouponType = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
export type CouponState = 'active' | 'scheduled' | 'expired' | 'used_up' | 'inactive';

export interface AdminCoupon {
  id: number;
  code: string;
  description: string | null;
  discount_type: CouponType;
  value: Money;
  min_subtotal: Money | null;
  max_discount: Money | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  times_used: number;
  is_active: boolean;
  created_at: string;
  state: CouponState;
  total_savings: Money;
}

export interface AdminCouponDetail extends AdminCoupon {
  redemptions: {
    order_id: number;
    order_number: string;
    customer_name: string;
    discount_amount: Money;
    created_at: string;
    voided: boolean;
  }[];
}

export interface CouponInput {
  code: string;
  description: string | null;
  discount_type: CouponType;
  value: string;
  min_subtotal: string | null;
  max_discount: string | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  is_active: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminCouponsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/coupons`;

  list(): Observable<AdminCoupon[]> {
    return this.http.get<AdminCoupon[]>(this.base);
  }

  get(id: number): Observable<AdminCouponDetail> {
    return this.http.get<AdminCouponDetail>(`${this.base}/${id}`);
  }

  create(body: CouponInput): Observable<AdminCoupon> {
    return this.http.post<AdminCoupon>(this.base, body);
  }

  update(id: number, body: CouponInput): Observable<AdminCoupon> {
    return this.http.patch<AdminCoupon>(`${this.base}/${id}`, body);
  }

  generateCode(): Observable<string> {
    return this.http.get<{ code: string }>(`${this.base}/generate-code`).pipe(map((r) => r.code));
  }
}
