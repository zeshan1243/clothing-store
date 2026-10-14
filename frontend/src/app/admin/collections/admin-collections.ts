import { LowerCasePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { apiErrorMessage } from '../../core/api-error';
import { QarPipe } from '../../core/qar.pipe';
import { AdminCatalogService, AdminCollection, AdminProductListItem } from '../admin-catalog.service';
import { AdminToastService } from '../shared/admin-toast.service';

/** Collections: hand-picked groups of products (drops, edits, sets), shown at /collections/:slug. */
@Component({
  selector: 'app-admin-collections',
  imports: [ReactiveFormsModule, FormsModule, LowerCasePipe, QarPipe],
  templateUrl: './admin-collections.html',
  styleUrls: ['../admin-shared.scss', './admin-collections.scss'],
})
export class AdminCollections implements OnInit {
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminCatalogService);

  protected readonly collections = signal<AdminCollection[]>([]);
  protected readonly products = signal<AdminProductListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** null = list only; 'new' or the collection being edited. */
  protected readonly editing = signal<AdminCollection | 'new' | null>(null);

  protected readonly selected = signal<Set<number>>(new Set());
  protected readonly search = signal('');
  protected readonly onlySelected = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    name_ar: ['', Validators.maxLength(160)],
    slug: ['', Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
    description: [''],
    description_ar: [''],
    image_url: ['', Validators.pattern(/^https?:\/\/\S+$/)],
    is_active: [true],
    is_featured: [false],
    sort_order: [0],
  });

  protected readonly isNew = computed(() => this.editing() === 'new');
  protected readonly productById = computed(() => new Map(this.products().map((p) => [p.id, p])));

  /** Picker list: selected products first, then the rest; filtered by name/category. */
  protected readonly pickerProducts = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sel = this.selected();
    return this.products()
      .filter((p) => !this.onlySelected() || sel.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.category_name ?? '').toLowerCase().includes(q))
      .sort((a, b) => Number(sel.has(b.id)) - Number(sel.has(a.id)));
  });

  ngOnInit(): void {
    this.load();
    this.api.products().subscribe({ next: (p) => this.products.set(p) });
  }

  protected thumbs(c: AdminCollection): AdminProductListItem[] {
    const byId = this.productById();
    return c.product_ids.map((id) => byId.get(id)).filter((p): p is AdminProductListItem => !!p).slice(0, 4);
  }

  protected startNew(): void {
    this.form.reset({ is_active: true, is_featured: false, sort_order: 0 });
    this.selected.set(new Set());
    this.resetPicker();
    this.error.set(null);
    this.editing.set('new');
  }

  protected edit(c: AdminCollection): void {
    this.form.reset({
      name: c.name,
      name_ar: c.name_ar ?? '',
      slug: c.slug,
      description: c.description ?? '',
      description_ar: c.description_ar ?? '',
      image_url: c.image_url ?? '',
      is_active: c.is_active,
      is_featured: c.is_featured,
      sort_order: c.sort_order,
    });
    this.selected.set(new Set(c.product_ids));
    this.resetPicker();
    this.error.set(null);
    this.editing.set(c);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected toggleProduct(id: number): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleFlag(c: AdminCollection, flag: 'is_active' | 'is_featured'): void {
    this.api.updateCollection(c.id, { [flag]: !c[flag] }).subscribe({
      next: () => this.afterSave(`${c.name} updated.`),
      error: (e: unknown) => this.toast.error(apiErrorMessage(e)),
    });
  }

  protected remove(c: AdminCollection): void {
    if (!confirm(`Delete the collection "${c.name}"? Its products are not affected.`)) return;
    this.api.deleteCollection(c.id).subscribe({
      next: () => {
        if (this.editing() !== 'new' && (this.editing() as AdminCollection | null)?.id === c.id) this.editing.set(null);
        this.afterSave(`${c.name} deleted.`);
      },
      error: (e: unknown) => this.toast.error(apiErrorMessage(e)),
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const v = this.form.getRawValue();
    const opt = (x: string) => x.trim() || null;
    // Keep the order the admin sees (selected products sorted by the product list order).
    const ids = this.products().map((p) => p.id).filter((id) => this.selected().has(id));
    const body = {
      name: v.name.trim(),
      name_ar: opt(v.name_ar),
      slug: opt(v.slug),
      description: opt(v.description),
      description_ar: opt(v.description_ar),
      image_url: opt(v.image_url),
      is_active: v.is_active,
      is_featured: v.is_featured,
      sort_order: Number(v.sort_order) || 0,
      product_ids: ids,
    };
    const current = this.editing();
    this.saving.set(true);
    (current && current !== 'new' ? this.api.updateCollection(current.id, body) : this.api.createCollection(body)).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.editing.set(null);
        this.afterSave(current === 'new' ? `${c.name} created.` : `${c.name} saved.`);
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(e, 'Could not save the collection.'));
      },
    });
  }

  private resetPicker(): void {
    this.search.set('');
    this.onlySelected.set(false);
  }

  private afterSave(message: string): void {
    this.error.set(null);
    this.toast.success(message);
    this.load();
  }

  private load(): void {
    this.api.collections().subscribe({
      next: (c) => {
        this.collections.set(c);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.error.set(apiErrorMessage(e));
        this.loading.set(false);
      },
    });
  }
}
