import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Category, Collection, ProductCard as ProductCardModel, ProductFacets, ProductSort } from '../../core/catalog.models';
import { CatalogService } from '../../core/catalog.service';
import { TranslationKey } from '../../core/i18n/en';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalizePipe, TranslatePipe, TranslatePluralPipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { Icon } from '../../shared/icon/icon';
import { ProductCard } from '../../shared/product-card/product-card';
import { ProductCardSkeleton } from '../../shared/product-card/product-card-skeleton';
import { Sheet } from '../../shared/sheet/sheet';
import { ShopCache } from './shop-cache';
import { Select, SelectOption } from '../../shared/select/select';

const PAGE_SIZE = 24;

type QueryValue = string | string[] | undefined;

/** Collection page (design.md §7.3). All filter state lives in the URL so it survives back/refresh. */
@Component({
  selector: 'app-shop',
  imports: [RouterLink, FormsModule, NgTemplateOutlet, Icon, ProductCard, ProductCardSkeleton, Sheet, TranslatePipe, TranslatePluralPipe, LocalizePipe, Select],
  templateUrl: './shop.html',
  styleUrl: './shop.scss',
})
export class Shop {
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly cache = inject(ShopCache);
  private readonly i18n = inject(I18nService);

  // Bound from the route: /shop/:category or /collections/:collection, ?q&sort&new&size&colour&min&max&stock
  readonly category = input<string>();
  readonly collection = input<string>();
  readonly q = input<string>();
  readonly sort = input<ProductSort>();
  readonly new = input<string>();
  readonly size = input<QueryValue>();
  readonly colour = input<QueryValue>();
  readonly min = input<string>();
  readonly max = input<string>();
  readonly stock = input<string>();

  protected readonly categories = signal<Category[]>([]);
  /** Header data for /collections/:collection ('missing' when it doesn't exist or has ended). */
  protected readonly activeCollection = signal<Collection | 'missing' | null>(null);
  protected readonly collectionInfo = computed(() => {
    const c = this.activeCollection();
    return c && c !== 'missing' ? c : null;
  });
  protected readonly facets = signal<ProductFacets | null>(null);
  protected readonly items = signal<ProductCardModel[] | null>(null);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  /** Bumped whenever a new result set replaces the grid, so every card re-enters with the slide-in. */
  protected readonly listVersion = signal(0);
  /** Index where the latest batch starts ("Load more" animates only the new cards). */
  protected readonly batchStart = signal(0);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  /** New results are loading while the previous ones stay on screen (softly faded). */
  protected readonly refreshing = signal(false);
  private readonly resultsEl = viewChild<ElementRef<HTMLElement>>('results');
  protected readonly error = signal(false);
  protected readonly filterOpen = signal(false);
  protected readonly sortOpen = signal(false);

  protected minPrice = '';
  protected maxPrice = '';

  protected readonly sortOptions: { value: ProductSort; label: TranslationKey }[] = [
    { value: 'newest', label: 'shop.sortNewest' },
    { value: 'price_asc', label: 'shop.sortPriceAsc' },
    { value: 'price_desc', label: 'shop.sortPriceDesc' },
  ];

  protected readonly sortSelectOptions = computed<SelectOption<ProductSort>[]>(() => {
    this.i18n.lang();
    return this.sortOptions.map((o) => ({ value: o.value, label: translate(o.label) }));
  });
  protected readonly currentSort = computed<ProductSort>(() => this.sort() ?? 'newest');
  protected readonly sortLabel = computed<TranslationKey>(
    () => this.sortOptions.find((o) => o.value === this.currentSort())?.label ?? 'shop.sortNewest',
  );
  protected readonly newOnly = computed(() => this.new() === '1');
  protected readonly sizes = computed(() => asList(this.size()));
  protected readonly colours = computed(() => asList(this.colour()));
  protected readonly inStockOnly = computed(() => this.stock() === '1');
  protected readonly activeCategory = computed(() => this.categories().find((c) => c.slug === this.category()));
  protected readonly hasMore = computed(() => (this.items()?.length ?? 0) < this.total());
  protected readonly filterCount = computed(
    () => this.sizes().length + this.colours().length + (this.min() || this.max() ? 1 : 0) + (this.inStockOnly() ? 1 : 0),
  );
  protected readonly heading = computed(() => {
    this.i18n.lang();
    const collection = this.collectionInfo();
    if (collection) return (this.i18n.isArabic() && collection.name_ar) || collection.name;
    if (this.collection()) return '';
    const category = this.activeCategory();
    if (category) return (this.i18n.isArabic() && category.name_ar) || category.name;
    if (this.newOnly()) return translate('common.newIn');
    return this.q() ? translate('shop.searchHeading', { q: this.q()! }) : translate('common.shopAll');
  });

  private readonly queryKey = computed(() =>
    JSON.stringify([this.category(), this.collection(), this.q(), this.currentSort(), this.newOnly(), this.sizes(), this.colours(), this.min(), this.max(), this.inStockOnly()]),
  );

  constructor() {
    this.catalog.categories().subscribe({ next: (c) => this.categories.set(c) });

    effect(() => {
      const slug = this.collection();
      this.activeCollection.set(null);
      if (!slug) return;
      this.catalog.collection(slug).subscribe({
        next: (c) => this.activeCollection.set(c),
        error: () => this.activeCollection.set('missing'),
      });
    });

    // Facets depend only on the base listing (category/collection/search/new), not the selected filters.
    effect(() => {
      const base = { category: this.category(), collection: this.collection(), q: this.q(), new: this.newOnly() || undefined };
      this.catalog.facets(base).subscribe({ next: (f) => this.facets.set(f) });
    });

    effect(() => {
      const key = this.queryKey();
      untracked(() => {
        this.minPrice = this.min() ?? '';
        this.maxPrice = this.max() ?? '';
        const cached = this.cache.get(key);
        if (cached) {
          this.items.set(cached.items);
          this.batchStart.set(0);
          this.listVersion.update((v) => v + 1);
          this.total.set(cached.total);
          this.page.set(cached.page);
          this.loading.set(false);
          return;
        }
        this.load(1);
      });
    });

    effect(() => {
      const source = this.collectionInfo() ?? this.activeCategory();
      const description = (this.i18n.isArabic() && source?.description_ar) || source?.description;
      if (this.collection() && !this.collectionInfo()) return; // wait for the collection header
      this.seo.set(this.heading(), description ?? translate('shop.seo'));
    });
  }

  /** Stagger step for the slide-in, restarting at each batch and capped so long lists don't lag. */
  protected stagger(index: number): number {
    return Math.min(Math.max(index - this.batchStart(), 0), 11);
  }

  protected loadMore(): void {
    this.load(this.page() + 1);
  }

  protected toggle(param: 'size' | 'colour', value: string): void {
    const current = param === 'size' ? this.sizes() : this.colours();
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    this.update({ [param]: next.length ? next : null });
  }

  protected setSort(sort: ProductSort): void {
    this.sortOpen.set(false);
    this.update({ sort: sort === 'newest' ? null : sort });
  }

  protected toggleStock(): void {
    this.update({ stock: this.inStockOnly() ? null : '1' });
  }

  protected applyPrice(): void {
    const clean = (v: string) => (/^\d+(\.\d+)?$/.test(v.trim()) ? v.trim() : null);
    this.update({ min: clean(this.minPrice), max: clean(this.maxPrice) });
  }

  protected clearFilters(): void {
    this.update({ size: null, colour: null, min: null, max: null, stock: null });
  }

  protected isSelected(param: 'size' | 'colour', value: string): boolean {
    return (param === 'size' ? this.sizes() : this.colours()).includes(value);
  }

  private revealResults(): void {
    const el = this.resultsEl()?.nativeElement;
    if (el && scrolledPast(el)) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  private update(params: Record<string, string | string[] | null>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  private load(page: number): void {
    const key = this.queryKey();
    const hasResults = this.items() !== null;
    if (page > 1) {
      this.loadingMore.set(true);
    } else if (hasResults) {
      // Keep the current grid in place (no skeleton swap, no height jump) until new results arrive.
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.error.set(false);
    this.catalog
      .products({
        category: this.category(),
        collection: this.collection(),
        q: this.q(),
        sort: this.currentSort(),
        new: this.newOnly() || undefined,
        size: this.sizes(),
        colour: this.colours(),
        min_price: this.min() ? Number(this.min()) : undefined,
        max_price: this.max() ? Number(this.max()) : undefined,
        in_stock: this.inStockOnly() || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      .subscribe({
        next: (result) => {
          if (key !== this.queryKey()) return; // a newer query superseded this one
          const previous = page === 1 ? [] : (this.items() ?? []);
          const items = [...previous, ...result.items];
          this.batchStart.set(previous.length);
          if (page === 1) this.listVersion.update((v) => v + 1);
          this.items.set(items);
          this.total.set(result.total);
          this.page.set(page);
          this.loading.set(false);
          this.loadingMore.set(false);
          if (this.refreshing()) {
            this.refreshing.set(false);
            this.revealResults();
          }
          this.cache.set(key, { items, total: result.total, page });
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
          this.loadingMore.set(false);
          this.refreshing.set(false);
        },
      });
  }
}

/** Smoothly bring the results back into view if the user had scrolled past their top. */
function scrolledPast(el: HTMLElement): boolean {
  const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
  return el.getBoundingClientRect().top < headerHeight;
}

function asList(value: QueryValue): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
