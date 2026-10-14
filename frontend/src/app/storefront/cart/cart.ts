import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { CartItem, CartService, MAX_QUANTITY_PER_LINE } from '../../core/cart.service';
import { CatalogService } from '../../core/catalog.service';
import { CouponError, OrdersService, Quote } from '../../core/orders.service';
import { CouponField } from '../../shared/coupon-field/coupon-field';
import { QarPipe } from '../../core/qar.pipe';
import { TranslationKey } from '../../core/i18n/en';
import { I18nService, Params, translate } from '../../core/i18n/i18n.service';
import { LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { Icon } from '../../shared/icon/icon';

/** Full cart page (design.md §7.5). Revalidates prices and stock against the API on load. */
@Component({
  selector: 'app-cart',
  imports: [RouterLink, QarPipe, Icon, TranslatePipe, LocalizePipe, CouponField],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
})
export class Cart implements OnInit {
  protected readonly cart = inject(CartService);
  private readonly catalog = inject(CatalogService);

  /** Variant IDs that are no longer sold or are out of stock. */
  protected readonly unavailable = signal<Set<number>>(new Set());
  /** Notes about changes made during revalidation (kept as keys so they follow the language). */
  protected readonly notices = signal<{ key: TranslationKey; params: Params }[]>([]);
  private readonly i18n = inject(I18nService);
  private readonly orders = inject(OrdersService);

  /** Server quote, fetched while a coupon is applied (the server prices the discount). */
  protected readonly quote = signal<Quote | null>(null);
  protected readonly couponBusy = signal(false);
  protected readonly couponError = signal<CouponError | null>(null);
  protected readonly hasProblems = computed(() => this.cart.items().some((i) => this.unavailable().has(i.variantId)));
  protected readonly freeProgress = computed(() => {
    const threshold = this.cart.freeDeliveryThreshold;
    return threshold ? Math.min(100, (this.cart.subtotal() / threshold) * 100) : 0;
  });

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      this.i18n.lang();
      seo.set(translate('cart.title'));
    });

    // Re-price on the server whenever the items, coupon or remembered delivery area change.
    effect(() => {
      const code = this.cart.couponCode();
      const area = this.cart.deliveryArea();
      const items = this.cart.items().map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
      if ((!code && !area) || !items.length) {
        this.quote.set(null);
        return;
      }
      this.couponBusy.set(!!code);
      this.orders.quote(items, code, area).subscribe({
        next: (q) => {
          this.couponBusy.set(false);
          if (q.coupon_error) {
            this.couponError.set(q.coupon_error);
            this.cart.setCoupon(null);
          } else {
            this.couponError.set(null);
            this.quote.set(q);
          }
        },
        error: () => this.couponBusy.set(false),
      });
    });
  }

  protected applyCoupon(code: string): void {
    this.couponError.set(null);
    this.cart.setCoupon(code);
  }

  protected removeCoupon(): void {
    this.couponError.set(null);
    this.cart.setCoupon(null);
  }

  protected itemName(item: CartItem): string {
    return (this.i18n.isArabic() && item.productName_ar) || item.productName;
  }

  ngOnInit(): void {
    this.revalidate();
  }

  protected maxFor(item: CartItem): number {
    return Math.min(item.maxQuantity, MAX_QUANTITY_PER_LINE);
  }

  protected lineTotal(item: CartItem): number {
    return (Math.round(Number(item.unitPrice) * 100) * item.quantity) / 100;
  }

  /** Refresh prices and stock so the cart reflects what checkout will accept. */
  private revalidate(): void {
    const slugs = [...new Set(this.cart.items().map((i) => i.productSlug))];
    if (!slugs.length) return;

    forkJoin(slugs.map((slug) => this.catalog.product(slug).pipe(catchError(() => of(null))))).subscribe((products) => {
      const unavailable = new Set<number>();
      const notices: { key: TranslationKey; params: Params }[] = [];
      for (const item of this.cart.items()) {
        const product = products.find((p) => p?.slug === item.productSlug);
        const variant = product?.variants.find((v) => v.id === item.variantId);
        const label = `${this.itemName(item)} (${item.colour}, ${item.size})`;
        if (!product || !variant || variant.available_quantity === 0) {
          unavailable.add(item.variantId);
          notices.push({ key: 'cart.soldOutNotice', params: { label } });
          continue;
        }
        if (item.quantity > Math.min(variant.available_quantity, MAX_QUANTITY_PER_LINE)) {
          notices.push({ key: 'cart.limitedNotice', params: { label, n: variant.available_quantity } });
        }
        if (product.price !== item.unitPrice) {
          notices.push({ key: 'cart.priceNotice', params: { name: this.itemName(item), price: Number(product.price).toFixed(2) } });
        }
        this.cart.refresh(item.variantId, product.price, variant.available_quantity);
      }
      this.unavailable.set(unavailable);
      this.notices.set(notices);
    });
  }
}
