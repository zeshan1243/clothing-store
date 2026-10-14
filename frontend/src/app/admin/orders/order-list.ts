import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import {
  AdminOrdersService,
  AdminRef,
  ORDER_STATUS_LABELS,
  OrderListPage,
  OrderStatus,
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
} from '../admin-orders.service';
import { formatQatarPhone } from './contact-links';
import { Select, SelectOption } from '../../shared/select/select';

interface Tab {
  key: string;
  label: string;
  statuses: OrderStatus[];
}

const TABS: Tab[] = [
  { key: 'new', label: 'New', statuses: ['PLACED'] },
  { key: 'todo', label: 'To deliver', statuses: ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY'] },
  { key: 'failed', label: 'Failed', statuses: ['DELIVERY_FAILED'] },
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED', 'RETURN_REQUESTED'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
  { key: 'all', label: 'All', statuses: [] },
];

@Component({
  selector: 'app-admin-order-list',
  imports: [FormsModule, RouterLink, DatePipe, QarPipe, Select],
  templateUrl: './order-list.html',
  styleUrls: ['../admin-shared.scss', './order-list.scss'],
})
export class AdminOrderList implements OnInit {
  protected readonly paymentOptions: SelectOption<PaymentStatus | ''>[] = [
    { value: '', label: 'Any payment' },
    ...(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((p) => ({ value: p, label: PAYMENT_STATUS_LABELS[p] })),
  ];
  protected readonly assignedOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'Anyone' },
    ...this.admins().map((a) => ({ value: a.id, label: a.name })),
  ]);
  private readonly api = inject(AdminOrdersService);

  protected readonly tabs = TABS;
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly paymentLabels = PAYMENT_STATUS_LABELS;
  protected readonly paymentStatuses = Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[];
  protected readonly phone = formatQatarPhone;

  protected readonly result = signal<OrderListPage | null>(null);
  protected readonly admins = signal<AdminRef[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly activeTab = signal<string>(readTab());
  protected readonly page = signal(1);
  protected readonly totalPages = computed(() => {
    const r = this.result();
    return r ? Math.max(1, Math.ceil(r.total / r.page_size)) : 1;
  });

  protected q = '';
  protected paymentStatus: PaymentStatus | '' = '';
  protected assignedTo: number | null = null;
  protected dateFrom = '';
  protected dateTo = '';

  ngOnInit(): void {
    this.api.admins().subscribe({ next: (a) => this.admins.set(a) });
    this.load();
  }

  protected selectTab(key: string): void {
    this.activeTab.set(key);
    try {
      sessionStorage.setItem('admin_orders_tab', key);
    } catch {
      // ignore
    }
    this.page.set(1);
    this.load();
  }

  protected search(): void {
    this.page.set(1);
    this.load();
  }

  protected clearFilters(): void {
    this.q = '';
    this.paymentStatus = '';
    this.assignedTo = null;
    this.dateFrom = '';
    this.dateTo = '';
    this.search();
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
  }

  protected load(): void {
    const tab = TABS.find((t) => t.key === this.activeTab()) ?? TABS[0];
    this.loading.set(true);
    this.api
      .list({
        q: this.q.trim(),
        status: tab.statuses,
        payment_status: this.paymentStatus,
        assigned_admin_id: this.assignedTo,
        date_from: this.dateFrom,
        date_to: this.dateTo,
        page: this.page(),
      })
      .subscribe({
        next: (r) => {
          this.result.set(r);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err: unknown) => {
          this.error.set(apiErrorMessage(err));
          this.loading.set(false);
        },
      });
  }
}

function readTab(): string {
  try {
    return sessionStorage.getItem('admin_orders_tab') ?? 'new';
  } catch {
    return 'new';
  }
}
