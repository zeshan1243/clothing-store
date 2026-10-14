import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import { AdminCustomer, AdminCustomersService, CustomerKind } from '../admin-customers.service';
import { formatQatarPhone } from '../orders/contact-links';
import { Pager } from '../shared/pager';

/** Customers: registered accounts (default), guests who ordered without one, or everyone. */
@Component({
  selector: 'app-admin-customer-list',
  imports: [FormsModule, RouterLink, DatePipe, QarPipe, Pager],
  template: `
    <div class="page-head"><h1>Customers</h1></div>

    <nav class="tabs" aria-label="Customer type">
      @for (t of kinds; track t.key) {
        <button type="button" class="tab" [class.is-active]="kind() === t.key" [attr.aria-pressed]="kind() === t.key" (click)="setKind(t.key)">{{ t.label }}</button>
      }
    </nav>

    <form class="filters" (ngSubmit)="search()">
      <input type="search" name="q" placeholder="Name, phone or email" aria-label="Search customers" [(ngModel)]="q" />
      <button type="submit" class="btn btn--secondary btn--small">Search</button>
    </form>

    @if (error(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    }

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Customer</th>
            <th scope="col">Phone</th>
            <th scope="col">Account</th>
            <th scope="col" class="num">Orders</th>
            <th scope="col" class="num">Ordered</th>
            <th scope="col">Last order</th>
          </tr>
        </thead>
        <tbody>
          @for (c of rows(); track c.id) {
            <tr>
              <td>
                <a [routerLink]="['/admin/customers', c.id]"><strong>{{ c.full_name }}</strong></a>
                @if (c.email) { <br /><span class="muted small">{{ c.email }}</span> }
              </td>
              <td class="ltr">{{ phone(c.phone) }}</td>
              <td>
                @if (c.registered) {
                  <span class="status status--ACTIVE">Registered</span>
                  @if (c.phone_verified) { <span class="status">Verified</span> }
                } @else {
                  <span class="status status--INACTIVE">Guest</span>
                }
              </td>
              <td class="num">{{ c.order_count }}</td>
              <td class="num">{{ c.total_ordered | qar }}</td>
              <td>{{ c.last_order_at ? (c.last_order_at | date: 'd MMM y') : '—' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty-state">{{ loading() ? 'Loading…' : emptyText() }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [total]="total()" [page]="page()" [pageSize]="pageSize()" (pageChange)="goTo($event)" (pageSizeChange)="setPageSize($event)" />
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .tabs { display: flex; gap: 4px; margin-bottom: var(--space-3); border-bottom: 1px solid var(--color-border); }
    .tab { min-height: 40px; padding: 0 var(--space-3); border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px;
      background: none; font: inherit; font-weight: 600; color: var(--color-text-muted); cursor: pointer; }
    .tab.is-active { border-bottom-color: var(--ink-950); color: var(--ink-950); }
    .small { font-size: 12px; }
    .status + .status { margin-inline-start: 4px; }
  `,
})
export class AdminCustomerList implements OnInit {
  private readonly api = inject(AdminCustomersService);

  protected readonly kinds: { key: CustomerKind; label: string }[] = [
    { key: 'registered', label: 'Registered' },
    { key: 'guests', label: 'Guests' },
    { key: 'all', label: 'All' },
  ];
  protected readonly kind = signal<CustomerKind>('registered');
  protected readonly rows = signal<AdminCustomer[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected q = '';
  protected readonly phone = formatQatarPhone;

  ngOnInit(): void {
    this.load();
  }

  protected emptyText(): string {
    if (this.q.trim()) return 'No customers match.';
    return this.kind() === 'registered' ? 'No one has created an account yet.' : 'No customers yet.';
  }

  protected setKind(kind: CustomerKind): void {
    this.kind.set(kind);
    this.page.set(1);
    this.load();
  }

  protected search(): void {
    this.page.set(1);
    this.load();
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.list({ q: this.q, kind: this.kind(), page: this.page(), page_size: this.pageSize() }).subscribe({
      next: (r) => {
        this.rows.set(r.items);
        this.total.set(r.total);
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
