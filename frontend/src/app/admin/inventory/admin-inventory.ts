import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { Pager, pageOf } from '../shared/pager';
import { AdjustmentType, AdminCatalogService, InventoryRow, StockMovement } from '../admin-catalog.service';
import { AdminToastService } from '../shared/admin-toast.service';
import { Select, SelectOption } from '../../shared/select/select';

@Component({
  selector: 'app-admin-inventory',
  imports: [FormsModule, ReactiveFormsModule, RouterLink, DatePipe, Pager, Select],
  templateUrl: './admin-inventory.html',
  styleUrls: ['../admin-shared.scss', './admin-inventory.scss'],
})
export class AdminInventory implements OnInit {
  protected readonly adjustTypeOptions = computed<SelectOption<AdjustmentType>[]>(() =>
    this.adjustTypes.map((t) => ({ value: t.value, label: t.label })),
  );
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminCatalogService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly rows = signal<InventoryRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly selected = signal<InventoryRow | null>(null);
  protected readonly movements = signal<StockMovement[]>([]);
  protected readonly adjustError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly visible = computed(() => pageOf(this.rows(), this.page(), this.pageSize()));
  private lastQuery = '';

  protected q = '';
  protected lowStockOnly = false;

  protected readonly adjustTypes: { value: AdjustmentType; label: string; hint: string }[] = [
    { value: 'RECEIVED', label: 'Received stock', hint: 'New units arrived (enter a positive number).' },
    { value: 'ADJUSTMENT', label: 'Correction', hint: 'Recount, damage or loss (positive or negative).' },
    { value: 'RETURN', label: 'Customer return', hint: 'Returned item back in sellable stock.' },
  ];

  protected readonly adjustForm = this.fb.group({
    movement_type: this.fb.control<AdjustmentType>('RECEIVED'),
    quantity_change: [0, [Validators.required]],
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.inventory({ q: this.q.trim(), low_stock_only: this.lowStockOnly }).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        // New search or filter → back to page 1 (an adjustment reload keeps the page).
        const query = `${this.q.trim()}|${this.lowStockOnly}`;
        if (query !== this.lastQuery) this.page.set(1);
        this.lastQuery = query;
        this.loading.set(false);
        this.error.set(null);
        const current = this.selected();
        if (current) this.selected.set(rows.find((r) => r.variant_id === current.variant_id) ?? null);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected open(row: InventoryRow): void {
    this.selected.set(row);
    this.adjustError.set(null);
    this.adjustForm.reset({ movement_type: 'RECEIVED', quantity_change: 0, reason: '' });
    this.api.movements(row.variant_id).subscribe({ next: (m) => this.movements.set(m) });
  }

  protected close(): void {
    this.selected.set(null);
    this.movements.set([]);
  }

  protected submitAdjustment(): void {
    const row = this.selected();
    if (!row) return;
    const v = this.adjustForm.getRawValue();
    const change = Math.trunc(Number(v.quantity_change));
    if (this.adjustForm.invalid || !change) {
      this.adjustForm.markAllAsTouched();
      this.adjustError.set('Enter a non-zero quantity and a reason (at least 3 characters).');
      return;
    }
    this.saving.set(true);
    this.api
      .adjustStock({ product_variant_id: row.variant_id, movement_type: v.movement_type, quantity_change: change, reason: v.reason.trim() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.adjustError.set(null);
          this.toast.success(`${row.sku}: stock ${change > 0 ? '+' : ''}${change}.`);
          this.adjustForm.reset({ movement_type: 'RECEIVED', quantity_change: 0, reason: '' });
          this.api.movements(row.variant_id).subscribe({ next: (m) => this.movements.set(m) });
          this.load();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not adjust stock.'));
        },
      });
  }
}
