import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { QarPipe } from '../../core/qar.pipe';
import { Icon, IconName } from '../../shared/icon/icon';
import { AdminToastService } from '../shared/admin-toast.service';

interface Activity {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  label: string | null;
  created_at: string;
}

interface Profile {
  id: number;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN';
  created_at: string;
  last_login_at: string | null;
  stats: { orders_confirmed: number; deliveries_done: number; open_assigned: number; cash_collected: string; actions_30d: number };
  recent_activity: Activity[];
  team: { id: number; name: string; role: 'OWNER' | 'ADMIN'; is_active: boolean; last_login_at: string | null }[];
}

/** Plain-English labels for audit log actions (anything else falls back to a readable version). */
const ACTIONS: Record<string, { text: string; icon: IconName }> = {
  'order.status': { text: 'Updated order status', icon: 'receipt' },
  'order.assign': { text: 'Assigned an order', icon: 'truck' },
  'order.notes': { text: 'Edited order notes', icon: 'receipt' },
  'order.payment_cod_collection': { text: 'Recorded cash collected', icon: 'banknote' },
  'order.payment_refund': { text: 'Recorded a refund', icon: 'banknote' },
  'invoice.issue': { text: 'Issued an invoice', icon: 'file-text' },
  'invoice.credit_note': { text: 'Issued a credit note', icon: 'file-text' },
  'product.create': { text: 'Added a product', icon: 'shirt' },
  'product.update': { text: 'Edited a product', icon: 'shirt' },
  'product.image_add': { text: 'Added a product image', icon: 'shirt' },
  'product.variant_delete': { text: 'Deleted a variant', icon: 'shirt' },
  'inventory.adjust': { text: 'Adjusted stock', icon: 'boxes' },
  'category.create': { text: 'Added a category', icon: 'tags' },
  'category.update': { text: 'Edited a category', icon: 'tags' },
  'collection.create': { text: 'Created a collection', icon: 'layers' },
  'collection.update': { text: 'Edited a collection', icon: 'layers' },
  'collection.delete': { text: 'Deleted a collection', icon: 'layers' },
  'coupon.create': { text: 'Created a coupon', icon: 'ticket' },
  'coupon.update': { text: 'Edited a coupon', icon: 'ticket' },
  'customer.update': { text: 'Edited a customer', icon: 'user' },
  'customer.reset_password': { text: "Reset a customer's password", icon: 'user' },
  'customer.delete_account': { text: "Deleted a customer's account", icon: 'user' },
  'delivery_area.create': { text: 'Added a delivery area', icon: 'truck' },
  'delivery_area.update': { text: 'Edited a delivery area', icon: 'truck' },
  'supplier.create': { text: 'Added a supplier', icon: 'users' },
  'supplier.update': { text: 'Edited a supplier', icon: 'users' },
  'supplier_bill.create': { text: 'Recorded a supplier bill', icon: 'wallet' },
  'supplier_bill.update': { text: 'Edited a supplier bill', icon: 'wallet' },
  'supplier_bill.payment': { text: 'Paid a supplier bill', icon: 'wallet' },
  'supplier_bill.receive': { text: 'Received stock from a supplier', icon: 'boxes' },
  'admin.change_password': { text: 'Changed your password', icon: 'user' },
  'admin.update_profile': { text: 'Updated your profile', icon: 'user' },
};

/** Where an activity entry links to in the admin. */
const LINKS: Record<string, string> = {
  order: '/admin/orders',
  product: '/admin/products',
  customer: '/admin/customers',
  supplier_bill: '/admin/supplier-bills',
};

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('new_password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-admin-account',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, QarPipe, Icon],
  templateUrl: './admin-account.html',
  styleUrls: ['../admin-shared.scss', './admin-account.scss'],
})
export class AdminAccount implements OnInit {
  private readonly toast = inject(AdminToastService);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/admin/auth`;

  protected readonly profile = signal<Profile | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly editingName = signal(false);
  protected readonly savingName = signal(false);
  protected readonly busy = signal(false);
  protected readonly showPasswords = signal(false);

  protected readonly nameForm = this.fb.group({ name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]] });
  protected readonly form = this.fb.group(
    {
      current_password: ['', Validators.required],
      new_password: ['', [Validators.required, Validators.minLength(12)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected readonly initials = computed(() =>
    (this.profile()?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join(''),
  );

  /** 0–4 strength for the new password (length and character variety). */
  protected readonly strength = signal(0);
  protected readonly strengthLabel = computed(() => ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][this.strength()]);

  ngOnInit(): void {
    this.load();
    this.form.controls.new_password.valueChanges.subscribe((pw) => this.strength.set(scorePassword(pw)));
  }

  protected describe(a: Activity): { text: string; icon: IconName } {
    if (ACTIONS[a.action]) return ACTIONS[a.action];
    const [entity, verb] = a.action.split('.');
    return { text: `${(verb ?? '').replace(/_/g, ' ')} ${entity.replace(/_/g, ' ')}`.trim().replace(/^./, (c) => c.toUpperCase()), icon: 'info' };
  }

  protected link(a: Activity): string[] | null {
    const base = LINKS[a.entity_type];
    return base && a.entity_id ? [base, String(a.entity_id)] : null;
  }

  protected startEditName(): void {
    this.nameForm.reset({ name: this.profile()?.name ?? '' });
    this.editingName.set(true);
  }

  protected saveName(): void {
    if (this.nameForm.invalid) {
      this.nameForm.markAllAsTouched();
      return;
    }
    this.savingName.set(true);
    this.http.patch<{ id: number; name: string; email: string; role: 'OWNER' | 'ADMIN'; is_active: boolean }>(`${this.base}/me`, { name: this.nameForm.getRawValue().name.trim() }).subscribe({
      next: (admin) => {
        this.savingName.set(false);
        this.editingName.set(false);
        this.auth.updateAdmin(admin);
        this.toast.success('Your name is updated.');
        this.load();
      },
      error: (err: unknown) => {
        this.savingName.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not update your name.'));
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('New password must be at least 12 characters and match the confirmation.');
      return;
    }
    const { current_password, new_password } = this.form.getRawValue();
    this.busy.set(true);
    this.http.post<void>(`${this.base}/change-password`, { current_password, new_password }).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Password changed.');
        this.form.reset();
        this.load();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not change the password.'));
      },
    });
  }

  protected invalid(name: 'current_password' | 'new_password' | 'confirm'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  private load(): void {
    this.http.get<Profile>(`${this.base}/profile`).subscribe({
      next: (p) => this.profile.set(p),
      error: (err: unknown) => this.loadError.set(apiErrorMessage(err, 'Could not load your profile.')),
    });
  }
}

function scorePassword(pw: string): number {
  if (pw.length < 12) return 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return Math.min(4, 1 + (variety >= 3 ? 2 : variety >= 2 ? 1 : 0) + (pw.length >= 16 ? 1 : 0));
}
