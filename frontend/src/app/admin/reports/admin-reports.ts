import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import { AdminOrdersService, ORDER_STATUS_LABELS, SalesReport, qatarToday } from '../admin-orders.service';

const CSV_COLUMNS: [keyof SalesReport['rows'][number], string][] = [
  ['day', 'Date'],
  ['orders_placed', 'Orders placed'],
  ['gross_order_value', 'Order value placed (QAR)'],
  ['orders_cancelled', 'Orders cancelled'],
  ['cancelled_order_value', 'Cancelled value (QAR)'],
  ['orders_delivered', 'Orders delivered'],
  ['delivered_order_value', 'Delivered value (QAR)'],
  ['orders_failed', 'Failed deliveries'],
  ['cash_collected', 'Cash collected (QAR)'],
  ['refunds_paid', 'Refunds paid (QAR)'],
];

@Component({
  selector: 'app-admin-reports',
  imports: [FormsModule, DatePipe, QarPipe],
  template: `
    <div class="page-head">
      <h1>Sales &amp; cash report</h1>
      @if (report()) {
        <button type="button" class="btn btn--secondary btn--small" (click)="downloadCsv()">Download CSV</button>
      }
    </div>

    <form class="filters" (ngSubmit)="load()">
      <label>From <input type="date" name="from" [(ngModel)]="dateFrom" required /></label>
      <label>To <input type="date" name="to" [(ngModel)]="dateTo" required /></label>
      <button type="submit" class="btn btn--small">Run report</button>
    </form>

    @if (error(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    }

    @if (report(); as r) {
      <section class="panel">
        <h2>Orders placed in this period, by current status</h2>
        @if (r.by_status.length) {
          <div class="status-grid">
            @for (s of r.by_status; track s.status) {
              <div><strong>{{ s.count }}</strong> {{ labels[s.status] }} <span class="muted">· {{ s.value | qar }}</span></div>
            }
          </div>
        } @else {
          <p class="muted">No orders placed in this period.</p>
        }
      </section>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" class="num">Placed</th>
              <th scope="col" class="num">Order value</th>
              <th scope="col" class="num">Cancelled</th>
              <th scope="col" class="num">Delivered</th>
              <th scope="col" class="num">Failed</th>
              <th scope="col" class="num">Cash collected</th>
              <th scope="col" class="num">Refunds</th>
            </tr>
          </thead>
          <tbody>
            @for (row of r.rows; track row.day) {
              <tr [class.muted]="!row.orders_placed && !row.orders_delivered && +row.cash_collected === 0">
                <td>{{ row.day | date: 'EEE d MMM' }}</td>
                <td class="num">{{ row.orders_placed }}</td>
                <td class="num">{{ row.gross_order_value | qar }}</td>
                <td class="num">{{ row.orders_cancelled }}</td>
                <td class="num">{{ row.orders_delivered }}</td>
                <td class="num">{{ row.orders_failed }}</td>
                <td class="num">{{ row.cash_collected | qar }}</td>
                <td class="num">{{ row.refunds_paid | qar }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td class="num">{{ r.totals.orders_placed }}</td>
              <td class="num">{{ r.totals.gross_order_value | qar }}</td>
              <td class="num">{{ r.totals.orders_cancelled }} ({{ r.totals.cancelled_order_value | qar }})</td>
              <td class="num">{{ r.totals.orders_delivered }}</td>
              <td class="num">{{ r.totals.orders_failed }}</td>
              <td class="num">{{ r.totals.cash_collected | qar }}</td>
              <td class="num">{{ r.totals.refunds_paid | qar }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="muted small">
        Order value counts orders on the day they were placed (including ones later cancelled). Cash collected counts
        COD cash on the day it was recorded. Neither is profit. Current stock levels are on the Inventory page.
      </p>
    } @else if (loading()) {
      <p class="muted" role="status">Loading…</p>
    }
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .status-grid { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-6); }
    tfoot td, tfoot th { font-weight: 800; background: var(--color-surface); }
    tr.muted td { color: var(--color-text-muted); }
    .small { font-size: 0.8125rem; margin-top: var(--space-3); }
  `,
})
export class AdminReports implements OnInit {
  private readonly api = inject(AdminOrdersService);

  protected readonly labels = ORDER_STATUS_LABELS;
  protected readonly report = signal<SalesReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected dateFrom = qatarToday(-29);
  protected dateTo = qatarToday();

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    if (!this.dateFrom || !this.dateTo) return;
    this.loading.set(true);
    this.api.salesReport(this.dateFrom, this.dateTo).subscribe({
      next: (r) => {
        this.report.set(r);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected downloadCsv(): void {
    const r = this.report();
    if (!r) return;
    const escape = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      CSV_COLUMNS.map(([, label]) => escape(label)).join(','),
      ...r.rows.map((row) => CSV_COLUMNS.map(([key]) => escape(row[key])).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report_${r.date_from}_to_${r.date_to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
