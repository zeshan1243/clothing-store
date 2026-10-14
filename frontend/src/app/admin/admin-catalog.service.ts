import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Category, Money, ProductImage, ProductStatus, SizeGuideContent } from '../core/catalog.models';

export interface AdminCategory extends Category {
  sort_order: number;
  is_active: boolean;
  product_count: number;
}

export interface CategoryInput {
  name: string;
  name_ar?: string | null;
  description_ar?: string | null;
  slug?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface AdminSizeGuide {
  id: number;
  name: string;
  content: SizeGuideContent;
  notes: string | null;
}

export interface AdminVariant {
  id: number;
  sku: string;
  colour: string;
  colour_hex: string | null;
  size: string;
  size_sort_order: number;
  low_stock_threshold: number | null;
  is_active: boolean;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
}

export interface AdminProduct {
  id: number;
  name: string;
  name_ar: string | null;
  slug: string;
  description: string | null;
  description_ar: string | null;
  category_id: number | null;
  size_guide_id: number | null;
  base_price: Money;
  sale_price: Money | null;
  status: ProductStatus;
  is_featured: boolean;
  is_new_arrival: boolean;
  meta_title: string | null;
  meta_description: string | null;
  images: ProductImage[];
  variants: AdminVariant[];
  created_at: string;
  updated_at: string;
}

export interface AdminCollection {
  id: number;
  name: string;
  name_ar: string | null;
  slug: string;
  description: string | null;
  description_ar: string | null;
  image_url: string | null;
  cover_image_url: string | null;
  product_count: number;
  product_ids: number[];
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  updated_at: string;
}

export interface CollectionInput {
  name: string;
  name_ar: string | null;
  slug: string | null;
  description: string | null;
  description_ar: string | null;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  product_ids: number[];
}

export interface AdminProductListItem {
  id: number;
  name: string;
  slug: string;
  status: ProductStatus;
  category_name: string | null;
  base_price: Money;
  sale_price: Money | null;
  image_url: string | null;
  variant_count: number;
  stock_on_hand: number;
  available: number;
  is_featured: boolean;
  is_new_arrival: boolean;
  updated_at: string;
}

export interface VariantInput {
  id?: number | null;
  sku: string;
  colour: string;
  colour_hex?: string | null;
  size: string;
  size_sort_order?: number;
  low_stock_threshold?: number | null;
  is_active?: boolean;
  initial_stock?: number;
}

export interface ProductInput {
  name: string;
  name_ar?: string | null;
  description_ar?: string | null;
  slug?: string | null;
  description?: string | null;
  category_id?: number | null;
  size_guide_id?: number | null;
  base_price: string;
  sale_price?: string | null;
  status: ProductStatus;
  is_featured: boolean;
  is_new_arrival: boolean;
  meta_title?: string | null;
  meta_description?: string | null;
  images: { image_url: string; alt_text?: string | null; colour?: string | null; sort_order?: number }[];
  variants: VariantInput[];
}

export interface InventoryRow {
  variant_id: number;
  product_id: number;
  product_name: string;
  product_status: ProductStatus;
  sku: string;
  colour: string;
  size: string;
  stock_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  is_active: boolean;
}

export type AdjustmentType = 'RECEIVED' | 'ADJUSTMENT' | 'RETURN';

export interface StockMovement {
  id: number;
  product_variant_id: number;
  movement_type: string;
  quantity_change: number;
  related_order_id: number | null;
  reason: string | null;
  created_by_name: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class AdminCatalogService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/admin`;

  categories(): Observable<AdminCategory[]> {
    return this.http.get<AdminCategory[]>(`${this.base}/categories`);
  }

  createCategory(body: CategoryInput): Observable<AdminCategory> {
    return this.http.post<AdminCategory>(`${this.base}/categories`, body);
  }

  updateCategory(id: number, body: CategoryInput): Observable<AdminCategory> {
    return this.http.patch<AdminCategory>(`${this.base}/categories/${id}`, body);
  }

  collections(): Observable<AdminCollection[]> {
    return this.http.get<AdminCollection[]>(`${this.base}/collections`);
  }

  createCollection(body: CollectionInput): Observable<AdminCollection> {
    return this.http.post<AdminCollection>(`${this.base}/collections`, body);
  }

  updateCollection(id: number, body: Partial<CollectionInput>): Observable<AdminCollection> {
    return this.http.patch<AdminCollection>(`${this.base}/collections/${id}`, body);
  }

  deleteCollection(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/collections/${id}`);
  }

  sizeGuides(): Observable<AdminSizeGuide[]> {
    return this.http.get<AdminSizeGuide[]>(`${this.base}/size-guides`);
  }

  products(filters: { q?: string; status?: string; category_id?: number } = {}): Observable<AdminProductListItem[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<AdminProductListItem[]>(`${this.base}/products`, { params });
  }

  product(id: number): Observable<AdminProduct> {
    return this.http.get<AdminProduct>(`${this.base}/products/${id}`);
  }

  createProduct(body: ProductInput): Observable<AdminProduct> {
    return this.http.post<AdminProduct>(`${this.base}/products`, body);
  }

  /** Delete a variant that was never ordered (the API refuses otherwise). */
  deleteVariant(productId: number, variantId: number): Observable<AdminProduct> {
    return this.http.delete<AdminProduct>(`${this.base}/products/${productId}/variants/${variantId}`);
  }

  updateProduct(id: number, body: Partial<ProductInput>): Observable<AdminProduct> {
    return this.http.patch<AdminProduct>(`${this.base}/products/${id}`, body);
  }

  inventory(filters: { q?: string; low_stock_only?: boolean } = {}): Observable<InventoryRow[]> {
    let params = new HttpParams();
    if (filters.q) params = params.set('q', filters.q);
    if (filters.low_stock_only) params = params.set('low_stock_only', 'true');
    return this.http.get<InventoryRow[]>(`${this.base}/inventory`, { params });
  }

  adjustStock(body: {
    product_variant_id: number;
    movement_type: AdjustmentType;
    quantity_change: number;
    reason: string;
  }): Observable<StockMovement> {
    return this.http.post<StockMovement>(`${this.base}/inventory/adjustments`, body);
  }

  movements(variantId: number): Observable<StockMovement[]> {
    return this.http.get<StockMovement[]>(`${this.base}/inventory/variants/${variantId}/movements`);
  }
}
