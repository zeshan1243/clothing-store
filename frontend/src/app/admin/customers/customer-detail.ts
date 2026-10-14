import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import { qatarMobile } from '../../core/validators';
import { Icon } from '../../shared/icon/icon';
import { AdminCustomerDetail, AdminCustomersService } from '../admin-customers.service';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../admin-orders.service';
import { formatQatarPhone, whatsappLink } from '../orders/contact-links';
import { AdminToastService } from '../shared/admin-toast.service';

/** One customer: profile, account actions (verify phone, reset password, delete login) and orders. */
@Component({
  selector: 'app-admin-customer-detail',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, QarPipe, Icon],
  templateUrl: './customer-detail.html',
  styleUrls: ['../admin-shared.scss', './customer-detail.scss'],
})
export class AdminCustomerDetailPage implements OnInit {
  private readonly api = inject(AdminCustomersService);
  private readonly toast = inject(AdminToastService);

  readonly id = input.required<string>();

  protected readonly customer = signal<AdminCustomerDetail | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  /** Shown once after a reset so it can be sent to the customer. */
  protected readonly tempPassword = signal<string | null>(null);
  protected readonly statusLabels = ORDER_STATUS_LABELS;
  protected readonly paymentLabels = PAYMENT_STATUS_LABELS;
  protected readonly phone = formatQatarPhone;

  protected readonly form = inject(NonNullableFormBuilder).group({
    full_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    phone: ['', [Validators.required, qatarMobile]],
    email: ['', [Validators.email]],
    phone_verified: [false],
  });

  protected readonly addressLines = computed(() => {
    const a = this.customer()?.default_address;
    if (!a) return null;
    const line2 = [a.zone && `Zone ${a.zone}`, a.street && `Street ${a.street}`, a.building && `Building ${a.building}`, a.unit]
      .filter(Boolean)
      .join(' · ');
    return [a.area, line2, a.landmark, a.instructions].filter(Boolean) as string[];
  });

  protected readonly tempWhatsapp = computed(() => {
    const c = this.customer();
    const pw = this.tempPassword();
    if (!c || !pw) return null;
    const message =
      `Hi ${c.full_name.split(' ')[0]}! Your temporary password is: ${pw}\n` +
      `Sign in at ${location.origin}/account/login with your phone number and this password — you'll be asked to choose a new one.`;
    return whatsappLink(c.phone, message);
  });

  ngOnInit(): void {
    this.load();
  }

  protected startEdit(): void {
    const c = this.customer();
    if (!c) return;
    this.form.reset({ full_name: c.full_name, phone: c.phone, email: c.email ?? '', phone_verified: c.phone_verified });
    this.editing.set(true);
  }

  protected save(): void {
    const c = this.customer();
    if (!c) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api.update(c.id, { full_name: v.full_name.trim(), phone: v.phone.trim(), email: v.email.trim() || null, phone_verified: v.phone_verified }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.customer.set(updated);
        this.editing.set(false);
        this.toast.success(`${updated.full_name} saved.`);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(e, 'Could not save the customer.'));
      },
    });
  }

  /** Quick action (without opening the edit form). */
  protected verifyPhone(): void {
    const c = this.customer();
    if (!c) return;
    if (!confirm(`Confirm that ${formatQatarPhone(c.phone)} belongs to ${c.full_name}?\nTheir earlier guest orders will appear in their account.`)) return;
    this.busy.set(true);
    this.api.update(c.id, { full_name: c.full_name, phone: c.phone, email: c.email, phone_verified: true }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.customer.set(updated);
        this.toast.success('Phone verified. Earlier guest orders now show in their account.');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(e));
      },
    });
  }

  protected resetPassword(): void {
    const c = this.customer();
    if (!c) return;
    if (!confirm(`Reset the password for ${c.full_name}?\nThey'll be signed out and must use the temporary password, then choose a new one.`)) return;
    this.busy.set(true);
    this.api.resetPassword(c.id).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.tempPassword.set(r.temporary_password);
        this.toast.success('Temporary password created. Send it to the customer.');
        this.load();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(e));
      },
    });
  }

  protected async copyTemp(): Promise<void> {
    const pw = this.tempPassword();
    if (!pw) return;
    try {
      await navigator.clipboard.writeText(pw);
      this.toast.info('Copied.');
    } catch {
      this.toast.error('Could not copy. Select the password and copy it manually.');
    }
  }

  protected deleteAccount(): void {
    const c = this.customer();
    if (!c) return;
    if (!confirm(`Delete the account of ${c.full_name}?\nTheir login, saved address and verification are removed. Orders stay for your records and they can register again later.`)) return;
    this.busy.set(true);
    this.api.deleteAccount(c.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.customer.set(updated);
        this.tempPassword.set(null);
        this.toast.success('Account deleted. Orders are kept.');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(e));
      },
    });
  }

  protected invalid(name: 'full_name' | 'phone' | 'email'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  private load(): void {
    this.api.get(Number(this.id())).subscribe({
      next: (c) => this.customer.set(c),
      error: (e: unknown) => this.error.set(apiErrorMessage(e, 'Could not load the customer.')),
    });
  }
}
