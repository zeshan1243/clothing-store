import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-outlet',
  imports: [RouterLink, Icon, TranslatePipe],
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class.toast--error]="t.tone === 'error'">
          @if (t.tone === 'success') {
            <span class="toast__icon"><app-icon name="check" [size]="16" /></span>
          }
          <span class="toast__msg">{{ t.message }}</span>
          @if (t.action; as a) {
            <a class="toast__action" [routerLink]="a.link" (click)="toasts.dismiss(t.id)">{{ a.label }}</a>
          }
          <button type="button" class="toast__close" (click)="toasts.dismiss(t.id)" [attr.aria-label]="'common.dismiss' | t">
            <app-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed; z-index: 200; left: 50%; bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
      transform: translateX(-50%); display: flex; flex-direction: column; gap: var(--space-2);
      width: min(440px, calc(100vw - 2 * var(--space-4))); pointer-events: none;
    }
    @media (min-width: 1024px) { .toasts { left: auto; inset-inline-end: var(--space-6); top: calc(var(--header-h) + var(--space-6)); bottom: auto; transform: none; } }
    .toast {
      pointer-events: auto; display: flex; align-items: center; gap: var(--space-3);
      padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
      background: var(--dark-block); color: var(--bone-100); border-radius: var(--radius-sm);
      box-shadow: var(--shadow-float); animation: toastIn var(--dur-base) var(--ease-out);
    }
    .toast--error { background: #a3191e; }
    .toast__icon { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--volt-400); color: var(--on-volt); }
    .toast__msg { flex: 1; font-size: 14px; }
    .toast__action { color: var(--volt-400); font-weight: 700; font-size: 14px; white-space: nowrap; }
    .toast__close { display: grid; place-items: center; width: 32px; height: 32px; border: 0; background: none; color: var(--ink-400); cursor: pointer; }
    @keyframes toastIn { from { opacity: 0; transform: translateY(12px); } }
  `,
})
export class ToastOutlet {
  protected readonly toasts = inject(ToastService);
}
