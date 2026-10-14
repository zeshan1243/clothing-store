import { Component, inject } from '@angular/core';

import { Icon, IconName } from '../../shared/icon/icon';
import { AdminToastService, ToastTone } from './admin-toast.service';

const ICONS: Record<ToastTone, IconName> = { success: 'circle-check', error: 'alert', info: 'info' };
const TITLES: Record<ToastTone, string> = { success: 'Saved', error: "Couldn't save", info: 'Note' };

/** Toast stack in the top-right corner of the admin portal. */
@Component({
  selector: 'app-admin-toasts',
  imports: [Icon],
  template: `
    <section class="stack" aria-label="Notifications">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast toast--{{ t.tone }}" [attr.role]="t.tone === 'error' ? 'alert' : 'status'"
          (mouseenter)="toasts.hold(t.id)" (mouseleave)="toasts.release(t.id)" (focusin)="toasts.hold(t.id)" (focusout)="toasts.release(t.id)">
          <span class="toast__icon"><app-icon [name]="icons[t.tone]" [size]="20" /></span>
          <div class="toast__body">
            <p class="toast__title">{{ titles[t.tone] }}</p>
            <p class="toast__msg">{{ t.message }}</p>
          </div>
          <button type="button" class="toast__close" (click)="toasts.dismiss(t.id)" aria-label="Dismiss notification">
            <app-icon name="x" [size]="16" />
          </button>
          <span class="toast__bar" [style.animation-duration.ms]="t.duration"></span>
        </div>
      }
    </section>
  `,
  styles: `
    .stack {
      position: fixed; z-index: 300; top: var(--space-4); right: var(--space-4);
      display: flex; flex-direction: column; gap: var(--space-2);
      width: min(380px, calc(100vw - 2 * var(--space-4))); pointer-events: none;
    }
    @media (max-width: 899px) { .stack { top: calc(56px + var(--space-2)); } }
    .toast {
      --accent: #137a50; --tint: #e7f7ef;
      position: relative; overflow: hidden; pointer-events: auto;
      display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-3); align-items: start;
      padding: 14px 10px 16px 14px; border-radius: 12px; background: #fff; color: #0b0b0c;
      border: 1px solid rgba(11, 11, 12, 0.08); border-left: 4px solid var(--accent);
      box-shadow: 0 12px 32px -8px rgba(11, 11, 12, 0.22), 0 2px 6px rgba(11, 11, 12, 0.06);
      animation: slideIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }
    .toast--error { --accent: #b42318; --tint: #fdecec; }
    .toast--info { --accent: #1d5bd8; --tint: #e8effd; }
    .toast__icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%;
      background: var(--tint); color: var(--accent); }
    .toast__body { min-width: 0; padding-top: 1px; }
    .toast__title { margin: 0; font-weight: 700; font-size: 14px; }
    .toast__msg { margin: 2px 0 0; font-size: 13.5px; line-height: 1.45; color: #4a4a52; overflow-wrap: anywhere; }
    .toast__close { display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 8px;
      background: none; color: #6b6b74; cursor: pointer; }
    .toast__close:hover { background: #f1f1f3; color: #0b0b0c; }
    .toast__bar { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: var(--accent);
      opacity: 0.35; transform-origin: left; animation: drain linear both; }
    .toast:hover .toast__bar { animation-play-state: paused; }
    @keyframes slideIn { from { opacity: 0; transform: translateX(24px) scale(0.98); } }
    @keyframes drain { to { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } .toast__bar { display: none; } }
  `,
})
export class AdminToasts {
  protected readonly toasts = inject(AdminToastService);
  protected readonly icons = ICONS;
  protected readonly titles = TITLES;
}
