import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import { Pager, pageOf } from '../shared/pager';
import { AdminToastService } from '../shared/admin-toast.service';

interface AdminArea {
  id: number;
  name: string;
  name_ar: string | null;
  distance_km: number;
  /** Charge set by hand (overrides the distance formula); null = automatic. */
  fixed_fee: string | null;
  is_free: boolean;
  is_active: boolean;
  fee: string;
  distance_fee: string;
}

interface Rates {
  outside_base_fee: string;
  fee_per_step: string;
  step_km: number;
}

/** Editable copy of an area; fixed_fee is the raw input text ('' = automatic). */
interface Draft {
  name: string;
  name_ar: string | null;
  distance_km: number;
  fixed_fee: string;
  is_free: boolean;
  is_active: boolean;
}

type Filter = 'all' | 'free' | 'paid' | 'fixed' | 'hidden';

const MONEY = /^\d{1,4}(\.\d{1,2})?$/;

/** Delivery areas across Qatar: free zone, distance from central Doha, or a charge set by hand. */
@Component({
  selector: 'app-admin-delivery',
  imports: [FormsModule, QarPipe, Pager],
  templateUrl: './admin-delivery.html',
  styleUrls: ['../admin-shared.scss', './admin-delivery.scss'],
})
export class AdminDelivery implements OnInit {
  private readonly toast = inject(AdminToastService);
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin/delivery-areas`;

  protected readonly areas = signal<AdminArea[]>([]);
  protected readonly rates = signal<Rates | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly adding = signal(false);
  /** Unsaved edits per area id. */
  protected readonly drafts = signal<Record<number, Draft>>({});
  protected newArea: Draft = blankDraft();

  protected readonly filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'free', label: 'Free zone' },
    { key: 'paid', label: 'Charged' },
    { key: 'fixed', label: 'Manual charge' },
    { key: 'hidden', label: 'Hidden' },
  ];

  protected readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.areas()
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.name_ar ?? '').includes(q))
      .filter(
        (a) =>
          f === 'all' ||
          (f === 'free' && a.is_free) ||
          (f === 'paid' && !a.is_free) ||
          (f === 'fixed' && a.fixed_fee !== null && !a.is_free) ||
          (f === 'hidden' && !a.is_active),
      );
  });
  protected readonly visible = computed(() => pageOf(this.filtered(), this.page(), this.pageSize()));
  protected readonly counts = computed(() => {
    const list = this.areas();
    return {
      free: list.filter((a) => a.is_free && a.is_active).length,
      paid: list.filter((a) => !a.is_free && a.is_active).length,
      fixed: list.filter((a) => a.fixed_fee !== null && !a.is_free).length,
    };
  });
  protected readonly unsaved = computed(() => Object.keys(this.drafts()).length);

  ngOnInit(): void {
    this.load();
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected setFilter(value: Filter): void {
    this.filter.set(value);
    this.page.set(1);
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  protected value(a: AdminArea): Draft {
    return this.drafts()[a.id] ?? toDraft(a);
  }

  protected change(a: AdminArea, patch: Partial<Draft>): void {
    const current = this.value(a);
    this.drafts.update((d) => ({ ...d, [a.id]: { ...current, ...patch } }));
  }

  protected dirty(a: AdminArea): boolean {
    return a.id in this.drafts();
  }

  protected feeInvalid(d: Draft): boolean {
    return d.fixed_fee.trim() !== '' && !MONEY.test(d.fixed_fee.trim());
  }

  /** Automatic fee for a distance, using the server's rates. */
  protected autoFee(distanceKm: number): number {
    const r = this.rates();
    if (!r) return 0;
    return Number(r.outside_base_fee) + Number(r.fee_per_step) * Math.ceil((Number(distanceKm) || 0) / r.step_km);
  }

  /** What the customer will pay with this draft. */
  protected previewFee(d: Draft): number {
    if (d.is_free) return 0;
    if (d.fixed_fee.trim() !== '' && MONEY.test(d.fixed_fee.trim())) return Number(d.fixed_fee);
    return this.autoFee(d.distance_km);
  }

  protected save(a: AdminArea): void {
    const d = this.value(a);
    if (this.feeInvalid(d)) {
      this.toast.error(`Check the charge for ${a.name}: use a number like 25 or 25.50.`);
      return;
    }
    this.http.patch<AdminArea>(`${this.base}/${a.id}`, toBody(d)).subscribe({
      next: (saved) => {
        this.areas.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
        this.discard(a);
        this.notify(`${saved.name}: customers now pay ${Number(saved.fee) ? 'QAR ' + saved.fee : 'nothing (free delivery)'}.`);
      },
      error: (e: unknown) => this.toast.error(apiErrorMessage(e)),
    });
  }

  protected discard(a: AdminArea): void {
    this.drafts.update((all) => {
      const { [a.id]: _, ...rest } = all;
      return rest;
    });
  }

  protected add(): void {
    const d = this.newArea;
    if (d.name.trim().length < 2) {
      this.toast.error('Enter the area name.');
      return;
    }
    if (this.feeInvalid(d)) {
      this.toast.error('Check the charge: use a number like 25 or 25.50, or leave it blank for automatic.');
      return;
    }
    this.http.post<AdminArea>(this.base, toBody(d)).subscribe({
      next: (created) => {
        this.newArea = blankDraft();
        this.adding.set(false);
        this.notify(`${created.name} added.`);
        this.load();
      },
      error: (e: unknown) => this.toast.error(apiErrorMessage(e)),
    });
  }

  private notify(message: string): void {
    this.error.set(null);
    this.toast.success(message);
  }

  private load(): void {
    this.http.get<{ rates: Rates; areas: AdminArea[] }>(this.base).subscribe({
      next: (page) => {
        this.rates.set(page.rates);
        this.areas.set(page.areas);
      },
      error: (e: unknown) => this.error.set(apiErrorMessage(e)),
    });
  }
}

function blankDraft(): Draft {
  return { name: '', name_ar: '', distance_km: 0, fixed_fee: '', is_free: false, is_active: true };
}

function toDraft(a: AdminArea): Draft {
  return {
    name: a.name,
    name_ar: a.name_ar,
    distance_km: a.distance_km,
    fixed_fee: a.fixed_fee === null ? '' : String(Number(a.fixed_fee)),
    is_free: a.is_free,
    is_active: a.is_active,
  };
}

function toBody(d: Draft) {
  return {
    name: d.name.trim(),
    name_ar: d.name_ar?.trim() || null,
    distance_km: Number(d.distance_km) || 0,
    fixed_fee: d.fixed_fee.trim() === '' ? null : d.fixed_fee.trim(),
    is_free: d.is_free,
    is_active: d.is_active,
  };
}
