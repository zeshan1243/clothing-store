import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Select, SelectOption } from '../../shared/select/select';

/** Pagination bar for admin tables: "Showing 26–50 of 63", page buttons and a rows-per-page picker. */
@Component({
  selector: 'app-pager',
  imports: [FormsModule, Select],
  template: `
    @if (total() > 0) {
      <nav class="pager" aria-label="Pagination">
        <span class="pager__info">Showing {{ from() }}–{{ to() }} of {{ total() }}</span>
        <div class="pager__pages">
          <button type="button" class="pager__btn" [disabled]="page() <= 1" (click)="go(page() - 1)" aria-label="Previous page">‹</button>
          @for (p of pages(); track $index) {
            @if (p === 0) {
              <span class="pager__gap" aria-hidden="true">…</span>
            } @else {
              <button type="button" class="pager__btn" [class.is-current]="p === page()" [attr.aria-current]="p === page() ? 'page' : null" (click)="go(p)">{{ p }}</button>
            }
          }
          <button type="button" class="pager__btn" [disabled]="page() >= pageCount()" (click)="go(page() + 1)" aria-label="Next page">›</button>
        </div>
        <label class="pager__size">
          Rows
          <app-select class="pager__select" size="sm" [searchable]="false" ariaLabel="Rows per page" [options]="sizeOptions"
            [ngModel]="pageSize()" (ngModelChange)="setSize($event)" />
        </label>
      </nav>
    }
  `,
  styles: `
    .pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3);
      padding: var(--space-3) 0; font-size: 14px; }
    .pager__info { color: var(--color-text-muted, var(--text-muted)); }
    .pager__pages { display: flex; align-items: center; gap: 4px; }
    .pager__btn { min-width: 36px; height: 36px; padding: 0 8px; border: 1px solid var(--color-border, var(--border));
      border-radius: 8px; background: var(--color-bg, #fff); font: inherit; font-weight: 600; cursor: pointer; }
    .pager__btn:disabled { opacity: 0.4; cursor: default; }
    .pager__btn.is-current { background: var(--ink-950); border-color: var(--ink-950); color: #fff; }
    .pager__gap { padding: 0 4px; color: var(--color-text-muted, var(--text-muted)); }
    .pager__size { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-text-muted, var(--text-muted)); }
    .pager__select { width: 84px; }
  `,
})
export class Pager {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly sizeOptions: SelectOption<number>[] = [10, 25, 50, 100].map((n) => ({ value: n, label: String(n) }));
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() => (this.page() - 1) * this.pageSize() + 1);
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));

  /** Page numbers with 0 for gaps: 1 … 4 5 6 … 12. */
  protected readonly pages = computed(() => {
    const count = this.pageCount();
    const current = this.page();
    const keep = new Set([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
    const sorted = [...keep].sort((a, b) => a - b);
    const out: number[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) out.push(0);
      out.push(p);
    });
    return out;
  });

  protected go(p: number): void {
    this.pageChange.emit(Math.min(Math.max(1, p), this.pageCount()));
  }

  protected setSize(value: number): void {
    this.pageSizeChange.emit(Number(value));
  }
}

/** Slice a list for the current page (clamping the page when the list shrinks). */
export function pageOf<T>(items: T[], page: number, pageSize: number): T[] {
  const last = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(page, last);
  return items.slice((p - 1) * pageSize, p * pageSize);
}
