import { Injectable } from '@angular/core';

import { ProductCard } from '../../core/catalog.models';

interface CachedListing {
  items: ProductCard[];
  total: number;
  page: number;
  at: number;
}

const TTL_MS = 5 * 60_000;

/**
 * Remembers the last listing (including "Load more" pages) so returning from a product page shows
 * the same items and the router can restore the scroll position (design.md §7.3).
 */
@Injectable({ providedIn: 'root' })
export class ShopCache {
  private last: { key: string; value: CachedListing } | null = null;

  get(key: string): CachedListing | null {
    if (!this.last || this.last.key !== key || Date.now() - this.last.value.at > TTL_MS) return null;
    return this.last.value;
  }

  set(key: string, value: Omit<CachedListing, 'at'>): void {
    this.last = { key, value: { ...value, at: Date.now() } };
  }
}
