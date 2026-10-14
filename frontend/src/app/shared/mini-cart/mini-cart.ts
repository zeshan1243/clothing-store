import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CartService, MAX_QUANTITY_PER_LINE } from '../../core/cart.service';
import { LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { QarPipe } from '../../core/qar.pipe';
import { Icon } from '../icon/icon';
import { Sheet } from '../sheet/sheet';

/** Slide-in cart (design.md §6.8 / §7.5): right drawer on desktop, bottom sheet on mobile. */
@Component({
  selector: 'app-mini-cart',
  imports: [RouterLink, QarPipe, Icon, Sheet, TranslatePipe, LocalizePipe],
  template: `
    <app-sheet [heading]="'mini.title' | t: { n: cart.count() }" [open]="cart.drawerOpen()" side="right" (closed)="cart.drawerOpen.set(false)">
      @if (!cart.items().length) {
        <div class="empty">
          <p>{{ 'cart.empty' | t }}</p>
          <a routerLink="/shop" class="btn" (click)="cart.drawerOpen.set(false)">{{ 'cart.shopNew' | t }}</a>
        </div>
      } @else {
        @if (cart.freeDeliveryRemaining() !== null) {
          <div class="free">
            @if (cart.freeDeliveryRemaining()! > 0) {
              <p>{{ 'cart.freeLeft' | t: { amount: (cart.freeDeliveryRemaining() | qar) } }}</p>
            } @else {
              <p><strong>{{ 'cart.freeUnlocked' | t }}</strong></p>
            }
            <div class="free__bar"><span [style.width.%]="freeProgress()"></span></div>
          </div>
        }
        <ul class="lines">
          @for (item of cart.items(); track item.variantId) {
            <li class="line">
              @if (item.imageUrl) {
                <img [src]="item.imageUrl" [alt]="item | loc: 'productName'" width="72" height="90" />
              }
              <div class="line__body">
                <a [routerLink]="['/products', item.productSlug]" (click)="cart.drawerOpen.set(false)" class="line__name">{{ item | loc: 'productName' }}</a>
                <span class="muted small">{{ item.colour }} · {{ item.size }}</span>
                <div class="line__row">
                  <div class="stepper" role="group" [attr.aria-label]="'cart.quantityFor' | t: { name: (item | loc: 'productName') }">
                    <button type="button" (click)="cart.setQuantity(item.variantId, item.quantity - 1)" [attr.aria-label]="'common.decrease' | t"><app-icon name="minus" [size]="16" /></button>
                    <output>{{ item.quantity }}</output>
                    <button type="button" [disabled]="item.quantity >= max(item.maxQuantity)" (click)="cart.setQuantity(item.variantId, item.quantity + 1)" [attr.aria-label]="'common.increase' | t"><app-icon name="plus" [size]="16" /></button>
                  </div>
                  <span class="price">{{ +item.unitPrice * item.quantity | qar }}</span>
                </div>
              </div>
            </li>
          }
        </ul>
      }
      @if (cart.items().length) {
        <footer sheet-footer class="foot">
          <div class="foot__row"><span>{{ 'common.subtotal' | t }}</span><span class="price">{{ cart.subtotal() | qar }}</span></div>
          <a routerLink="/checkout" class="btn btn--lg btn--block" (click)="cart.drawerOpen.set(false)">{{ 'common.checkout' | t }}</a>
          <a routerLink="/cart" class="btn btn--ghost btn--block" (click)="cart.drawerOpen.set(false)">{{ 'common.viewCart' | t }}</a>
          <p class="muted small center">{{ 'cart.payNote' | t }}</p>
        </footer>
      }
    </app-sheet>
  `,
  styles: `
    .empty { padding: var(--space-8) 0; text-align: center; }
    .small { font-size: 13px; }
    .center { text-align: center; margin: var(--space-2) 0 0; }
    .free { padding: var(--space-3) var(--space-4); background: var(--dark-block); color: var(--bone-100); border-radius: var(--radius-sm); margin-bottom: var(--space-4); }
    .free p { margin: 0 0 var(--space-2); font-size: 14px; }
    .free__bar { height: 6px; background: var(--ink-800); border-radius: 999px; overflow: hidden; }
    .free__bar span { display: block; height: 100%; background: var(--volt-400); border-radius: inherit; transition: width var(--dur-slow) var(--ease-out); }
    .lines { list-style: none; margin: 0; padding: 0; }
    .line { display: grid; grid-template-columns: 72px 1fr; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--border); }
    .line img { width: 72px; height: 90px; object-fit: cover; border-radius: var(--radius-sm); background: var(--surface); }
    .line__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .line__name { font-weight: 600; text-decoration: none; }
    .line__row { display: flex; justify-content: space-between; align-items: center; margin-top: auto; }
    .stepper { display: inline-flex; align-items: center; border: 1.5px solid var(--border); border-radius: var(--radius-sm); }
    .stepper button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; background: none; cursor: pointer; }
    .stepper button:disabled { opacity: 0.35; cursor: not-allowed; }
    .stepper output { min-width: 2ch; text-align: center; font-weight: 700; }
    .foot { padding: var(--space-4) var(--space-6) calc(var(--space-4) + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--bg); display: grid; gap: var(--space-2); }
    .foot__row { display: flex; justify-content: space-between; font-weight: 700; font-size: 17px; margin-bottom: var(--space-2); }
  `,
})
export class MiniCart {
  protected readonly cart = inject(CartService);
  protected readonly freeProgress = computed(() => {
    const threshold = this.cart.freeDeliveryThreshold;
    return threshold ? Math.min(100, (this.cart.subtotal() / threshold) * 100) : 0;
  });

  protected max(available: number): number {
    return Math.min(available, MAX_QUANTITY_PER_LINE);
  }
}
