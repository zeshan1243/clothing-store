import { Component, OnDestroy, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme.service';
import { SeoService } from '../../core/seo.service';
import { Icon, IconName } from '../../shared/icon/icon';
import { AdminToasts } from '../shared/admin-toasts';
import { Sheet } from '../../shared/sheet/sheet';

interface AdminNavItem {
  label: string;
  path: string;
  icon: IconName;
  exact?: boolean;
}

/** Admin shell (design.md §10.2): ink sidebar on desktop, bottom tab bar on mobile. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Sheet, AdminToasts],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout implements OnDestroy {
  private readonly seo = inject(SeoService);
  protected readonly auth = inject(AuthService);
  protected readonly moreOpen = signal(false);
  protected readonly brandName = environment.brandName;

  protected readonly navItems: AdminNavItem[] = [
    { label: 'Dashboard', path: '/admin', icon: 'dashboard', exact: true },
    { label: 'Orders', path: '/admin/orders', icon: 'receipt' },
    { label: 'Customers', path: '/admin/customers', icon: 'user' },
    { label: 'Products', path: '/admin/products', icon: 'shirt' },
    { label: 'Categories', path: '/admin/categories', icon: 'tags' },
    { label: 'Inventory', path: '/admin/inventory', icon: 'boxes' },
    { label: 'Collections', path: '/admin/collections', icon: 'layers' },
    { label: 'Delivery', path: '/admin/delivery', icon: 'truck' },
    { label: 'Coupons', path: '/admin/coupons', icon: 'ticket' },
    { label: 'Suppliers', path: '/admin/suppliers', icon: 'users' },
    { label: 'Supplier bills', path: '/admin/supplier-bills', icon: 'wallet' },
    { label: 'Reports', path: '/admin/reports', icon: 'chart' },
    { label: 'My account', path: '/admin/account', icon: 'user' },
  ];

  /** Mobile bottom tabs: the three daily screens + "More". */
  protected readonly tabs = this.navItems.slice(0, 3);
  protected readonly moreItems = this.navItems.slice(3);

  constructor() {
    // The admin portal is English-only (founders' tool), whatever language the shopper picked.
    inject(I18nService).setAdminScope(true);
    inject(ThemeService).setAdminScope(true);
    this.seo.setRobots(false);
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.moreOpen.set(false));
  }

  ngOnDestroy(): void {
    this.seo.setRobots(true);
  }
}
