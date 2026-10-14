import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { apiErrorMessage } from '../../core/api-error';
import { AdminCatalogService, AdminCategory } from '../admin-catalog.service';
import { AdminToastService } from '../shared/admin-toast.service';

@Component({
  selector: 'app-admin-categories',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page-head"><h1>Categories</h1></div>

    @if (error(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    }

    <form class="panel" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <h2>{{ editingId() ? 'Edit category' : 'Add category' }}</h2>
      <div class="form-grid">
        <div class="field">
          <label for="cat-name">Name (English)</label>
          <input id="cat-name" formControlName="name" [attr.aria-invalid]="form.controls.name.touched && form.controls.name.invalid" />
        </div>
        <div class="field">
          <label for="cat-name-ar">Name (Arabic) <span class="muted">(optional)</span></label>
          <input id="cat-name-ar" formControlName="name_ar" dir="rtl" lang="ar" placeholder="مثال: هوديز" />
        </div>
        <div class="field">
          <label for="cat-slug">URL slug <span class="muted">(blank = from name)</span></label>
          <input id="cat-slug" formControlName="slug" />
        </div>
        <div class="field">
          <label for="cat-desc">Description (English)</label>
          <input id="cat-desc" formControlName="description" />
        </div>
        <div class="field">
          <label for="cat-desc-ar">Description (Arabic) <span class="muted">(optional)</span></label>
          <input id="cat-desc-ar" formControlName="description_ar" dir="rtl" lang="ar" />
        </div>
        <div class="field span-2">
          <label for="cat-image">Tile image URL <span class="muted">(optional — blank uses a product photo from this category)</span></label>
          <div class="image-row">
            @if (form.controls.image_url.value) {
              <img class="thumb" [src]="form.controls.image_url.value" alt="" />
            }
            <input id="cat-image" type="url" formControlName="image_url" placeholder="https://res.cloudinary.com/…" />
          </div>
        </div>
        <div class="field">
          <label for="cat-order">Display order</label>
          <input id="cat-order" type="number" formControlName="sort_order" />
        </div>
        <label class="checkbox"><input type="checkbox" formControlName="is_active" /> Visible in store</label>
      </div>
      <button type="submit" class="btn btn--small" [disabled]="saving()">{{ editingId() ? 'Save changes' : 'Add category' }}</button>
      @if (editingId()) {
        <button type="button" class="btn btn--secondary btn--small cancel" (click)="reset()">Cancel</button>
      }
    </form>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Image</span></th>
            <th scope="col">Name</th>
            <th scope="col">Slug</th>
            <th scope="col" class="num">Order</th>
            <th scope="col" class="num">Products</th>
            <th scope="col">Visible</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (c of categories(); track c.id) {
            <tr>
              <td class="thumb-cell">
                @if (c.image_url) { <img class="thumb" [src]="c.image_url" alt="" /> } @else { <span class="muted small">Auto</span> }
              </td>
              <td><strong>{{ c.name }}</strong></td>
              <td>{{ c.slug }}</td>
              <td class="num">{{ c.sort_order }}</td>
              <td class="num">{{ c.product_count }}</td>
              <td>{{ c.is_active ? 'Yes' : 'No' }}</td>
              <td><button type="button" class="btn btn--secondary btn--small" (click)="edit(c)">Edit</button></td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty-state">No categories yet.</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: '../admin-shared.scss',
  styles: `
    .cancel { margin-left: var(--space-2); }
    .image-row { display: flex; gap: var(--space-3); align-items: center; }
    .image-row input { flex: 1; min-width: 0; }
    .thumb { width: 44px; height: 55px; object-fit: cover; border-radius: var(--radius-sm); background: var(--surface); flex: none; }
    .thumb-cell { width: 60px; }
    .small { font-size: 12px; }
  `,
})
export class AdminCategories implements OnInit {
  private readonly toast = inject(AdminToastService);
  private readonly api = inject(AdminCatalogService);

  protected readonly categories = signal<AdminCategory[]>([]);
  protected readonly editingId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    name_ar: ['', Validators.maxLength(120)],
    slug: [''],
    description: [''],
    description_ar: [''],
    image_url: ['', Validators.pattern(/^https?:\/\/\S+$/)],
    sort_order: [0],
    is_active: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  protected edit(category: AdminCategory): void {
    this.editingId.set(category.id);
    this.form.setValue({
      name: category.name,
      name_ar: category.name_ar ?? '',
      slug: category.slug,
      description: category.description ?? '',
      description_ar: category.description_ar ?? '',
      image_url: category.image_url ?? '',
      sort_order: category.sort_order,
      is_active: category.is_active,
    });
  }

  protected reset(): void {
    this.editingId.set(null);
    this.form.reset();
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const body = {
      name: v.name.trim(),
      name_ar: v.name_ar.trim() || null,
      slug: v.slug.trim() || null,
      description: v.description.trim() || null,
      description_ar: v.description_ar.trim() || null,
      image_url: v.image_url.trim() || null,
      sort_order: Number(v.sort_order) || 0,
      is_active: v.is_active,
    };
    const id = this.editingId();
    this.saving.set(true);
    (id ? this.api.updateCategory(id, body) : this.api.createCategory(body)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.error.set(null);
        this.toast.success(id ? `${saved.name} saved.` : `${saved.name} added.`);
        this.reset();
        this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the category.'));
      },
    });
  }

  private load(): void {
    this.api.categories().subscribe({
      next: (c) => this.categories.set(c),
      error: (err: unknown) => this.error.set(apiErrorMessage(err)),
    });
  }
}
