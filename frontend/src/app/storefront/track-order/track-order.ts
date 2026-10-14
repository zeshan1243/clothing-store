import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../../core/api-error';
import { TranslationKey } from '../../core/i18n/en';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalDatePipe, LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { OrderConfirmation, OrderStatus, OrdersService } from '../../core/orders.service';
import { QarPipe } from '../../core/qar.pipe';
import { SeoService } from '../../core/seo.service';
import { qatarMobile } from '../../core/validators';
import { Icon, IconName } from '../../shared/icon/icon';

/** The normal journey of an order, shown as a progress tracker. */
const STEPS: { status: OrderStatus; icon: IconName }[] = [
  { status: 'PLACED', icon: 'receipt' },
  { status: 'CONFIRMED', icon: 'phone' },
  { status: 'PREPARING', icon: 'package' },
  { status: 'OUT_FOR_DELIVERY', icon: 'truck' },
  { status: 'DELIVERED', icon: 'circle-check' },
];
const ORDER_NUMBER = /^\s*(ORD-?)?\d{4}-\d{1,8}\s*$/i;

/**
 * Customer order tracking.
 * /track          → form: order number + mobile (order numbers are sequential, so both are required).
 * /track/:token   → status page for one order (the token is unguessable, so the link can be bookmarked).
 */
@Component({
  selector: 'app-track-order',
  imports: [ReactiveFormsModule, RouterLink, QarPipe, Icon, TranslatePipe, LocalizePipe, LocalDatePipe],
  templateUrl: './track-order.html',
  styleUrl: './track-order.scss',
})
export class TrackOrder {
  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);
  private readonly seo = inject(SeoService);

  readonly token = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    order_number: [
      inject(ActivatedRoute).snapshot.queryParamMap.get('order') ?? '',
      [Validators.required, Validators.pattern(ORDER_NUMBER)],
    ],
    phone: ['', [Validators.required, qatarMobile]],
  });
  protected readonly searching = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly order = signal<OrderConfirmation | null>(null);
  protected readonly state = signal<'form' | 'loading' | 'ready' | 'not-found' | 'error'>('form');

  protected readonly steps = computed(() => {
    const o = this.order();
    if (!o) return [];
    // When each status was (last) reached.
    const reachedAt = new Map(o.timeline.map((s) => [s.status, s.at]));
    const current = STEPS.findIndex((s) => s.status === o.order_status);
    // Off-track states (cancelled, missed delivery…) show progress up to the furthest step reached.
    const furthest = current >= 0 ? current : Math.max(0, ...STEPS.map((s, i) => (reachedAt.has(s.status) ? i : 0)));
    return STEPS.map((s, i) => ({
      ...s,
      label: `track.status.${s.status}` as TranslationKey,
      at: i <= furthest ? (reachedAt.get(s.status) ?? null) : null,
      done: i < furthest || (i === furthest && o.order_status === 'DELIVERED'),
      current: i === furthest && o.order_status !== 'DELIVERED',
    }));
  });

  protected readonly offTrack = computed(() => {
    const s = this.order()?.order_status;
    return s === 'CANCELLED' || s === 'DELIVERY_FAILED' || s === 'RETURN_REQUESTED';
  });

  protected readonly whatsappLink = computed(() => {
    this.i18n.lang();
    const o = this.order();
    const text = o ? translate('track.whatsappText', { ref: o.order_number }) : translate('track.help');
    return `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(text)}`;
  });

  constructor() {
    effect(() => {
      const token = this.token();
      if (!token) {
        this.order.set(null);
        this.state.set('form');
        this.seo.set(translate('track.title'));
        this.seo.setRobots(false);
        return;
      }
      if (this.order()?.public_token === token) return; // just looked up
      this.state.set('loading');
      this.orders.order(token).subscribe({
        next: (o) => this.show(o),
        error: (err: unknown) => {
          const notFound = err instanceof HttpErrorResponse && (err.status === 404 || err.status === 422);
          this.state.set(notFound ? 'not-found' : 'error');
        },
      });
    });
  }

  protected statusKey(prefix: 'track.status.' | 'track.desc.' | 'track.pay.', value: string): TranslationKey {
    return `${prefix}${value}` as TranslationKey;
  }

  protected invalid(name: 'order_number' | 'phone'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected submit(): void {
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { order_number, phone } = this.form.getRawValue();
    this.searching.set(true);
    this.orders.track(order_number.trim(), phone.trim()).subscribe({
      next: (o) => {
        this.searching.set(false);
        this.show(o);
        this.router.navigate(['/track', o.public_token]);
      },
      error: (err: unknown) => {
        this.searching.set(false);
        const notFound = err instanceof HttpErrorResponse && err.status === 404;
        this.formError.set(notFound ? translate('track.notFound') : apiErrorMessage(err));
      },
    });
  }

  private show(o: OrderConfirmation): void {
    this.order.set(o);
    this.state.set('ready');
    this.seo.set(translate('oc.title', { ref: o.order_number }));
    this.seo.setRobots(false);
  }
}
