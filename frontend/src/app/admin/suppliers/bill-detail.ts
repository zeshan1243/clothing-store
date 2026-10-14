import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { apiErrorMessage } from '../../core/api-error';
import { AdminSuppliersService, BILL_STATUS_LABELS, SupplierBillDetail, money } from '../admin-suppliers.service';
import { AdminToastService } from '../shared/admin-toast.service';

@Component({
  selector: 'app-admin-bill-detail',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <a routerLink="/admin/supplier-bills" class="back">← Supplier bills</a>

    @if (loadError(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    } @else if (bill(); as b) {
      <div class="page-head">
        <div>
          <h1>{{ b.supplier_reference || 'Bill #' + b.id }}</h1>
          <p class="muted">{{ b.supplier_name }} · {{ b.bill_date | date: 'd MMM yyyy' }}
            @if (b.due_date) { · due {{ b.due_date | date: 'd MMM yyyy' }} }
          </p>
        </div>
        <span class="status" [class.status--ACTIVE]="b.status === 'PAID'" [class.status--DRAFT]="b.status === 'PARTIALLY_PAID'"
          [class.status--low]="b.status === 'UNPAID'">{{ labels[b.status] }}@if (b.is_overdue) { · overdue }</span>
      </div>

      @if (error(); as e) {
        <p class="alert alert--error" role="alert">{{ e }}</p>
      }

      <div class="grid">
        <section class="panel">
          <h2>Balance</h2>
          <dl class="totals">
            <div><dt>Bill total</dt><dd>{{ fmt(b.total_amount, b.currency) }}</dd></div>
            <div><dt>Paid</dt><dd>{{ fmt(b.paid_amount, b.currency) }}</dd></div>
            <div class="grand"><dt>Outstanding</dt><dd>{{ fmt(b.outstanding_amount, b.currency) }}</dd></div>
          </dl>
          @if (b.description) { <p>{{ b.description }}</p> }
          @if (b.notes) { <p class="muted small">{{ b.notes }}</p> }
          <p class="muted small">Recorded by {{ b.created_by ?? '—' }} on {{ b.created_at | date: 'd MMM yyyy' }}. Amounts can't be edited once recorded.</p>

          <h3>Payments</h3>
          <ul class="list">
            @for (p of b.payments; track p.id) {
              <li>
                <strong>{{ fmt(p.amount, p.currency) }}</strong>
                @if (p.amount_qar && p.currency !== 'QAR') { <span class="muted"> ≈ QAR {{ p.amount_qar }} (rate {{ +(p.exchange_rate_to_qar ?? 0) }})</span> }
                <br /><span class="muted small">{{ p.paid_at | date: 'd MMM yyyy' }} · {{ p.recorded_by ?? '—' }}
                  @if (p.payment_reference) { · Ref {{ p.payment_reference }} }
                  @if (p.notes) { · {{ p.notes }} }</span>
              </li>
            } @empty {
              <li class="muted">No payments yet.</li>
            }
          </ul>

          @if (+b.outstanding_amount > 0) {
            <form class="pay" (ngSubmit)="pay()">
              <h3>Record a payment</h3>
              <div class="row">
                <div class="field">
                  <label for="sp-amount">Amount ({{ b.currency }})</label>
                  <input id="sp-amount" name="amount" inputmode="decimal" [(ngModel)]="payment.amount" />
                </div>
                <div class="field">
                  <label for="sp-date">Paid on</label>
                  <input id="sp-date" name="date" type="date" [(ngModel)]="payment.date" />
                </div>
              </div>
              @if (b.currency !== 'QAR') {
                <div class="row">
                  <div class="field">
                    <label for="sp-rate">Rate: 1 {{ b.currency }} = ? QAR <span class="muted">(optional)</span></label>
                    <input id="sp-rate" name="rate" inputmode="decimal" [(ngModel)]="payment.rate" placeholder="e.g. 0.0131" />
                  </div>
                  <div class="field">
                    <label for="sp-qar">…or QAR amount <span class="muted">(optional)</span></label>
                    <input id="sp-qar" name="qar" inputmode="decimal" [(ngModel)]="payment.qar" />
                  </div>
                </div>
              }
              <div class="row">
                <div class="field">
                  <label for="sp-ref">Reference</label>
                  <input id="sp-ref" name="ref" [(ngModel)]="payment.reference" placeholder="Bank transfer / receipt no." />
                </div>
                <div class="field">
                  <label for="sp-notes">Notes</label>
                  <input id="sp-notes" name="notes" [(ngModel)]="payment.notes" />
                </div>
              </div>
              <button type="submit" class="btn btn--small" [disabled]="busy()">Save payment</button>
            </form>
          }
        </section>

        <section class="panel">
          <h2>Items</h2>
          @if (b.items.length) {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th scope="col">Item</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Received</th>
                    <th scope="col" class="num">Unit cost</th><th scope="col">Receive now</th></tr>
                </thead>
                <tbody>
                  @for (i of b.items; track i.id) {
                    <tr>
                      <td>{{ i.description }} @if (i.sku) { <br /><span class="muted small">{{ i.sku }}</span> }</td>
                      <td class="num">{{ i.quantity }}</td>
                      <td class="num">{{ i.quantity_received }}</td>
                      <td class="num">{{ i.unit_cost ? fmt(i.unit_cost, b.currency) : '—' }}</td>
                      <td>
                        @if (i.product_variant_id && i.quantity_received < i.quantity) {
                          <input type="number" min="0" [max]="i.quantity - i.quantity_received" [(ngModel)]="receiveQty[i.id]"
                            [attr.aria-label]="'Quantity to receive for ' + i.description" />
                        } @else if (!i.product_variant_id) {
                          <span class="muted small">Not stock</span>
                        } @else {
                          <span class="muted small">All received</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (b.items_pending > 0) {
              <div class="receive-bar">
                <button type="button" class="btn btn--secondary btn--small" (click)="fillAll()">Fill remaining</button>
                <button type="button" class="btn btn--small" [disabled]="busy() || !hasReceiveLines()" (click)="receive()">Add to stock</button>
              </div>
            }
          } @else {
            <p class="muted">No items listed on this bill.</p>
          }
        </section>
      </div>
    } @else {
      <p class="muted" role="status">Loading…</p>
    }
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .back { display: inline-block; margin-bottom: var(--space-3); text-decoration: none; font-weight: 600; }
    .page-head p { margin: 0; }
    .small { font-size: 0.8125rem; }
    .grid { display: grid; gap: var(--space-4); }
    .grid > * { min-width: 0; }
    @media (min-width: 1100px) { .grid { grid-template-columns: 1fr 1fr; align-items: start; } }
    .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
    .totals dt, .totals dd { margin: 0; }
    .grand { border-top: 1px solid var(--color-border); margin-top: var(--space-1); padding-top: var(--space-2) !important; font-weight: 800; }
    h3 { font-size: 1rem; margin-top: var(--space-4); }
    .list { list-style: none; margin: 0; padding: 0; }
    .list li { padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
    .receive-bar { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
  `,
})
export class AdminBillDetail implements OnInit {
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminSuppliersService);

  /** Route param :id */
  readonly id = input.required<string>();

  protected readonly bill = signal<SupplierBillDetail | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly labels = BILL_STATUS_LABELS;
  protected readonly fmt = money;
  protected readonly billId = computed(() => Number(this.id()));

  protected payment = { amount: '', date: '', rate: '', qar: '', reference: '', notes: '' };
  protected receiveQty: Record<number, number | null> = {};

  ngOnInit(): void {
    this.api.bill(this.billId()).subscribe({
      next: (b) => this.setBill(b),
      error: (e: unknown) => this.loadError.set(apiErrorMessage(e, 'Could not load this bill.')),
    });
  }

  protected pay(): void {
    const p = this.payment;
    const amount = /^\d+(\.\d{1,2})?$/;
    if (!amount.test(p.amount.trim()) || Number(p.amount) <= 0) {
      this.error.set('Enter a valid payment amount.');
      return;
    }
    if (p.rate.trim() && !/^\d+(\.\d+)?$/.test(p.rate.trim())) {
      this.error.set('Enter the exchange rate as a number, e.g. 0.0131');
      return;
    }
    if (p.qar.trim() && !amount.test(p.qar.trim())) {
      this.error.set('Enter the QAR amount as a number, e.g. 1310.00');
      return;
    }
    this.run(
      this.api.addPayment(this.billId(), {
        amount: p.amount.trim(),
        paid_at: p.date ? `${p.date}T12:00:00+03:00` : null,
        exchange_rate_to_qar: p.rate.trim() || null,
        amount_qar: p.qar.trim() || null,
        payment_reference: p.reference.trim() || null,
        notes: p.notes.trim() || null,
      }),
      'Payment recorded.',
    );
  }

  protected fillAll(): void {
    for (const i of this.bill()?.items ?? []) {
      if (i.product_variant_id) this.receiveQty[i.id] = i.quantity - i.quantity_received;
    }
  }

  protected hasReceiveLines(): boolean {
    return Object.values(this.receiveQty).some((q) => Number(q) > 0);
  }

  protected receive(): void {
    const lines = Object.entries(this.receiveQty)
      .filter(([, q]) => Number(q) > 0)
      .map(([id, q]) => ({ item_id: Number(id), quantity: Math.trunc(Number(q)) }));
    this.run(this.api.receive(this.billId(), lines), 'Stock added to inventory.');
  }

  private run(request: Observable<SupplierBillDetail>, message: string): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (b) => {
        this.setBill(b);
        this.busy.set(false);
        this.toast.success(message);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(e, 'That action failed.'));
      },
    });
  }

  private setBill(b: SupplierBillDetail): void {
    this.bill.set(b);
    this.receiveQty = {};
    this.payment = { amount: Number(b.outstanding_amount) > 0 ? b.outstanding_amount : '', date: '', rate: '', qar: '', reference: '', notes: '' };
  }
}
