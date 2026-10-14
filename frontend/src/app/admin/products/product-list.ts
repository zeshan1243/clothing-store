import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { Pager, pageOf } from '../shared/pager';
import { QarPipe } from '../../core/qar.pipe';
import { AdminCatalogService, AdminCategory, AdminProductListItem } from '../admin-catalog.service';
import { Select, SelectOption } from '../../shared/select/select';

@Component({
  selector: 'app-admin-product-list',
  imports: [RouterLink, FormsModule, QarPipe, Pager, Select],
  template: `
    <div class="page-head">
      <h1>Products</h1>
      <a routerLink="/admin/products/new" class="btn btn--small">Add product</a>
    </div>

    <form class="filters" (ngSubmit)="load()">
      <label class="visually-hidden" for="p-search">Search</label>
      <input id="p-search" type="search" name="q" placeholder="Search name or SKU" [(ngModel)]="q" />
      <label class="visually-hidden" for="p-status">Status</label>
      <app-select class="filter-select" inputId="p-status" name="status" size="sm" [options]="statusOptions" [(ngModel)]="status" (ngModelChange)="load()" />
      <label class="visually-hidden" for="p-cat">Category</label>
      <app-select class="filter-select" inputId="p-cat" name="category" size="sm" [options]="categoryOptions()" [(ngModel)]="categoryId" (ngModelChange)="load()" />
      <button type="submit" class="btn btn--secondary btn--small">Search</button>
    </form>

    @if (error(); as e) {
      <p class="alert alert--error" role="alert">{{ e }}</p>
    }

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Image</span></th>
            <th scope="col">Product</th>
            <th scope="col">Status</th>
            <th scope="col">Category</th>
            <th scope="col" class="num">Price</th>
            <th scope="col" class="num">Variants</th>
            <th scope="col" class="num">On hand</th>
            <th scope="col" class="num">Available</th>
          </tr>
        </thead>
        <tbody>
          @for (p of visible(); track p.id) {
            <tr>
              <td>
                @if (p.image_url) {
                  <img class="thumb" [src]="p.image_url" alt="" loading="lazy" />
                }
              </td>
              <td>
                <a [routerLink]="['/admin/products', p.id]"><strong>{{ p.name }}</strong></a>
                @if (p.is_featured) { <span class="status">Featured</span> }
                @if (p.is_new_arrival) { <span class="status">New</span> }
              </td>
              <td><span class="status status--{{ p.status }}">{{ p.status }}</span></td>
              <td>{{ p.category_name ?? '—' }}</td>
              <td class="num">
                @if (p.sale_price) {
                  {{ p.sale_price | qar }} <s class="muted">{{ p.base_price | qar }}</s>
                } @else {
                  {{ p.base_price | qar }}
                }
              </td>
              <td class="num">{{ p.variant_count }}</td>
              <td class="num">{{ p.stock_on_hand }}</td>
              <td class="num">{{ p.available }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="8" class="empty-state">{{ loading() ? 'Loading…' : 'No products found.' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [total]="products().length" [page]="page()" [pageSize]="pageSize()" (pageChange)="page.set($event)"
      (pageSizeChange)="pageSize.set($event); page.set(1)" />
  `,
  styleUrl: '../admin-shared.scss',
})
export class AdminProductList implements OnInit {
  protected readonly statusOptions: SelectOption<string>[] = [
    { value: '', label: 'All (not archived)' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'INACTIVE', label: 'Inactive' },
    { value: 'ARCHIVED', label: 'Archived' },
  ];
  protected readonly categoryOptions = computed<SelectOption<number | undefined>[]>(() => [
    { value: undefined, label: 'All categories' },
    ...this.categories().map((c) => ({ value: c.id, label: c.name })),
  ]);
  private readonly api = inject(AdminCatalogService);

  protected readonly products = signal<AdminProductListItem[]>([]);
  protected readonly categories = signal<AdminCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly visible = computed(() => pageOf(this.products(), this.page(), this.pageSize()));

  protected q = '';
  protected status = '';
  protected categoryId: number | undefined;

  ngOnInit(): void {
    this.api.categories().subscribe({ next: (c) => this.categories.set(c) });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.products({ q: this.q.trim(), status: this.status, category_id: this.categoryId }).subscribe({
      next: (rows) => {
        this.products.set(rows);
        this.page.set(1);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
