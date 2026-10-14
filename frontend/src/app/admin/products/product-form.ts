import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { ProductStatus, percentOff } from '../../core/catalog.models';
import {
  AdminCatalogService,
  AdminCategory,
  AdminProduct,
  AdminSizeGuide,
  ProductInput,
} from '../admin-catalog.service';
import { VariantBuilder } from './variant-builder';
import { AdminToastService } from '../shared/admin-toast.service';
import { Select, SelectOption } from '../../shared/select/select';

const PRICE_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function saleBelowBase(group: AbstractControl): ValidationErrors | null {
  const base = Number(group.get('base_price')?.value);
  const saleRaw = group.get('sale_price')?.value;
  if (saleRaw === '' || saleRaw === null || saleRaw === undefined) return null;
  return Number(saleRaw) < base ? null : { saleNotBelowBase: true };
}

@Component({
  selector: 'app-admin-product-form',
  imports: [ReactiveFormsModule, RouterLink, VariantBuilder, Select],
  templateUrl: './product-form.html',
  styleUrls: ['../admin-shared.scss', './product-form.scss'],
})
export class AdminProductForm implements OnInit {
  protected readonly statusOptions: SelectOption<ProductStatus>[] = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ARCHIVED', label: 'Archived' },
  ];
  protected readonly categoryOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'None' },
    ...this.categories().map((c) => ({ value: c.id, label: c.name })),
  ]);
  protected readonly sizeGuideOptions = computed<SelectOption<number | null>[]>(() => [
    { value: null, label: 'None' },
    ...this.sizeGuides().map((g) => ({ value: g.id, label: g.name })),
  ]);
  private readonly toast = inject(AdminToastService);
  /** Bumped after the variant rows are reloaded so the builder rebuilds its colours and sizes. */
  protected readonly variantsRevision = signal(0);
  private readonly api = inject(AdminCatalogService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Route param: a product id, or undefined for /admin/products/new. */
  readonly id = input<string>();

  protected readonly product = signal<AdminProduct | null>(null);
  protected readonly categories = signal<AdminCategory[]>([]);
  protected readonly sizeGuides = signal<AdminSizeGuide[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly statuses: ProductStatus[] = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];

  protected readonly tabs = [
    { key: 'details', label: 'Details' },
    { key: 'images', label: 'Images' },
    { key: 'variants', label: 'Variants & stock' },
    { key: 'seo', label: 'SEO' },
  ] as const;
  protected readonly tab = signal<'details' | 'images' | 'variants' | 'seo'>('details');

  protected readonly form = this.fb.group(
    {
      name: ['', [Validators.required, Validators.maxLength(160)]],
      name_ar: ['', Validators.maxLength(160)],
      slug: ['', Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
      description: [''],
      description_ar: [''],
      category_id: this.fb.control<number | null>(null),
      size_guide_id: this.fb.control<number | null>(null),
      base_price: ['', [Validators.required, Validators.pattern(PRICE_PATTERN)]],
      sale_price: ['', Validators.pattern(PRICE_PATTERN)],
      status: this.fb.control<ProductStatus>('DRAFT'),
      is_featured: [false],
      is_new_arrival: [false],
      meta_title: ['', Validators.maxLength(160)],
      meta_description: ['', Validators.maxLength(320)],
      images: this.fb.array<FormGroup>([]),
      variants: this.fb.array<FormGroup>([]),
    },
    { validators: saleBelowBase },
  );

  /** Product name as a signal (the variant builder derives the SKU prefix from it). */
  protected readonly nameValue = signal('');


  get images(): FormArray<FormGroup> {
    return this.form.controls.images;
  }

  get variants(): FormArray<FormGroup> {
    return this.form.controls.variants;
  }

  get isNew(): boolean {
    return !this.id() || this.id() === 'new';
  }

  /** "% off" helper next to the sale price; kept in sync both ways. */
  protected readonly salePercent = signal('');

  protected onPercentInput(raw: string): void {
    this.salePercent.set(raw);
    const pct = Number(raw);
    const base = Number(this.form.controls.base_price.value);
    if (!raw.trim()) {
      this.form.controls.sale_price.setValue('', { emitEvent: false });
    } else if (pct > 0 && pct < 100 && base > 0) {
      this.form.controls.sale_price.setValue((base * (1 - pct / 100)).toFixed(2), { emitEvent: false });
    }
    this.form.controls.sale_price.markAsDirty();
  }

  protected clearSale(): void {
    this.salePercent.set('');
    this.form.controls.sale_price.setValue('');
    this.form.controls.sale_price.markAsDirty();
  }

  private syncPercent(): void {
    const v = this.form.getRawValue();
    this.salePercent.set(String(percentOff(v.base_price, v.sale_price) ?? ''));
  }

  ngOnInit(): void {
    this.form.controls.name.valueChanges.subscribe((name) => this.nameValue.set(name));
    // Typing a sale price (or changing the price) updates the % box.
    this.form.controls.sale_price.valueChanges.subscribe(() => this.syncPercent());
    this.form.controls.base_price.valueChanges.subscribe(() => {
      // Keep the same % when the price changes, so the sale price follows it.
      const pct = this.salePercent();
      if (pct && Number(pct) > 0) this.onPercentInput(pct);
    });
    this.api.categories().subscribe({ next: (c) => this.categories.set(c) });
    this.api.sizeGuides().subscribe({ next: (g) => this.sizeGuides.set(g) });
    if (!this.isNew) this.load(Number(this.id()));
  }

  protected addImage(url = '', alt = '', colour = ''): void {
    this.images.push(
      this.fb.group({
        image_url: [url, [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
        alt_text: [alt],
        colour: [colour],
      }),
    );
  }

  protected moveImage(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.images.length) return;
    const control = this.images.at(index);
    this.images.removeAt(index);
    this.images.insert(target, control);
  }

  protected addVariant(v?: Partial<{ id: number; sku: string; colour: string; colour_hex: string | null; size: string;
    size_sort_order: number; low_stock_threshold: number | null; is_active: boolean; stock_quantity: number;
    reserved_quantity: number }>): void {
    this.variants.push(
      this.fb.group({
        id: this.fb.control<number | null>(v?.id ?? null),
        sku: [v?.sku ?? '', [Validators.required, Validators.maxLength(64)]],
        colour: [v?.colour ?? '', Validators.required],
        colour_hex: [v?.colour_hex ?? '', Validators.pattern(HEX_PATTERN)],
        size: [v?.size ?? '', Validators.required],
        size_sort_order: [v?.size_sort_order ?? this.variants.length],
        low_stock_threshold: this.fb.control<number | null>(v?.low_stock_threshold ?? null),
        is_active: [v?.is_active ?? true],
        initial_stock: [0, [Validators.min(0)]],
        // Display only.
        stock_quantity: [{ value: v?.stock_quantity ?? 0, disabled: true }],
        reserved_quantity: [{ value: v?.reserved_quantity ?? 0, disabled: true }],
      }),
    );
  }





  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // Jump to the tab holding the first problem.
      const c = this.form.controls;
      if (c.name.invalid || c.slug.invalid || c.base_price.invalid || c.sale_price.invalid || this.form.hasError('saleNotBelowBase')) {
        this.tab.set('details');
      } else if (c.images.invalid) {
        this.tab.set('images');
      } else if (c.variants.invalid) {
        this.tab.set('variants');
      } else {
        this.tab.set('seo');
      }
      this.error.set(
        this.form.hasError('saleNotBelowBase')
          ? 'Sale price must be lower than the regular price.'
          : 'Please fix the highlighted fields.',
      );
      return;
    }
    this.saving.set(true);
    this.error.set(null);

    const body = this.toPayload();
    const request = this.isNew ? this.api.createProduct(body) : this.api.updateProduct(this.product()!.id, body);
    request.subscribe({
      next: (product) => {
        this.saving.set(false);
        if (this.isNew) {
          this.toast.success(`${product.name} created.`);
          void this.router.navigate(['/admin/products', product.id]);
        } else {
          this.patch(product);
          this.toast.success(`${product.name} saved.`);
        }
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.error(apiErrorMessage(err, 'Could not save the product.'));
      },
    });
  }


  private load(id: number): void {
    this.loading.set(true);
    this.api.product(id).subscribe({
      next: (product) => {
        this.patch(product);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err, 'Could not load the product.'));
        this.loading.set(false);
      },
    });
  }

  private patch(product: AdminProduct): void {
    this.product.set(product);
    this.form.patchValue({
      name: product.name,
      name_ar: product.name_ar ?? '',
      slug: product.slug,
      description: product.description ?? '',
      description_ar: product.description_ar ?? '',
      category_id: product.category_id,
      size_guide_id: product.size_guide_id,
      base_price: product.base_price,
      sale_price: product.sale_price ?? '',
      status: product.status,
      is_featured: product.is_featured,
      is_new_arrival: product.is_new_arrival,
      meta_title: product.meta_title ?? '',
      meta_description: product.meta_description ?? '',
    });
    this.images.clear();
    for (const img of product.images) this.addImage(img.image_url, img.alt_text ?? '', img.colour ?? '');
    this.variants.clear();
    for (const v of product.variants) this.addVariant(v);
    this.variantsRevision.update((v) => v + 1);
    this.form.markAsPristine();
  }

  private toPayload(): ProductInput {
    const v = this.form.getRawValue();
    const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim());
    return {
      name: v.name.trim(),
      name_ar: blankToNull(v.name_ar),
      slug: blankToNull(v.slug),
      description: blankToNull(v.description),
      description_ar: blankToNull(v.description_ar),
      category_id: v.category_id,
      size_guide_id: v.size_guide_id,
      base_price: v.base_price,
      sale_price: blankToNull(v.sale_price),
      status: v.status,
      is_featured: v.is_featured,
      is_new_arrival: v.is_new_arrival,
      meta_title: blankToNull(v.meta_title),
      meta_description: blankToNull(v.meta_description),
      images: this.images.getRawValue().map((img, index) => ({
        image_url: img['image_url'].trim(),
        alt_text: blankToNull(img['alt_text']),
        colour: blankToNull(img['colour']),
        sort_order: index,
      })),
      variants: this.variants.getRawValue().map((row) => ({
        id: row['id'],
        sku: row['sku'].trim(),
        colour: row['colour'].trim(),
        colour_hex: blankToNull(row['colour_hex'] ?? ''),
        size: row['size'].trim(),
        size_sort_order: Number(row['size_sort_order']) || 0,
        low_stock_threshold: row['low_stock_threshold'] === '' ? null : row['low_stock_threshold'],
        is_active: row['is_active'],
        initial_stock: row['id'] === null ? Number(row['initial_stock']) || 0 : 0,
      })),
    };
  }

}
