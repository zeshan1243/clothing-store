import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Money } from '../core/catalog.models';

export interface InvoiceSummary {
  id: number;
  invoice_number: string;
  invoice_type: 'INVOICE' | 'CREDIT_NOTE';
  status: 'ISSUED' | 'CREDITED';
  invoice_date: string;
  order_id: number;
  order_number: string;
  total: Money;
  currency: string;
  related_invoice_number: string | null;
  credited_amount: Money | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

/** Invoices, credit notes and shipping labels (PDFs need the admin token, so they're fetched as blobs). */
@Injectable({ providedIn: 'root' })
export class AdminDocumentsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  orderInvoices(orderId: number): Observable<InvoiceSummary[]> {
    return this.http.get<InvoiceSummary[]>(`${this.base}/orders/${orderId}/invoices`);
  }

  issueInvoice(orderId: number): Observable<InvoiceSummary> {
    return this.http.post<InvoiceSummary>(`${this.base}/orders/${orderId}/invoice`, {});
  }

  creditNote(invoiceId: number, reason: string, amount: string | null): Observable<InvoiceSummary> {
    return this.http.post<InvoiceSummary>(`${this.base}/invoices/${invoiceId}/credit-notes`, { reason, amount });
  }

  invoicePdf(invoiceId: number): Observable<Blob> {
    return this.http.get(`${this.base}/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  }

  labelPdf(orderId: number): Observable<Blob> {
    return this.http.get(`${this.base}/orders/${orderId}/label.pdf`, { responseType: 'blob' });
  }
}

/**
 * Opens or downloads a PDF fetched with auth. For "view", the tab is opened synchronously (inside the
 * click) so pop-up blockers allow it, then pointed at the blob once it arrives.
 */
export function openPdf(
  request: Observable<Blob>,
  mode: 'view' | 'download',
  filename: string,
  onError: (err: unknown) => void,
): void {
  const tab = mode === 'view' ? window.open('', '_blank') : null;
  request.subscribe({
    next: (blob) => {
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      if (tab) {
        tab.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    error: (err: unknown) => {
      tab?.close();
      onError(err);
    },
  });
}
