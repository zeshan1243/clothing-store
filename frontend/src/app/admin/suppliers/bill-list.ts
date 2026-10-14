import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import {
  AdminSuppliersService,
  BILL_STATUS_LABELS,
  Supplier,
  SupplierBillListItem,
  SupplierBillStatus,
  money,
} from '../admin-suppliers.service';
import { Select, SelectOption } from '../../shared/select/select';

@Component({
  selector: 'app-admin-bill-list',
  imports: [FormsModule, RouterLink, DatePipe, Select],
  template: `
    <div class="page-head">
      <h1>Supplier bills</h1>
      <a routerLink="/admin/supplier-bills/new" [queryParams]="supplierId ? { supplier: supplierId } : {}" class="btn btn--small">Record bill</a>
    </div>

    <form class="filters" (ngSubmit)="load()">
      <label class="visually-hidden" for="b-supplier">Supplier</label>
      <app-select class="filter-select" inputId="b-supplier" name="supplier" size="sm" [options]="supplierOptions()" [(ngModel)]="supplierId" (ngModelChange)="load()" />
      <label class="visually-hidden" for="b-status">Status</label>
      <app-select class="filter-select" inputId="b-status" name="status" size="sm" [options]="statusOptions" [(ngModel)]="status" (ngModelChange)="load()" />
      <label><input type="checkbox" name="open" [(ngModel)]="outstandingOnly" (ngModelChange)="load()" /> Outstanding only</label>
    </form>

    @if (error(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    }

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Bill</th>
            <th scope="col">Supplier</th>
            <th scope="col">Date</th>
            <th scope="col">Due</th>
            <th scope="col" class="num">Total</th>
            <th scope="col" class="num">Outstanding</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          @for (b of bills(); track b.id) {
            <tr>
              <td><a [routerLink]="['/admin/supplier-bills', b.id]"><strong>{{ b.supplier_reference || 'Bill #' + b.id }}</strong></a>
                @if (b.items_pending > 0) { <br /><span class="muted small">{{ b.items_pending }} units to receive</span> }
              </td>
              <td>{{ b.supplier_name }}</td>
              <td>{{ b.bill_date | date: 'd MMM yyyy' }}</td>
              <td [class.overdue]="b.is_overdue">{{ b.due_date ? (b.due_date | date: 'd MMM yyyy') : '—' }} @if (b.is_overdue) { (overdue) }</td>
              <td class="num">{{ fmt(b.total_amount, b.currency) }}</td>
              <td class="num"><strong>{{ fmt(b.outstanding_amount, b.currency) }}</strong></td>
              <td><span class="status" [class.status--ACTIVE]="b.status === 'PAID'" [class.status--DRAFT]="b.status === 'PARTIALLY_PAID'" [class.status--low]="b.status === 'UNPAID'">{{ labels[b.status] }}</span></td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty-state">{{ loading() ? 'Loading…' : 'No bills found.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .overdue { color: var(--color-danger); font-weight: 700; }
    .small { font-size: 0.8125rem; }
  `,
})
export class AdminBillList implements OnInit {
  protected readonly supplierOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'All suppliers' },
    ...this.suppliers().map((s) => ({ value: s.id, label: s.name })),
  ]);
  protected readonly statusOptions: SelectOption<string>[] = [
    { value: '', label: 'Any status' },
    ...(Object.keys(BILL_STATUS_LABELS) as SupplierBillStatus[]).map((k) => ({ value: k, label: BILL_STATUS_LABELS[k] })),
  ];
  private readonly api = inject(AdminSuppliersService);

  /** Optional ?supplier= query param. */
  readonly supplier = input<string>();

  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly bills = signal<SupplierBillListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly labels = BILL_STATUS_LABELS;
  protected readonly statuses = Object.keys(BILL_STATUS_LABELS) as SupplierBillStatus[];
  protected readonly fmt = money;

  protected supplierId: number | null = null;
  protected status: SupplierBillStatus | '' = '';
  protected outstandingOnly = false;

  ngOnInit(): void {
    this.supplierId = Number(this.supplier()) || null;
    this.api.suppliers(true).subscribe({ next: (s) => this.suppliers.set(s) });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.bills({ supplier_id: this.supplierId, status: this.status, outstanding_only: this.outstandingOnly }).subscribe({
      next: (b) => {
        this.bills.set(b);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (e: unknown) => {
        this.error.set(apiErrorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
