import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { AdminSuppliersService, Supplier, money } from '../admin-suppliers.service';
import { AdminToastService } from '../shared/admin-toast.service';

@Component({
  selector: 'app-admin-suppliers',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="page-head">
      <h1>Suppliers</h1>
      <div class="head-actions">
        <a routerLink="/admin/supplier-bills" class="btn btn--secondary btn--small">All bills</a>
        <button type="button" class="btn btn--small" (click)="startNew()">Add supplier</button>
      </div>
    </div>

    @if (error(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    }

    @if (editing()) {
      <form class="panel" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <h2>{{ editingId() ? 'Edit supplier' : 'New supplier' }}</h2>
        <div class="form-grid">
          <div class="field">
            <label for="s-name">Name</label>
            <input id="s-name" formControlName="name" [attr.aria-invalid]="form.controls.name.touched && form.controls.name.invalid" />
          </div>
          <div class="field">
            <label for="s-currency">Default currency</label>
            <input id="s-currency" formControlName="default_currency" maxlength="3" placeholder="PKR" />
          </div>
          <div class="field">
            <label for="s-phone">Phone / WhatsApp</label>
            <input id="s-phone" type="tel" formControlName="phone" />
          </div>
          <div class="field">
            <label for="s-email">Email</label>
            <input id="s-email" type="email" formControlName="email" />
          </div>
          <div class="field span-2">
            <label for="s-terms">Payment terms</label>
            <input id="s-terms" formControlName="payment_terms" placeholder="e.g. Pay within 60 days of receiving goods" />
          </div>
          <div class="field span-2">
            <label for="s-notes">Notes</label>
            <textarea id="s-notes" rows="2" formControlName="notes"></textarea>
          </div>
          <label class="checkbox"><input type="checkbox" formControlName="is_active" /> Active</label>
        </div>
        <button type="submit" class="btn btn--small" [disabled]="saving()">Save</button>
        <button type="button" class="btn btn--secondary btn--small cancel" (click)="editing.set(false)">Cancel</button>
      </form>
    }

    <ul class="suppliers">
      @for (s of suppliers(); track s.id) {
        <li class="panel">
          <div class="row">
            <div>
              <h2>{{ s.name }} @if (!s.is_active) { <span class="muted">(inactive)</span> }</h2>
              <p class="muted small">
                {{ s.phone ?? '' }} @if (s.email) { · {{ s.email }} }
                @if (s.payment_terms) { <br />Terms: {{ s.payment_terms }} }
              </p>
            </div>
            <div class="actions">
              <a class="btn btn--small" routerLink="/admin/supplier-bills/new" [queryParams]="{ supplier: s.id }">New bill</a>
              <a class="btn btn--secondary btn--small" routerLink="/admin/supplier-bills" [queryParams]="{ supplier: s.id }">Bills ({{ s.open_bills }} open)</a>
              <button type="button" class="btn btn--secondary btn--small" (click)="edit(s)">Edit</button>
            </div>
          </div>
          @if (s.balances.length) {
            <table class="table balances">
              <thead>
                <tr><th scope="col">Currency</th><th scope="col" class="num">Billed</th><th scope="col" class="num">Paid</th><th scope="col" class="num">Outstanding</th><th scope="col" class="num">Overdue</th></tr>
              </thead>
              <tbody>
                @for (b of s.balances; track b.currency) {
                  <tr>
                    <td>{{ b.currency }}</td>
                    <td class="num">{{ fmt(b.billed, b.currency) }}</td>
                    <td class="num">{{ fmt(b.paid, b.currency) }}</td>
                    <td class="num"><strong>{{ fmt(b.outstanding, b.currency) }}</strong></td>
                    <td class="num" [class.overdue]="+b.overdue > 0">{{ fmt(b.overdue, b.currency) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="muted small">No bills yet.</p>
          }
        </li>
      } @empty {
        <li class="empty-state">{{ loading() ? 'Loading…' : 'No suppliers yet. Add the people or companies you buy stock from.' }}</li>
      }
    </ul>
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .head-actions { display: flex; gap: var(--space-2); }
    .cancel { margin-left: var(--space-2); }
    .suppliers { list-style: none; margin: 0; padding: 0; }
    .row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); }
    .row h2 { margin: 0 0 var(--space-1); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: flex-start; }
    .small { font-size: 0.8125rem; margin: 0; }
    .balances { margin-top: var(--space-3); }
    .overdue { color: var(--color-danger); font-weight: 700; }
  `,
})
export class AdminSuppliers implements OnInit {
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminSuppliersService);

  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly fmt = money;

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    phone: [''],
    email: ['', Validators.email],
    default_currency: ['PKR', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    payment_terms: [''],
    notes: [''],
    is_active: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  protected startNew(): void {
    this.editingId.set(null);
    this.form.reset();
    this.editing.set(true);
  }

  protected edit(s: Supplier): void {
    this.editingId.set(s.id);
    this.form.setValue({
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      default_currency: s.default_currency,
      payment_terms: s.payment_terms ?? '',
      notes: s.notes ?? '',
      is_active: s.is_active,
    });
    this.editing.set(true);
    window.scrollTo({ top: 0 });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Enter a name and a 3-letter currency code (e.g. PKR).');
      return;
    }
    const v = this.form.getRawValue();
    const opt = (x: string) => x.trim() || null;
    const body = {
      name: v.name.trim(),
      phone: opt(v.phone),
      email: opt(v.email),
      default_currency: v.default_currency.trim().toUpperCase(),
      payment_terms: opt(v.payment_terms),
      notes: opt(v.notes),
      is_active: v.is_active,
    };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.updateSupplier(id, body) : this.api.createSupplier(body)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.editing.set(false);
        this.error.set(null);
        this.toast.success(id ? `${saved.name} saved.` : `${saved.name} added.`);
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(e, 'Could not save the supplier.'));
      },
    });
  }

  private load(): void {
    this.api.suppliers(true).subscribe({
      next: (s) => {
        this.suppliers.set(s);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(apiErrorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
