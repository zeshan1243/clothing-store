import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Collection } from '../../core/catalog.models';
import { CatalogService } from '../../core/catalog.service';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { CollectionCard } from '../../shared/collection-card/collection-card';
import { Reveal } from '../../shared/reveal/reveal.directive';

/** /collections — every active collection with products. */
@Component({
  selector: 'app-collections',
  imports: [RouterLink, CollectionCard, Reveal, TranslatePipe],
  template: `
    <div class="container page">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/">{{ 'common.home' | t }}</a> <span aria-hidden="true">/</span>
        <span aria-current="page">{{ 'common.collections' | t }}</span>
      </nav>
      <header class="head">
        <h1>{{ 'common.collections' | t }}</h1>
        <p class="muted">{{ 'collections.intro' | t }}</p>
      </header>

      @if (error()) {
        <p class="alert alert--error" role="alert">{{ 'shop.loadError' | t }}</p>
      } @else if (collections(); as list) {
        @if (list.length) {
          <ul class="grid">
            @for (c of list; track c.id; let first = $first) {
              <li appReveal [class.wide]="first"><app-collection-card [collection]="c" [hero]="first" /></li>
            }
          </ul>
        } @else {
          <div class="empty">
            <p>{{ 'collections.empty' | t }}</p>
            <a routerLink="/shop" class="btn">{{ 'common.shopAll' | t }}</a>
          </div>
        }
      } @else {
        <div class="grid" aria-hidden="true"><div class="skeleton wide"></div><div class="skeleton"></div><div class="skeleton"></div></div>
      }
    </div>
  `,
  styles: `
    .crumbs { display: flex; gap: var(--space-2); font-size: 13px; color: var(--text-muted); margin-bottom: var(--space-4); }
    .crumbs a { text-decoration: none; }
    .head { margin-bottom: var(--space-6); }
    .head h1 { margin: 0 0 var(--space-2); }
    .head p { margin: 0; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-4); }
    @media (min-width: 700px) { .grid { grid-template-columns: 1fr 1fr; } .wide { grid-column: 1 / -1; } }
    .skeleton { aspect-ratio: 5 / 4; border-radius: var(--radius-md); background: var(--skeleton-a); }
    .skeleton.wide { aspect-ratio: 21 / 9; }
    .empty { display: grid; justify-items: start; gap: var(--space-3); padding: var(--space-8) 0; }
  `,
})
export class Collections {
  protected readonly collections = signal<Collection[] | null>(null);
  protected readonly error = signal(false);

  constructor() {
    inject(CatalogService)
      .collections()
      .subscribe({ next: (c) => this.collections.set(c), error: () => this.error.set(true) });
    const seo = inject(SeoService);
    const i18n = inject(I18nService);
    effect(() => {
      i18n.lang();
      seo.set(translate('common.collections'), translate('collections.seo'));
    });
  }
}
