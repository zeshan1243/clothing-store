import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { QarPipe } from '../../core/qar.pipe';
import { AdminOrdersService, DashboardData, qatarToday } from '../admin-orders.service';
import { money } from '../admin-suppliers.service';

type Period = 'today' | '7d' | '30d' | 'month' | 'custom';

@Component({
  selector: 'app-admin-dashboard',
  imports: [FormsModule, RouterLink, QarPipe],
  templateUrl: './admin-dashboard.html',
  styleUrls: ['../admin-shared.scss', './admin-dashboard.scss'],
})
export class AdminDashboard implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(AdminOrdersService);

  protected readonly supplierMoney = money;
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  protected period: Period = 'today';
  protected dateFrom = qatarToday();
  protected dateTo = qatarToday();

  ngOnInit(): void {
    this.load();
  }

  protected setPeriod(period: Period): void {
    this.period = period;
    const today = qatarToday();
    if (period === 'today') this.dateFrom = today;
    if (period === '7d') this.dateFrom = qatarToday(-6);
    if (period === '30d') this.dateFrom = qatarToday(-29);
    if (period === 'month') this.dateFrom = today.slice(0, 8) + '01';
    if (period !== 'custom') {
      this.dateTo = today;
      this.load();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.api.dashboard(this.dateFrom, this.dateTo).subscribe({
      next: (d) => {
        this.data.set(d);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected openTab(tab: string): void {
    try {
      sessionStorage.setItem('admin_orders_tab', tab);
    } catch {
      // ignore
    }
  }
}
