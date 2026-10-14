import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import {
  AdminOrderDetail,
  AdminOrdersService,
  AdminRef,
  ORDER_STATUS_LABELS,
  OrderStatus,
  PAYMENT_STATUS_LABELS,
} from '../admin-orders.service';
import { confirmationMessage, formatQatarPhone, whatsappLink } from './contact-links';
import { OrderDocuments } from './order-documents';
import { AdminToastService } from '../shared/admin-toast.service';
import { Select, SelectOption } from '../../shared/select/select';

interface Action {
  key: string;
  label: string;
  status: OrderStatus;
  primary?: boolean;
  danger?: boolean;
  needsReason?: boolean;
  collectCash?: boolean;
  confirmText?: string;
}

/** Buttons offered for each target status (only those the API allows are shown). */
const ACTIONS: Action[] = [
  { key: 'confirm', label: 'Confirm order', status: 'CONFIRMED', primary: true,
    confirmText: 'Confirm only after speaking to the customer.' },
  { key: 'prepare', label: 'Start preparing', status: 'PREPARING' },
  { key: 'dispatch', label: 'Out for delivery', status: 'OUT_FOR_DELIVERY', primary: true },
  { key: 'delivered-paid', label: 'Delivered & cash collected', status: 'DELIVERED', primary: true, collectCash: true },
  { key: 'delivered', label: 'Delivered (cash not yet recorded)', status: 'DELIVERED' },
  { key: 'failed', label: 'Delivery failed', status: 'DELIVERY_FAILED', danger: true, needsReason: true },
  { key: 'return', label: 'Return requested', status: 'RETURN_REQUESTED' },
  { key: 'cancel', label: 'Cancel order', status: 'CANCELLED', danger: true, needsReason: true,
    confirmText: 'Reserved stock will be released back to inventory.' },
];

@Component({
  selector: 'app-admin-order-detail',
  imports: [FormsModule, RouterLink, DatePipe, QarPipe, OrderDocuments, Select],
  templateUrl: './order-detail.html',
  styleUrls: ['../admin-shared.scss', './order-detail.scss'],
})
export class AdminOrderDetailPage implements OnInit {
  protected readonly assignOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'Not assigned' },
    ...this.admins().map((a) => ({ value: a.id, label: a.name })),
  ]);
  protected readonly paymentTypeOptions = computed<SelectOption<'COD_COLLECTION' | 'REFUND'>[]>(() => [
    ...(this.canRecordCash() ? [{ value: 'COD_COLLECTION' as const, label: 'Cash collected' }] : []),
    ...(this.netCollected() > 0 ? [{ value: 'REFUND' as const, label: 'Refund' }] : []),
  ]);
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminOrdersService);

  /** Route param :id */
  readonly id = input.required<string>();

  protected readonly order = signal<AdminOrderDetail | null>(null);
  protected readonly admins = signal<AdminRef[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<Action | null>(null);
  protected readonly copied = signal(false);

  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly paymentLabels = PAYMENT_STATUS_LABELS;
  protected readonly phone = formatQatarPhone;

  protected reason = '';
  protected note = '';
  protected notesDraft = '';
  protected payment = { type: 'COD_COLLECTION' as 'COD_COLLECTION' | 'REFUND', amount: '', reference: '', notes: '' };

  protected readonly actions = computed(() => {
    const allowed = new Set(this.order()?.allowed_transitions ?? []);
    const fromReturn = this.order()?.order_status === 'RETURN_REQUESTED';
    return ACTIONS.filter((a) => allowed.has(a.status))
      .filter((a) => !(fromReturn && a.key === 'delivered-paid'))
      .map((a) => (fromReturn && a.key === 'delivered' ? { ...a, label: 'Close return (keep as delivered)' } : a))
      .map((a) =>
        this.order()?.order_status === 'DELIVERY_FAILED' && a.key === 'dispatch' ? { ...a, label: 'Retry delivery' } : a,
      );
  });

  protected readonly whatsapp = computed(() => {
    const o = this.order();
    return o ? whatsappLink(o.customer_phone, confirmationMessage(o)) : null;
  });

  protected readonly canRecordCash = computed(() => {
    const s = this.order()?.order_status;
    return s === 'OUT_FOR_DELIVERY' || s === 'DELIVERED' || s === 'RETURN_REQUESTED';
  });

  protected readonly netCollected = computed(() => {
    const o = this.order();
    return o ? (Math.round(Number(o.amount_collected) * 100) - Math.round(Number(o.amount_refunded) * 100)) / 100 : 0;
  });

  ngOnInit(): void {
    this.api.admins().subscribe({ next: (a) => this.admins.set(a) });
    this.api.get(Number(this.id())).subscribe({
      next: (o) => this.setOrder(o),
      error: (err: unknown) => this.loadError.set(apiErrorMessage(err, 'Could not load this order.')),
    });
  }

  protected start(action: Action): void {
    this.actionError.set(null);
    this.reason = '';
    this.note = '';
    this.pending.set(action);
  }

  protected runPending(): void {
    const action = this.pending();
    const order = this.order();
    if (!action || !order) return;
    if (action.needsReason && this.reason.trim().length < 3) {
      this.toast.error('Please enter a reason (at least 3 characters).');
      return;
    }
    const request =
      action.status === 'CONFIRMED'
        ? this.api.confirm(order.id, this.note.trim())
        : action.status === 'CANCELLED'
          ? this.api.cancel(order.id, this.reason.trim())
          : this.api.changeStatus(order.id, {
              status: action.status,
              note: this.note.trim() || null,
              reason: action.needsReason ? this.reason.trim() : null,
              collect_cash: !!action.collectCash,
            });
    this.run(request, `${ORDER_STATUS_LABELS[action.status]}.`);
  }

  protected assign(adminId: number | null): void {
    const order = this.order();
    if (order) this.run(this.api.assign(order.id, adminId), adminId ? 'Assigned.' : 'Unassigned.');
  }

  protected saveNotes(): void {
    const order = this.order();
    if (order) this.run(this.api.updateNotes(order.id, this.notesDraft.trim()), 'Notes saved.');
  }

  protected recordPayment(): void {
    const order = this.order();
    if (!order) return;
    if (!/^\d+(\.\d{1,2})?$/.test(this.payment.amount.trim()) || Number(this.payment.amount) <= 0) {
      this.toast.error('Enter a valid amount, e.g. 215.00');
      return;
    }
    this.run(
      this.api.addPayment(order.id, {
        type: this.payment.type,
        amount: this.payment.amount.trim(),
        reference: this.payment.reference.trim() || null,
        notes: this.payment.notes.trim() || null,
      }),
      this.payment.type === 'REFUND' ? 'Refund recorded.' : 'Cash collection recorded.',
    );
  }

  protected async copyPhone(): Promise<void> {
    const order = this.order();
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.customer_phone);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.toast.error('Could not copy. Long-press the number to copy it.');
    }
  }

  private run(request: Observable<AdminOrderDetail>, message: string): void {
    this.busy.set(true);
    this.actionError.set(null);
    request.subscribe({
      next: (o) => {
        this.setOrder(o);
        this.pending.set(null);
        this.busy.set(false);
        this.toast.success(message);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err, 'That action failed. Please try again.'));
      },
    });
  }

  private setOrder(o: AdminOrderDetail): void {
    this.order.set(o);
    this.notesDraft = o.internal_notes ?? '';
    this.payment = {
      type: Number(o.balance_due) > 0 ? 'COD_COLLECTION' : 'REFUND',
      amount: Number(o.balance_due) > 0 ? o.balance_due : '',
      reference: '',
      notes: '',
    };
  }
}
