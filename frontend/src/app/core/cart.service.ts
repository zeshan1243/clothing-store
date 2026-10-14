import { Injectable, computed, effect, signal } from '@angular/core';

import { environment } from '../../environments/environment';

export interface CartItem {
  variantId: number;
  productSlug: string;
  productName: string;
  productName_ar?: string | null;
  sku: string;
  colour: string;
  size: string;
  imageUrl: string | null;
  /** Price shown when added; the server re-prices every line at checkout. */
  unitPrice: string;
  quantity: number;
  /** Stock available when last seen, used to cap the quantity selector. */
  maxQuantity: number;
}

const STORAGE_KEY = 'cart_v1';
const COUPON_KEY = 'cart_coupon';
const AREA_KEY = 'delivery_area';
export const MAX_QUANTITY_PER_LINE = 10;

/**
 * Guest cart kept in localStorage. Prices and stock here are a convenience for display only:
 * the backend revalidates everything when the order is placed.
 */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly itemsSignal = signal<CartItem[]>(readStoredCart());

  readonly items = this.itemsSignal.asReadonly();
  readonly count = computed(() => this.itemsSignal().reduce((sum, item) => sum + item.quantity, 0));
  /** Subtotal in fils (1/100 QAR) to avoid floating-point drift, exposed as a number of QAR. */
  readonly subtotal = computed(
    () => this.itemsSignal().reduce((sum, item) => sum + toFils(item.unitPrice) * item.quantity, 0) / 100,
  );
  readonly freeDeliveryThreshold = environment.freeDeliveryThreshold;
  /** Delivery depends on the area (priced by the server at quote/checkout), so local totals exclude it. */
  readonly deliveryFee = computed(() => 0);
  /** QAR still needed for free delivery, or null when no threshold is configured. */
  readonly freeDeliveryRemaining = computed(() => {
    const threshold = environment.freeDeliveryThreshold;
    return threshold === null ? null : Math.max(0, Math.round((threshold - this.subtotal()) * 100) / 100);
  });
  /** Mini-cart drawer visibility (opened after add-to-cart). */
  readonly drawerOpen = signal(false);

  /** Coupon code the shopper entered (validated and priced by the server at quote/checkout). */
  readonly couponCode = signal<string | null>(readStored(COUPON_KEY));

  /** Delivery area the shopper last picked (by name), so the cart can show its fee too. */
  readonly deliveryArea = signal<string | null>(readStored(AREA_KEY));

  setDeliveryArea(name: string | null): void {
    this.deliveryArea.set(name || null);
    try {
      if (name) localStorage.setItem(AREA_KEY, name);
      else localStorage.removeItem(AREA_KEY);
    } catch {
      // ignore
    }
  }

  setCoupon(code: string | null): void {
    this.couponCode.set(code ? code.trim().toUpperCase() : null);
    try {
      if (code) localStorage.setItem(COUPON_KEY, this.couponCode()!);
      else localStorage.removeItem(COUPON_KEY);
    } catch {
      // ignore
    }
  }
  readonly total = computed(() => (Math.round(this.subtotal() * 100) + Math.round(this.deliveryFee() * 100)) / 100);

  constructor() {
    effect(() => {
      const items = this.itemsSignal();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch {
        // Storage unavailable: the cart lives for this page session only.
      }
    });
  }

  /** Adds to an existing line for the same variant; returns the quantity actually in the cart. */
  add(item: CartItem): number {
    const cap = maxFor(item.maxQuantity);
    let finalQuantity = 0;
    this.itemsSignal.update((items) => {
      const existing = items.find((i) => i.variantId === item.variantId);
      if (existing) {
        finalQuantity = Math.min(existing.quantity + item.quantity, cap);
        return items.map((i) =>
          i.variantId === item.variantId
            ? { ...i, quantity: finalQuantity, unitPrice: item.unitPrice, maxQuantity: item.maxQuantity }
            : i,
        );
      }
      finalQuantity = Math.min(item.quantity, cap);
      return [...items, { ...item, quantity: finalQuantity }];
    });
    return finalQuantity;
  }

  setQuantity(variantId: number, quantity: number): void {
    if (quantity <= 0) {
      this.remove(variantId);
      return;
    }
    this.itemsSignal.update((items) =>
      items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(quantity, maxFor(i.maxQuantity)) } : i)),
    );
  }

  /** Updates a line with the latest price and stock from the API, capping the quantity. */
  refresh(variantId: number, unitPrice: string, available: number): void {
    this.itemsSignal.update((items) =>
      items.map((i) =>
        i.variantId === variantId
          ? { ...i, unitPrice, maxQuantity: available, quantity: Math.max(1, Math.min(i.quantity, maxFor(available))) }
          : i,
      ),
    );
  }

  remove(variantId: number): void {
    this.itemsSignal.update((items) => items.filter((i) => i.variantId !== variantId));
  }

  clear(): void {
    this.itemsSignal.set([]);
    this.setCoupon(null);
  }
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function maxFor(available: number): number {
  return Math.max(0, Math.min(available, MAX_QUANTITY_PER_LINE));
}

function toFils(price: string): number {
  return Math.round(Number(price) * 100);
}

function readStoredCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((i) => typeof i?.variantId === 'number') : [];
  } catch {
    return [];
  }
}
