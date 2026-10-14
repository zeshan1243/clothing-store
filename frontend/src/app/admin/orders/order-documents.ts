import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import { AdminDocumentsService, InvoiceSummary, openPdf } from '../admin-documents.service';
import { AdminOrderDetail } from '../admin-orders.service';

/** Invoice, credit notes and shipping label for one order. */
@Component({
  selector: 'app-order-documents',
  imports: [FormsModule, DatePipe, QarPipe],
  template: `
    <section class="panel" aria-labelledby="docs-heading">
      <h2 id="docs-heading">Invoice &amp; label</h2>

      @if (error(); as e) {
        <p class="alert alert--error" role="alert">{{ e }}</p>
      }

      <ul class="docs">
        @for (d of documents(); track d.id) {
          <li>
            <div>
              <strong>{{ d.invoice_type === 'CREDIT_NOTE' ? 'Credit note' : 'Invoice' }} {{ d.invoice_number }}</strong>
              @if (d.status === 'CREDITED') {
                <span class="badge">Credited</span>
              }
              <br />
              <span class="muted small">
                {{ d.invoice_date | date: 'd MMM yyyy' }} · {{ d.total | qar }}
                @if (d.related_invoice_number) { · credits {{ d.related_invoice_number }} }
                @if (d.invoice_type === 'INVOICE' && +(d.credited_amount ?? 0) > 0 && d.status !== 'CREDITED') {
                  · {{ d.credited_amount | qar }} credited
                }
              </span>
              @if (d.reason) {
                <br /><span class="muted small">{{ d.reason }}</span>
              }
            </div>
            <div class="buttons">
              <button type="button" class="btn btn--small" (click)="view(d)">View / print</button>
              <button type="button" class="btn btn--secondary btn--small" (click)="download(d)">Download</button>
              @if (d.invoice_type === 'INVOICE' && d.status === 'ISSUED') {
                <button type="button" class="btn btn--secondary btn--small" (click)="crediting.set(d)">Credit note</button>
              }
            </div>
          </li>
        } @empty {
          <li class="muted small">
            No invoice yet — it's issued automatically when the order is confirmed.
          </li>
        }
      </ul>

      @if (crediting(); as inv) {
        <form class="credit" (ngSubmit)="submitCredit(inv)">
          <p class="small">
            Credit note against <strong>{{ inv.invoice_number }}</strong> (for returns or corrections — the invoice itself is never edited).
          </p>
          <div class="field">
            <label for="cn-reason">Reason (required)</label>
            <input id="cn-reason" name="reason" [(ngModel)]="creditReason" placeholder="e.g. Customer returned 1 × hoodie" />
          </div>
          <div class="field">
            <label for="cn-amount">Amount (QAR) — leave blank to credit the full remaining amount</label>
            <input id="cn-amount" name="amount" inputmode="decimal" [(ngModel)]="creditAmount" />
          </div>
          <div class="buttons">
            <button type="submit" class="btn btn--small" [disabled]="busy()">Issue credit note</button>
            <button type="button" class="btn btn--secondary btn--small" (click)="crediting.set(null)">Cancel</button>
          </div>
        </form>
      }

      <div class="buttons footer">
        @if (canIssue()) {
          <button type="button" class="btn btn--secondary btn--small" [disabled]="busy()" (click)="issue()">Issue invoice now</button>
        }
        <button type="button" class="btn btn--secondary btn--small" (click)="label()">Shipping label (no prices)</button>
      </div>
    </section>
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .docs { list-style: none; margin: 0 0 var(--space-3); padding: 0; }
    .docs li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2);
      padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
    .buttons { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
    .small { font-size: 0.8125rem; }
    .badge { margin-left: var(--space-2); padding: 2px var(--space-2); border-radius: 999px; font-size: 0.75rem;
      background: #e7e5e4; color: #57534e; font-weight: 700; }
    .credit { margin: var(--space-3) 0; padding: var(--space-3); background: var(--color-surface); border-radius: var(--radius); }
    .footer { margin-top: var(--space-2); }
  `,
})
export class OrderDocuments {
  private readonly api = inject(AdminDocumentsService);

  readonly order = input.required<AdminOrderDetail>();

  protected readonly documents = signal<InvoiceSummary[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly crediting = signal<InvoiceSummary | null>(null);
  protected readonly canIssue = computed(
    () =>
      this.order().order_status !== 'CANCELLED' &&
      !this.documents().some((d) => d.invoice_type === 'INVOICE' && d.status === 'ISSUED'),
  );

  protected creditReason = '';
  protected creditAmount = '';

  constructor() {
    // Reload whenever the order changes (confirming issues an invoice; cancelling credits it).
    effect(() => {
      const o = this.order();
      void o.updated_at;
      this.load(o.id);
    });
  }

  protected view(d: InvoiceSummary): void {
    openPdf(this.api.invoicePdf(d.id), 'view', `${d.invoice_number}.pdf`, (e) => this.fail(e));
  }

  protected download(d: InvoiceSummary): void {
    openPdf(this.api.invoicePdf(d.id), 'download', `${d.invoice_number}.pdf`, (e) => this.fail(e));
  }

  protected label(): void {
    const o = this.order();
    openPdf(this.api.labelPdf(o.id), 'view', `label-${o.order_number}.pdf`, (e) => this.fail(e));
  }

  protected issue(): void {
    this.busy.set(true);
    this.api.issueInvoice(this.order().id).subscribe({
      next: () => this.afterChange(),
      error: (e: unknown) => this.fail(e),
    });
  }

  protected submitCredit(invoice: InvoiceSummary): void {
    const amount = this.creditAmount.trim();
    if (this.creditReason.trim().length < 3) {
      this.error.set('Enter a reason for the credit note.');
      return;
    }
    if (amount && !/^\d+(\.\d{1,2})?$/.test(amount)) {
      this.error.set('Enter a valid amount, e.g. 110.00, or leave it blank.');
      return;
    }
    this.busy.set(true);
    this.api.creditNote(invoice.id, this.creditReason.trim(), amount || null).subscribe({
      next: () => {
        this.crediting.set(null);
        this.creditReason = '';
        this.creditAmount = '';
        this.afterChange();
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private afterChange(): void {
    this.busy.set(false);
    this.error.set(null);
    this.load(this.order().id);
  }

  private load(orderId: number): void {
    this.api.orderInvoices(orderId).subscribe({
      next: (docs) => this.documents.set(docs),
      error: (e: unknown) => this.fail(e),
    });
  }

  private fail(err: unknown): void {
    this.busy.set(false);
    this.error.set(apiErrorMessage(err, 'Could not load the document.'));
  }
}
