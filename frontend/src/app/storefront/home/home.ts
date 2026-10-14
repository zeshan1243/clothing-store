import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Category, Collection, ProductCard as ProductCardModel } from '../../core/catalog.models';
import { CatalogService } from '../../core/catalog.service';
import { TranslationKey } from '../../core/i18n/en';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { Icon, IconName } from '../../shared/icon/icon';
import { CollectionCard } from '../../shared/collection-card/collection-card';
import { ProductCard } from '../../shared/product-card/product-card';
import { ProductCardSkeleton } from '../../shared/product-card/product-card-skeleton';
import { Reveal } from '../../shared/reveal/reveal.directive';
import { Hero } from './hero';

@Component({
  selector: 'app-home',
  imports: [RouterLink, Hero, Icon, CollectionCard, ProductCard, ProductCardSkeleton, Reveal, TranslatePipe, LocalizePipe],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  private readonly catalog = inject(CatalogService);

  protected readonly featured = signal<ProductCardModel[] | null>(null);
  protected readonly newArrivals = signal<ProductCardModel[] | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly collections = signal<Collection[]>([]);
  protected readonly error = signal(false);

  private readonly i18n = inject(I18nService);

  protected readonly trust: { icon: IconName; title: TranslationKey; text: TranslationKey }[] = [
    { icon: 'banknote', title: 'home.trustCod', text: 'home.trustCodText' },
    { icon: 'truck', title: 'home.trustDelivery', text: 'home.trustDeliveryText' },
    { icon: 'repeat', title: 'home.trustExchanges', text: 'home.trustExchangesText' },
    { icon: 'message', title: 'home.trustWhatsapp', text: 'home.trustWhatsappText' },
  ];

  protected readonly dropTitle = computed(() => {
    this.i18n.lang();
    return translate('home.dropTitle').split('|');
  });

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      this.i18n.lang();
      seo.set('', translate('home.seo'));
    });
  }

  ngOnInit(): void {
    const onError = () => this.error.set(true);
    this.catalog.products({ featured: true, page_size: 8 }).subscribe({
      next: (page) => this.featured.set(page.items),
      error: onError,
    });
    this.catalog.products({ new: true, page_size: 8 }).subscribe({
      next: (page) => this.newArrivals.set(page.items),
      error: onError,
    });
    this.catalog.categories().subscribe({ next: (c) => this.categories.set(c), error: onError });
    this.catalog.collections(true).subscribe({ next: (c) => this.collections.set(c) });
  }
}
