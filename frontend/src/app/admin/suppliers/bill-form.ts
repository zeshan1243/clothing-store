import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { AdminCatalogService, InventoryRow } from '../admin-catalog.service';
import { AdminSuppliersService, Supplier, money } from '../admin-suppliers.service';
import { qatarToday } from '../admin-orders.service';
import { AdminToastService } from '../shared/admin-toast.service';
import { Select, SelectOption } from '../../shared/select/select';

const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;

@Component({
  selector: 'app-admin-bill-form',
  imports: [ReactiveFormsModule, RouterLink, Select],
  template: `
    <div class="page-head">
      <h1>Record supplier bill</h1>
      <a routerLink="/admin/supplier-bills" class="btn btn--secondary btn--small">Back to bills</a>
    </div>

    @if (error(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    }

    @if (!suppliers().length && loaded()) {
      <p class="alert alert--info">Add a supplier first. <a routerLink="/admin/suppliers">Go to suppliers</a></p>
    }

    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <section class="panel">
        <h2>Bill</h2>
        <div class="form-grid">
          <div class="field">
            <label for="bf-supplier">Supplier</label>
            <app-select inputId="bf-supplier" formControlName="supplier_id" size="lg" placeholder="Choose a supplier…" [options]="supplierOptions()"
              (selectionChange)="supplierChanged()" />
          </div>
          <div class="field">
            <label for="bf-ref">Supplier's bill / reference no.</label>
            <input id="bf-ref" formControlName="supplier_reference" />
          </div>
          <div class="field">
            <label for="bf-date">Bill date</label>
            <input id="bf-date" type="date" formControlName="bill_date" />
          </div>
          <div class="field">
            <label for="bf-due">Due date <span class="muted">(optional)</span></label>
            <input id="bf-due" type="date" formControlName="due_date" />
          </div>
          <div class="field">
            <label for="bf-currency">Currency</label>
            <input id="bf-currency" formControlName="currency" maxlength="3" />
          </div>
          <div class="field">
            <label for="bf-total">Total amount</label>
            <input id="bf-total" inputmode="decimal" formControlName="total_amount"
              [attr.aria-invalid]="form.controls.total_amount.touched && form.controls.total_amount.invalid" />
            @if (itemsTotal() > 0) {
              <p class="muted small hint">Items add up to {{ fmt(itemsTotal(), form.controls.currency.value || '') }}
                <button type="button" class="link" (click)="useItemsTotal()">use this</button></p>
            }
          </div>
          <div class="field span-2">
            <label for="bf-desc">Description</label>
            <input id="bf-desc" formControlName="description" placeholder="e.g. October stock — hoodies and tees" />
          </div>
          <div class="field span-2">
            <label for="bf-notes">Notes</label>
            <textarea id="bf-notes" rows="2" formControlName="notes"></textarea>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Items <span class="muted">(optional)</span></h2>
        <p class="muted small">Link items to a product variant so they can be added to stock when received.</p>
        <div formArrayName="items" class="items">
          @for (row of items.controls; track row; let i = $index) {
            <div class="item" [formGroupName]="i">
              <div class="field grow">
                <label [for]="'it-var-' + i">Product variant</label>
                <app-select [inputId]="'it-var-' + i" formControlName="product_variant_id" size="lg" [options]="variantOptions()"
                  searchPlaceholder="Search product or SKU…" (selectionChange)="variantChosen(i)" />
              </div>
              <div class="field grow">
                <label [for]="'it-desc-' + i">Description</label>
                <input [id]="'it-desc-' + i" formControlName="description" />
              </div>
              <div class="field narrow">
                <label [for]="'it-qty-' + i">Qty</label>
                <input [id]="'it-qty-' + i" type="number" min="1" formControlName="quantity" />
              </div>
              <div class="field narrow">
                <label [for]="'it-cost-' + i">Unit cost</label>
                <input [id]="'it-cost-' + i" inputmode="decimal" formControlName="unit_cost" />
              </div>
              <button type="button" class="btn btn--secondary btn--small remove" (click)="items.removeAt(i)" aria-label="Remove item">✕</button>
            </div>
          }
        </div>
        <button type="button" class="btn btn--secondary btn--small" (click)="addItem()">Add item</button>
        @if (items.length) {
          <label class="checkbox"><input type="checkbox" formControlName="receive_now" /> Goods already received — add linked items to stock now</label>
        }
      </section>

      <div class="save-bar">
        <button type="submit" class="btn" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save bill' }}</button>
      </div>
    </form>
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .small { font-size: 0.8125rem; }
    .hint { margin: 0; }
    .link { border: 0; background: none; padding: 0; text-decoration: underline; cursor: pointer; font: inherit; }
    .items { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
    .item { display: flex; flex-wrap: wrap; gap: 0 var(--space-2); align-items: flex-end;
      padding-bottom: var(--space-2); border-bottom: 1px solid var(--color-border); }
    .grow { flex: 1 1 220px; }
    .narrow { flex: 0 1 100px; }
    .remove { margin-bottom: var(--space-4); }
    .save-bar { display: flex; justify-content: flex-end; }
  `,
})
export class AdminBillForm implements OnInit {
  protected readonly supplierOptions = computed<SelectOption<number | null>[]>(() =>
    this.suppliers().map((s) => ({ value: s.id, label: s.name })),
  );
  protected readonly variantOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'Not stock (e.g. packaging)' },
    ...this.variants().map((v) => ({ value: v.variant_id, label: `${v.product_name} — ${v.colour} / ${v.size}`, hint: v.sku })),
  ]);
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminSuppliersService);
  private readonly catalog = inject(AdminCatalogService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Optional ?supplier= to preselect. */
  readonly supplier = input<string>();

  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly variants = signal<InventoryRow[]>([]);
  protected readonly loaded = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly itemsVersion = signal(0);
  protected readonly fmt = money;

  protected readonly form = this.fb.group({
    supplier_id: this.fb.control<number | null>(null, Validators.required),
    supplier_reference: [''],
    bill_date: [qatarToday(), Validators.required],
    due_date: [''],
    currency: ['PKR', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    total_amount: ['', [Validators.required, Validators.pattern(AMOUNT)]],
    description: [''],
    notes: [''],
    receive_now: [false],
    items: this.fb.array<FormGroup>([]),
  });

  protected readonly itemsTotal = computed(() => {
    this.itemsVersion();
    return this.items.controls.reduce((sum, row) => {
      const cost = Number(row.value['unit_cost']);
      const qty = Number(row.value['quantity']);
      return sum + (Number.isFinite(cost) && Number.isFinite(qty) ? Math.round(cost * 100) * qty : 0);
    }, 0) / 100;
  });

  get items(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  ngOnInit(): void {
    this.form.controls.items.valueChanges.subscribe(() => this.itemsVersion.update((v) => v + 1));
    this.api.suppliers().subscribe({
      next: (s) => {
        this.suppliers.set(s);
        this.loaded.set(true);
        const preselect = Number(this.supplier());
        if (preselect && s.some((x) => x.id === preselect)) {
          this.form.controls.supplier_id.setValue(preselect);
          this.supplierChanged();
        }
      },
    });
    this.catalog.inventory().subscribe({ next: (rows) => this.variants.set(rows) });
  }

  protected supplierChanged(): void {
    const s = this.suppliers().find((x) => x.id === this.form.controls.supplier_id.value);
    if (s) this.form.controls.currency.setValue(s.default_currency);
  }

  protected addItem(): void {
    this.items.push(
      this.fb.group({
        product_variant_id: this.fb.control<number | null>(null),
        description: ['', Validators.required],
        quantity: [1, [Validators.required, Validators.min(1)]],
        unit_cost: ['', Validators.pattern(AMOUNT)],
      }),
    );
  }

  protected variantChosen(index: number): void {
    const row = this.items.at(index);
    const v = this.variants().find((x) => x.variant_id === row.value['product_variant_id']);
    if (v && !row.value['description']) {
      row.patchValue({ description: `${v.product_name} — ${v.colour} / ${v.size}` });
    }
  }

  protected useItemsTotal(): void {
    this.form.controls.total_amount.setValue(this.itemsTotal().toFixed(2));
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Choose a supplier, enter the bill date, a 3-letter currency and a valid total. Items need a description and quantity.');
      return;
    }
    const v = this.form.getRawValue();
    const opt = (x: string) => x.trim() || null;
    this.saving.set(true);
    this.api
      .createBill({
        supplier_id: v.supplier_id!,
        supplier_reference: opt(v.supplier_reference),
        bill_date: v.bill_date,
        due_date: opt(v.due_date),
        description: opt(v.description),
        currency: v.currency.trim().toUpperCase(),
        total_amount: v.total_amount.trim(),
        notes: opt(v.notes),
        receive_now: v.receive_now,
        items: this.items.getRawValue().map((row) => ({
          product_variant_id: row['product_variant_id'],
          description: String(row['description']).trim(),
          quantity: Number(row['quantity']),
          unit_cost: opt(String(row['unit_cost'] ?? '')),
        })),
      })
      .subscribe({
        next: (bill) => {
          this.toast.success(bill.supplier_reference ? `Bill ${bill.supplier_reference} saved.` : 'Bill saved.');
          void this.router.navigate(['/admin/supplier-bills', bill.id]);
        },
        error: (e: unknown) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(e, 'Could not save the bill.'));
        },
      });
  }
}
