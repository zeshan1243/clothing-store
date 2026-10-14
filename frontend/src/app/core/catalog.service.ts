import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Category, Collection, ProductDetail, ProductFacets, ProductPage, ProductQuery } from './catalog.models';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  categories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base}/categories`);
  }

  collections(featured?: boolean): Observable<Collection[]> {
    return this.http.get<Collection[]>(`${this.base}/collections`, { params: toParams({ featured }) });
  }

  collection(slug: string): Observable<Collection> {
    return this.http.get<Collection>(`${this.base}/collections/${encodeURIComponent(slug)}`);
  }

  products(query: ProductQuery = {}): Observable<ProductPage> {
    return this.http.get<ProductPage>(`${this.base}/products`, { params: toParams(query) });
  }

  facets(query: { category?: string; collection?: string; q?: string; new?: boolean } = {}): Observable<ProductFacets> {
    return this.http.get<ProductFacets>(`${this.base}/products/facets`, { params: toParams(query) });
  }

  product(slug: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.base}/products/${encodeURIComponent(slug)}`);
  }
}

function toParams(query: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      for (const v of value) params = params.append(key, String(v));
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}
