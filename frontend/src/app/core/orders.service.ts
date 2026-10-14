import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Money } from './catalog.models';

export interface CartLineInput {
  variant_id: number;
  quantity: number;
}

export interface QuoteLine {
  variant_id: number;
  product_name: string;
  product_name_ar?: string | null;
  product_slug: string;
  sku: string;
  colour: string;
  size: string;
  image_url: string | null;
  unit_price: Money;
  requested_quantity: number;
  available_quantity: number;
  quantity: number;
  line_total: Money;
  problem: string | null;
  problem_code?: 'unavailable' | 'sold_out' | 'limited' | 'max_per_item' | null;
}

export type CouponErrorCode =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'min_subtotal'
  | 'usage_limit'
  | 'customer_limit';

export interface AppliedCoupon {
  code: string;
  discount_type: 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';
  value: Money;
  savings: Money;
}

export interface CouponError {
  code: CouponErrorCode;
  min_subtotal?: Money | null;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: Money;
  delivery_fee: Money;
  discount_amount: Money;
  grand_total: Money;
  currency: string;
  ok: boolean;
  coupon?: AppliedCoupon | null;
  coupon_error?: CouponError | null;
  /** The area the delivery fee is for; null until the customer picks one (fee not included yet). */
  delivery_area?: DeliveryArea | null;
}

/** A place customers can deliver to (GET /delivery-areas), with its fee. */
export interface DeliveryArea {
  id: number;
  name: string;
  name_ar?: string | null;
  distance_km: number;
  is_free: boolean;
  fee: Money;
}

export interface OrderInput {
  idempotency_key: string;
  customer: { full_name: string; phone: string; email: string | null };
  /** Signed-in customers: remember this delivery address on the profile. */
  save_address?: boolean;
  delivery: {
    area: string;
    zone: string | null;
    street: string | null;
    building: string | null;
    unit: string | null;
    landmark: string | null;
    instructions: string | null;
  };
  notes: string | null;
  items: CartLineInput[];
  coupon_code?: string | null;
}

export interface OrderConfirmation {
  order_number: string;
  public_token: string;
  created_at: string;
  customer_first_name: string;
  delivery_area: string;
  items: {
    product_name: string;
    product_name_ar?: string | null;
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
  grand_total: Money;
  currency: string;
  coupon_code?: string | null;
  payment_method: 'COD';
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  timeline: { status: OrderStatus; at: string }[];
}

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

/** 409 body when stock or availability changed between cart and checkout. */
export interface CheckoutConflict {
  message: string;
  problems?: { variant_id: number; problem: string; available_quantity: number }[];
  coupon_error?: CouponError;
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  quote(items: CartLineInput[], couponCode?: string | null, deliveryArea?: string | null): Observable<Quote> {
    return this.http.post<Quote>(`${this.base}/cart/quote`, {
      items,
      coupon_code: couponCode || null,
      delivery_area: deliveryArea || null,
    });
  }

  deliveryAreas(): Observable<DeliveryArea[]> {
    return this.http.get<DeliveryArea[]>(`${this.base}/delivery-areas`);
  }

  placeOrder(body: OrderInput): Observable<OrderConfirmation> {
    return this.http.post<OrderConfirmation>(`${this.base}/orders`, body);
  }

  /** Find an order by its number plus the phone used at checkout (order numbers alone are guessable). */
  track(orderNumber: string, phone: string): Observable<OrderConfirmation> {
    return this.http.post<OrderConfirmation>(`${this.base}/orders/track`, { order_number: orderNumber, phone });
  }

  order(token: string): Observable<OrderConfirmation> {
    return this.http.get<OrderConfirmation>(`${this.base}/orders/${encodeURIComponent(token)}`);
  }
}

/** URL-safe random key, generated once per checkout attempt. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
