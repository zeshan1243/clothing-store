import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TranslationKey } from '../../core/i18n/en';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AppliedCoupon, CouponError } from '../../core/orders.service';
import { QarPipe } from '../../core/qar.pipe';
import { Icon } from '../icon/icon';

/** "Have a coupon code?" field used in the cart and checkout summaries. */
@Component({
  selector: 'app-coupon-field',
  imports: [FormsModule, Icon, TranslatePipe, QarPipe],
  template: `
    @if (applied(); as c) {
      <div class="applied" role="status">
        <span class="applied__tag"><app-icon name="tags" [size]="16" /> <span class="ltr">{{ c.code }}</span></span>
        <span class="applied__text">
          @if (c.discount_type === 'FREE_DELIVERY') {
            {{ 'coupon.freeDelivery' | t }}
          } @else {
            {{ 'coupon.savings' | t: { amount: (c.savings | qar) } }}
          }
        </span>
        <button type="button" class="applied__remove" (click)="remove.emit()" [attr.aria-label]="'coupon.remove' | t">
          <app-icon name="x" [size]="16" />
        </button>
      </div>
    } @else if (!open() && !error()) {
      <button type="button" class="toggle" (click)="open.set(true)">
        <app-icon name="tags" [size]="16" /> {{ 'coupon.have' | t }}
      </button>
    } @else {
      <form class="form" (ngSubmit)="submit()">
        <label class="visually-hidden" [for]="inputId">{{ 'coupon.label' | t }}</label>
        <input [id]="inputId" name="coupon" [(ngModel)]="code" [placeholder]="'coupon.placeholder' | t"
          autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr"
          [attr.aria-invalid]="!!error()" [attr.aria-describedby]="error() ? inputId + '-err' : null" />
        <button type="submit" class="btn btn--secondary" [disabled]="busy() || !code.trim()">
          {{ (busy() ? 'coupon.applying' : 'coupon.apply') | t }}
        </button>
      </form>
      @if (errorText(); as e) {
        <p class="field-error" [id]="inputId + '-err'" role="alert">{{ e }}</p>
      }
    }
  `,
  styles: `
    :host { display: block; margin: var(--space-3) 0; }
    .toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0; border: 0; background: none;
      color: var(--text); font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
    .form { display: flex; gap: var(--space-2); }
    .form input { flex: 1; min-width: 0; min-height: 44px; padding: 0 var(--space-3); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); background: var(--field); color: var(--text); font: inherit; font-size: 16px;
      text-transform: uppercase; letter-spacing: 0.04em; }
    .form input::placeholder { text-transform: none; letter-spacing: 0; }
    .form input:focus { outline: none; border-color: var(--strong); box-shadow: 0 0 0 3px rgba(212, 255, 58, 0.55); }
    .form input[aria-invalid='true'] { border-color: var(--danger); }
    .form .btn { min-height: 44px; padding-inline: var(--space-4); }
    .field-error { margin-top: 6px; }
    .applied { display: flex; align-items: center; gap: var(--space-2); padding: 6px 6px 6px var(--space-3);
      border-radius: var(--radius-sm); background: var(--volt-400); color: var(--on-volt); animation: pop 260ms var(--ease-out); }
    .applied__tag { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; letter-spacing: 0.04em; }
    .applied__text { flex: 1; font-size: 14px; }
    .applied__remove { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%;
      background: rgba(11, 11, 12, 0.08); color: inherit; cursor: pointer; }
    @keyframes pop { from { transform: scale(0.96); opacity: 0; } }
  `,
})
export class CouponField {
  private static counter = 0;
  protected readonly inputId = `coupon-${++CouponField.counter}`;
  private readonly i18n = inject(I18nService);

  readonly applied = input<AppliedCoupon | null>(null);
  readonly error = input<CouponError | null>(null);
  readonly busy = input(false);
  readonly apply = output<string>();
  readonly remove = output<void>();

  protected readonly open = signal(false);
  protected code = '';

  /** Formatted QAR amount for the min-subtotal message (QarPipe can't be used inside computed()). */
  private readonly qar = new QarPipe();

  protected readonly errorText = computed(() => {
    const err = this.error();
    if (!err) return null;
    this.i18n.lang();
    const amount = err.min_subtotal ? this.qar.transform(err.min_subtotal) : '';
    return translate(`coupon.error.${err.code}` as TranslationKey, { amount });
  });

  protected submit(): void {
    const code = this.code.trim().toUpperCase();
    if (code) this.apply.emit(code);
  }
}
