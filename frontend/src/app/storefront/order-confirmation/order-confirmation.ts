import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OrderConfirmation as OrderConfirmationModel, OrdersService } from '../../core/orders.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { QarPipe } from '../../core/qar.pipe';
import { environment } from '../../../environments/environment';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalDatePipe, LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-order-confirmation',
  imports: [RouterLink, QarPipe, Icon, TranslatePipe, LocalizePipe, LocalDatePipe],
  templateUrl: './order-confirmation.html',
  styleUrl: './order-confirmation.scss',
})
export class OrderConfirmation {
  private readonly orders = inject(OrdersService);
  protected readonly account = inject(CustomerAuthService);

  /** Route param :token (unguessable public reference). */
  readonly token = input.required<string>();

  protected readonly order = signal<OrderConfirmationModel | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly copied = signal(false);
  private readonly i18n = inject(I18nService);
  protected readonly whatsappLink = computed(() => {
    const o = this.order();
    if (!o) return '';
    this.i18n.lang();
    const text = translate('oc.whatsappText', { ref: o.order_number });
    return `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(text)}`;
  });

  protected async copyReference(): Promise<void> {
    const o = this.order();
    if (!o) return;
    try {
      await navigator.clipboard.writeText(o.order_number);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Clipboard unavailable: the reference is still visible to note down.
    }
  }

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      const token = this.token();
      this.state.set('loading');
      this.orders.order(token).subscribe({
        next: (order) => {
          this.order.set(order);
          this.state.set('ready');
          seo.set(translate('oc.title', { ref: order.order_number }));
          seo.setRobots(false);
        },
        error: (err: unknown) => {
          const notFound = err instanceof HttpErrorResponse && (err.status === 404 || err.status === 422);
          this.state.set(notFound ? 'not-found' : 'error');
          seo.set(translate('oc.notFound'));
          seo.setRobots(false);
        },
      });
    });
  }
}
