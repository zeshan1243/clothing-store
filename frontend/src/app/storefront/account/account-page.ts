import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { AccountOrder, CustomerAuthService } from '../../core/customer-auth.service';
import { TranslationKey } from '../../core/i18n/en';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalDatePipe, TranslatePipe, TranslatePluralPipe } from '../../core/i18n/translate.pipe';
import { DeliveryArea, OrdersService } from '../../core/orders.service';
import { QarPipe, formatQar } from '../../core/qar.pipe';
import { SeoService } from '../../core/seo.service';
import { Icon } from '../../shared/icon/icon';
import { Select, SelectOption } from '../../shared/select/select';
import { ToastService } from '../../shared/toast/toast.service';

type Tab = 'orders' | 'profile' | 'password';

/** /account — order history, profile (with saved address) and password. Signed-in only. */
@Component({
  selector: 'app-account-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, TranslatePluralPipe, LocalDatePipe, QarPipe, Icon, Select],
  templateUrl: './account-page.html',
  styleUrl: './account-page.scss',
})
export class AccountPage {
  protected readonly auth = inject(CustomerAuthService);
  private readonly orders = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** ?tab=profile|password */
  readonly tabParam = input<string>(undefined, { alias: 'tab' });
  protected readonly tab = signal<Tab>('orders');
  protected readonly tabs: { key: Tab; label: TranslationKey }[] = [
    { key: 'orders', label: 'account.tabOrders' },
    { key: 'profile', label: 'account.tabProfile' },
    { key: 'password', label: 'account.tabPassword' },
  ];

  protected readonly orderList = signal<AccountOrder[] | null>(null);
  protected readonly ordersError = signal(false);
  protected readonly areas = signal<DeliveryArea[]>([]);
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly profileForm = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    area: [''],
    zone: [''],
    street: [''],
    building: [''],
    unit: [''],
    landmark: [''],
    instructions: [''],
  });
  protected readonly passwordForm = this.fb.group({
    current_password: ['', Validators.required],
    new_password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });

  protected readonly areaOptions = computed<SelectOption<string>[]>(() => {
    const ar = this.i18n.isArabic();
    return [
      { value: '', label: '—' },
      ...this.areas().map((a) => ({
        value: a.name,
        label: (ar && a.name_ar) || a.name,
        hint: a.is_free ? translate('common.free') : formatQar(a.fee, ar),
      })),
    ];
  });

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      this.i18n.lang();
      seo.set(translate('account.title'));
      seo.setRobots(false);
    });
    if (!this.auth.signedIn()) {
      void this.router.navigate(['/account/login'], { queryParams: { returnUrl: '/account' }, replaceUrl: true });
      return;
    }
    // A temporary password from the team must be replaced first.
    effect(() => {
      const wanted = this.tabParam();
      const mustChange = this.auth.customer()?.must_change_password;
      this.tab.set(mustChange ? 'password' : wanted === 'profile' || wanted === 'password' ? wanted : this.tab());
    });
    // Signed out (here, or because the session ended) → back to sign in.
    effect(() => {
      if (!this.auth.signedIn()) void this.router.navigate(['/account/login'], { replaceUrl: true });
    });
    this.auth.refresh();
    this.loadOrders();
    this.orders.deliveryAreas().subscribe({ next: (a) => this.areas.set(a) });
    this.fillProfile();
  }

  protected setTab(tab: Tab): void {
    if (this.auth.customer()?.must_change_password && tab !== 'password') return;
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'orders' ? null : tab }, replaceUrl: true });
  }

  protected statusKey(prefix: 'track.status.' | 'track.pay.', value: string): TranslationKey {
    return `${prefix}${value}` as TranslationKey;
  }

  protected invalid(form: 'profile' | 'password', name: string): boolean {
    const group: { get(path: string): { invalid: boolean; touched: boolean } | null } =
      form === 'profile' ? this.profileForm : this.passwordForm;
    const c = group.get(name);
    return !!c && c.invalid && c.touched;
  }

  protected saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const v = this.profileForm.getRawValue();
    const opt = (s: string) => s.trim() || null;
    const address = {
      area: opt(v.area), zone: opt(v.zone), street: opt(v.street), building: opt(v.building),
      unit: opt(v.unit), landmark: opt(v.landmark), instructions: opt(v.instructions),
    };
    this.savingProfile.set(true);
    this.auth
      .updateProfile({ full_name: v.full_name.trim(), email: opt(v.email), default_address: Object.values(address).some(Boolean) ? address : null })
      .subscribe({
        next: () => {
          this.savingProfile.set(false);
          this.profileForm.markAsPristine();
          this.toast.show(translate('account.saved'), { tone: 'success' });
        },
        error: (err: unknown) => {
          this.savingProfile.set(false);
          this.toast.show(apiErrorMessage(err), { tone: 'error' }, 5000);
        },
      });
  }

  protected changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const v = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.auth.changePassword(v.current_password, v.new_password).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordForm.reset();
        this.toast.show(translate('account.passwordChanged'), { tone: 'success' });
        this.setTab('orders');
      },
      error: (err: unknown) => {
        this.savingPassword.set(false);
        this.passwordError.set(
          err instanceof HttpErrorResponse && err.status === 400 ? translate('account.wrongCurrent') : apiErrorMessage(err),
        );
      },
    });
  }

  protected prettyPhone(e164: string): string {
    return e164.replace(/^\+974(\d{4})(\d{4})$/, '+974 $1 $2');
  }

  protected signOut(): void {
    this.auth.clear();
    void this.router.navigateByUrl('/');
  }

  private loadOrders(): void {
    this.auth.orders().subscribe({
      next: (list) => this.orderList.set(list),
      error: () => this.ordersError.set(true),
    });
  }

  private fillProfile(): void {
    const c = this.auth.customer();
    if (!c) return;
    const a = c.default_address ?? {};
    this.profileForm.reset({
      full_name: c.full_name,
      email: c.email ?? '',
      area: a.area ?? '',
      zone: a.zone ?? '',
      street: a.street ?? '',
      building: a.building ?? '',
      unit: a.unit ?? '',
      landmark: a.landmark ?? '',
      instructions: a.instructions ?? '',
    });
  }
}

