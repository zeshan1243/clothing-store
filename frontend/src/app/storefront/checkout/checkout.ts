import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { qatarMobile } from '../../core/validators';
import { CartService } from '../../core/cart.service';
import { CheckoutConflict, CouponError, DeliveryArea, OrdersService, Quote, QuoteLine, newIdempotencyKey } from '../../core/orders.service';
import { CouponField } from '../../shared/coupon-field/coupon-field';
import { TranslationKey } from '../../core/i18n/en';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { QarPipe, formatQar } from '../../core/qar.pipe';
import { SeoService } from '../../core/seo.service';
import { Icon } from '../../shared/icon/icon';
import { Select, SelectOption } from '../../shared/select/select';


@Component({
  selector: 'app-checkout',
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, QarPipe, Icon, TranslatePipe, LocalizePipe, CouponField, Select],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
})
export class Checkout implements OnInit {
  protected readonly account = inject(CustomerAuthService);
  /** Signed in: remember this address on the profile (on by default when nothing is saved yet). */
  protected readonly saveAddress = signal(true);
  protected readonly cart = inject(CartService);
  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Delivery areas across Qatar, each with its fee (free zone first). */
  protected readonly areas = signal<DeliveryArea[]>([]);
  protected readonly freeAreas = computed(() => this.areas().filter((a) => a.is_free));
  protected readonly paidAreas = computed(() => this.areas().filter((a) => !a.is_free));
  /** Dropdown rows: free zone first, each with its fee on the right. */
  protected readonly areaOptions = computed<SelectOption<string>[]>(() => {
    const ar = this.i18n.isArabic();
    const free = translate('co.areaFreeGroup');
    const paid = translate('co.areaPaidGroup');
    return [
      ...this.freeAreas().map((a) => ({ value: a.name, label: (ar && a.name_ar) || a.name, group: free, hint: translate('common.free') })),
      ...this.paidAreas().map((a) => ({ value: a.name, label: (ar && a.name_ar) || a.name, group: paid, hint: formatQar(a.fee, ar) })),
    ];
  });
  protected readonly quote = signal<Quote | null>(null);
  protected readonly quoteError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly hasProblems = computed(() => this.quote()?.ok === false);
  protected readonly couponError = signal<CouponError | null>(null);
  protected readonly couponBusy = signal(false);

  /** One key per checkout visit: a double-tap or retry can never create two orders. */
  private readonly idempotencyKey = newIdempotencyKey();

  protected readonly form = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    phone: ['', [Validators.required, qatarMobile]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    area: [this.cart.deliveryArea() ?? '', [Validators.required, Validators.maxLength(120)]],
    zone: ['', Validators.maxLength(60)],
    street: ['', Validators.maxLength(120)],
    building: ['', Validators.maxLength(60)],
    unit: ['', Validators.maxLength(60)],
    landmark: ['', Validators.maxLength(255)],
    instructions: ['', Validators.maxLength(1000)],
    notes: ['', Validators.maxLength(1000)],
  });

  private readonly i18n = inject(I18nService);

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      this.i18n.lang();
      seo.set(translate('co.title'));
    });
  }

  /** Localised stock problem for a quote line (the API sends a code plus the available quantity). */
  protected problemText(line: QuoteLine): string {
    switch (line.problem_code) {
      case 'unavailable':
        return translate('problem.unavailable');
      case 'sold_out':
        return translate('problem.sold_out');
      case 'limited':
        return translate('problem.limited', { n: line.available_quantity });
      case 'max_per_item':
        return translate('problem.max_per_item', { n: line.quantity });
      default:
        return line.problem ?? '';
    }
  }

  ngOnInit(): void {
    this.prefillFromAccount();
    this.refreshQuote();
    this.orders.deliveryAreas().subscribe({
      next: (areas) => {
        this.areas.set(areas);
        // Forget a remembered area that no longer exists.
        const current = this.form.controls.area.value;
        if (current && !areas.some((a) => a.name === current)) this.form.controls.area.setValue('');
      },
    });
    // The fee depends on the area: remember it (the cart shows it too) and re-price.
    this.form.controls.area.valueChanges.subscribe((name) => {
      this.cart.setDeliveryArea(name || null);
      this.refreshQuote();
    });
  }

  /** Signed-in customers: fill contact and saved address; the phone is the account's own. */
  private prefillFromAccount(): void {
    const c = this.account.customer();
    if (!c) return;
    const f = this.form.controls;
    if (!f.full_name.value) f.full_name.setValue(c.full_name);
    if (!f.email.value && c.email) f.email.setValue(c.email);
    f.phone.setValue(c.phone.replace(/^\+974/, ''));
    f.phone.disable();
    const a = c.default_address;
    if (a) {
      this.saveAddress.set(false);
      for (const key of ['zone', 'street', 'building', 'unit', 'landmark', 'instructions'] as const) {
        if (!f[key].value && a[key]) f[key].setValue(a[key]!);
      }
      if (a.area && !f.area.value) {
        f.area.setValue(a.area);
        this.cart.setDeliveryArea(a.area);
      }
    }
  }

  protected signOut(): void {
    this.account.clear();
    this.form.controls.phone.enable();
    this.form.controls.phone.setValue('');
  }

  protected focusArea(event: Event): void {
    event.preventDefault();
    const el = document.getElementById('area');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected applyCoupon(code: string): void {
    this.couponError.set(null);
    this.cart.setCoupon(code);
    this.refreshQuote();
  }

  protected removeCoupon(): void {
    this.couponError.set(null);
    this.cart.setCoupon(null);
    this.refreshQuote();
  }

  protected refreshQuote(): void {
    const items = this.cart.items().map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
    if (!items.length) return;
    this.quoteError.set(null);
    this.couponBusy.set(!!this.cart.couponCode());
    this.orders.quote(items, this.cart.couponCode(), this.form.controls.area.value || null).subscribe({
      next: (quote) => {
        this.couponBusy.set(false);
        if (quote.coupon_error) {
          // Explain why, drop the code, and show totals without it.
          this.couponError.set(quote.coupon_error);
          this.cart.setCoupon(null);
        }
        this.quote.set(quote);
        // Keep the local cart in step with server prices and stock.
        for (const line of quote.lines) {
          if (line.available_quantity > 0) this.cart.refresh(line.variant_id, line.unit_price, line.available_quantity);
        }
      },
      error: (err: unknown) => {
        this.couponBusy.set(false);
        this.quoteError.set(apiErrorMessage(err, translate('co.summaryError')));
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.submitError.set(translate('co.fixFields'));
      focusFirstInvalid();
      return;
    }
    if (!this.quote()?.ok) return;

    const v = this.form.getRawValue();
    const opt = (value: string) => value.trim() || null;
    this.submitting.set(true);
    this.submitError.set(null);

    this.orders
      .placeOrder({
        idempotency_key: this.idempotencyKey,
        customer: { full_name: v.full_name.trim(), phone: v.phone.trim(), email: opt(v.email) },
        delivery: {
          area: v.area.trim(),
          zone: opt(v.zone),
          street: opt(v.street),
          building: opt(v.building),
          unit: opt(v.unit),
          landmark: opt(v.landmark),
          instructions: opt(v.instructions),
        },
        notes: opt(v.notes),
        save_address: this.account.signedIn() && this.saveAddress(),
        items: this.cart.items().map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
        coupon_code: this.cart.couponCode(),
      })
      .subscribe({
        next: (order) => {
          this.cart.clear();
          if (this.account.signedIn()) this.account.refresh();
          void this.router.navigate(['/order', order.public_token], { replaceUrl: true });
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          if (err instanceof HttpErrorResponse && err.status === 409) {
            const conflict = err.error?.detail as CheckoutConflict | undefined;
            if (conflict?.coupon_error) {
              // e.g. per-customer limit (only known once the phone number is entered) or used up meanwhile.
              this.couponError.set(conflict.coupon_error);
              this.cart.setCoupon(null);
              this.submitError.set(translate(`coupon.error.${conflict.coupon_error.code}` as TranslationKey, { amount: '' }));
            } else {
              this.submitError.set(translate('co.changedError'));
            }
            this.refreshQuote();
            return;
          }
          this.submitError.set(apiErrorMessage(err, translate('co.failed')));
        },
      });
  }
}

function focusFirstInvalid(): void {
  setTimeout(() => document.querySelector<HTMLElement>('.checkout-form [aria-invalid="true"]')?.focus());
}
