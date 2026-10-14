import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';

/**
 * Bottom sheet on mobile, side drawer (or centred dialog) on desktop. Built on the native <dialog>
 * element, which provides focus trapping, Escape-to-close and an inert background.
 */
@Component({
  selector: 'app-sheet',
  imports: [Icon, TranslatePipe],
  template: `
    <dialog #dialog class="sheet" [class.sheet--right]="side() === 'right'" [class.sheet--center]="side() === 'center'"
      [attr.aria-labelledby]="titleId" (close)="closed.emit()" (click)="onBackdrop($event)">
      <div class="sheet__panel">
        <header class="sheet__head">
          <h2 class="sheet__title" [id]="titleId">{{ heading() }}</h2>
          <button type="button" class="sheet__close" (click)="close()" [attr.aria-label]="'common.close' | t">
            <app-icon name="x" [size]="22" />
          </button>
        </header>
        <div class="sheet__body"><ng-content /></div>
        <ng-content select="[sheet-footer]" />
      </div>
    </dialog>
  `,
  styles: `
    .sheet {
      padding: 0; border: 0; margin: auto 0 0; width: 100%; max-width: 100%; max-height: 88dvh;
      border-radius: var(--radius-lg) var(--radius-lg) 0 0; background: var(--bg); color: var(--text);
      box-shadow: var(--shadow-float);
    }
    .sheet[open] { animation: sheetUp var(--dur-base) var(--ease-out); }
    .sheet::backdrop { background: rgba(11, 11, 12, 0.5); }
    .sheet__panel { display: flex; flex-direction: column; max-height: 88dvh; }
    .sheet__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      padding: var(--space-4) var(--space-4) var(--space-2) var(--space-6); }
    .sheet__title { margin: 0; font-size: 20px; }
    .sheet__close { display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 50%; background: none; cursor: pointer; }
    .sheet__close:hover { background: var(--surface); }
    .sheet__body { overflow-y: auto; padding: var(--space-2) var(--space-6) var(--space-6); overscroll-behavior: contain; }
    @media (min-width: 1024px) {
      .sheet--right { margin: 0; margin-inline-start: auto; height: 100dvh; max-height: 100dvh; width: 440px; border-radius: 0; }
      .sheet--right .sheet__panel { height: 100%; max-height: none; }
      .sheet--right[open] { animation-name: sheetLeft; }
      .sheet--center { margin: auto; width: 560px; border-radius: var(--radius-lg); }
      .sheet--center[open] { animation-name: sheetFade; }
    }
    @keyframes sheetUp { from { transform: translateY(40px); opacity: 0; } }
    @keyframes sheetLeft { from { transform: translateX(40px); opacity: 0; } }
    @keyframes sheetFade { from { transform: scale(0.97); opacity: 0; } }
  `,
})
export class Sheet {
  private static counter = 0;
  protected readonly titleId = `sheet-title-${++Sheet.counter}`;

  readonly heading = input.required<string>();
  readonly open = input(false);
  readonly side = input<'bottom' | 'right' | 'center'>('bottom');
  readonly closed = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) el.showModal();
      if (!this.open() && el.open) el.close();
    });
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** Clicking the backdrop (the dialog element itself, outside the panel) closes the sheet. */
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}
