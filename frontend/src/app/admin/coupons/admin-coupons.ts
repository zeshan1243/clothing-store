import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import {
  AdminCoupon,
  AdminCouponDetail,
  AdminCouponsService,
  CouponState,
  CouponType,
} from '../admin-coupons.service';
import { AdminToastService } from '../shared/admin-toast.service';

const STATE_LABELS: Record<CouponState, string> = {
  active: 'Active',
  scheduled: 'Scheduled',
  expired: 'Expired',
  used_up: 'Used up',
  inactive: 'Off',
};

/** Convert between the API's ISO timestamps and <input type="datetime-local"> (Doha time, UTC+3). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const doha = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return doha.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  return value ? `${value}:00+03:00` : null;
}

@Component({
  selector: 'app-admin-coupons',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, QarPipe],
  templateUrl: './admin-coupons.html',
  styleUrls: ['../admin-shared.scss', './admin-coupons.scss'],
})
export class AdminCoupons implements OnInit {
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminCouponsService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly coupons = signal<AdminCoupon[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly editing = signal<AdminCouponDetail | 'new' | null>(null);
  protected readonly stateLabels = STATE_LABELS;

  protected readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{3,32}$/)]],
    description: [''],
    discount_type: this.fb.control<CouponType>('PERCENT'),
    value: ['10', Validators.pattern(/^\d+(\.\d{1,2})?$/)],
    max_discount: ['', Validators.pattern(/^\d+(\.\d{1,2})?$/)],
    min_subtotal: ['', Validators.pattern(/^\d+(\.\d{1,2})?$/)],
    starts_at: [''],
    ends_at: [''],
    usage_limit: this.fb.control<number | null>(null, Validators.min(1)),
    per_customer_limit: this.fb.control<number | null>(1, Validators.min(1)),
    is_active: [true],
  });

  protected readonly type = signal<CouponType>('PERCENT');
  protected readonly isNew = computed(() => this.editing() === 'new');
  protected readonly detail = computed(() => {
    const e = this.editing();
    return e && e !== 'new' ? e : null;
  });

  constructor() {
    this.form.controls.discount_type.valueChanges.subscribe((t) => this.type.set(t));
  }

  ngOnInit(): void {
    this.load();
  }

  protected describe(c: AdminCoupon): string {
    if (c.discount_type === 'FREE_DELIVERY') return 'Free delivery';
    if (c.discount_type === 'FIXED') return `QAR ${Number(c.value).toFixed(2)} off`;
    const cap = c.max_discount ? ` (max QAR ${Number(c.max_discount).toFixed(0)})` : '';
    return `${Number(c.value)}% off${cap}`;
  }

  protected rules(c: AdminCoupon): string {
    const parts: string[] = [];
    if (c.min_subtotal) parts.push(`min QAR ${Number(c.min_subtotal).toFixed(0)}`);
    if (c.per_customer_limit) parts.push(`${c.per_customer_limit}× per customer`);
    if (c.ends_at) parts.push(`ends ${new Date(c.ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`);
    return parts.join(' · ') || 'No restrictions';
  }

  protected startNew(): void {
    this.form.reset({
      code: '', description: '', discount_type: 'PERCENT', value: '10', max_discount: '', min_subtotal: '',
      starts_at: '', ends_at: '', usage_limit: null, per_customer_limit: 1, is_active: true,
    });
    this.form.controls.code.enable();
    this.error.set(null);
    this.editing.set('new');
    this.generate();
  }

  protected edit(c: AdminCoupon): void {
    this.error.set(null);
    this.api.get(c.id).subscribe({
      next: (d) => {
        this.form.reset({
          code: d.code,
          description: d.description ?? '',
          discount_type: d.discount_type,
          value: d.discount_type === 'PERCENT' ? String(Number(d.value)) : d.value,
          max_discount: d.max_discount ?? '',
          min_subtotal: d.min_subtotal ?? '',
          starts_at: toLocalInput(d.starts_at),
          ends_at: toLocalInput(d.ends_at),
          usage_limit: d.usage_limit,
          per_customer_limit: d.per_customer_limit,
          is_active: d.is_active,
        });
        // Codes that have been used are fixed (orders and invoices reference them).
        if (d.times_used > 0) this.form.controls.code.disable();
        else this.form.controls.code.enable();
        this.editing.set(d);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: (e: unknown) => this.error.set(apiErrorMessage(e)),
    });
  }

  protected generate(): void {
    this.api.generateCode().subscribe({ next: (code) => this.form.controls.code.setValue(code) });
  }

  protected toggleActive(c: AdminCoupon): void {
    this.api.get(c.id).subscribe({
      next: (d) => {
        this.api.update(d.id, { ...this.inputFrom(d), is_active: !d.is_active }).subscribe({
          next: () => this.afterSave(d.is_active ? `${d.code} switched off.` : `${d.code} switched on.`),
          error: (e: unknown) => this.toast.error(apiErrorMessage(e)),
        });
      },
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields. Codes use 3–32 letters, numbers, dashes or underscores.');
      return;
    }
    const v = this.form.getRawValue();
    const opt = (x: string) => (x.trim() ? x.trim() : null);
    const body = {
      code: v.code.trim().toUpperCase(),
      description: opt(v.description),
      discount_type: v.discount_type,
      value: v.discount_type === 'FREE_DELIVERY' ? '0' : v.value.trim() || '0',
      max_discount: v.discount_type === 'PERCENT' ? opt(v.max_discount) : null,
      min_subtotal: opt(v.min_subtotal),
      starts_at: fromLocalInput(v.starts_at),
      ends_at: fromLocalInput(v.ends_at),
      usage_limit: v.usage_limit || null,
      per_customer_limit: v.per_customer_limit || null,
      is_active: v.is_active,
    };
    const current = this.detail();
    this.saving.set(true);
    (current ? this.api.update(current.id, body) : this.api.create(body)).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.editing.set(null);
        this.afterSave(current ? `${c.code} saved.` : `${c.code} created.`);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(e, 'Could not save the coupon.'));
      },
    });
  }

  private inputFrom(d: AdminCoupon) {
    return {
      code: d.code,
      description: d.description,
      discount_type: d.discount_type,
      value: d.value,
      max_discount: d.max_discount,
      min_subtotal: d.min_subtotal,
      starts_at: d.starts_at,
      ends_at: d.ends_at,
      usage_limit: d.usage_limit,
      per_customer_limit: d.per_customer_limit,
      is_active: d.is_active,
    };
  }

  private afterSave(message: string): void {
    this.error.set(null);
    this.toast.success(message);
    this.load();
  }

  private load(): void {
    this.api.list().subscribe({
      next: (c) => {
        this.coupons.set(c);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(apiErrorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
