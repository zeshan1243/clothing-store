import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProductCard as ProductCardModel, percentOff } from '../../core/catalog.models';
import { LocalizePipe, TranslatePipe, TranslatePluralPipe } from '../../core/i18n/translate.pipe';
import { QarPipe } from '../../core/qar.pipe';

const LOW_STOCK = 3;
const MAX_SWATCHES = 3;

/** Product card (design.md §6.2). The whole card is the tap target. */
@Component({
  selector: 'app-product-card',
  imports: [RouterLink, QarPipe, TranslatePipe, TranslatePluralPipe, LocalizePipe],
  template: `
    @let p = product();
    <a class="card" [routerLink]="['/products', p.slug]" [class.card--soldout]="!p.in_stock">
      <div class="card__media">
        @if (p.image_url) {
          <img class="card__img" [src]="p.image_url" [alt]="p | loc: 'name'" [attr.loading]="eager() ? 'eager' : 'lazy'" width="800" height="1000" />
          @if (p.hover_image_url) {
            <img class="card__img card__img--hover" [src]="p.hover_image_url" alt="" loading="lazy" width="800" height="1000" />
          }
        }
        <div class="card__badges">
          @if (!p.in_stock) {
            <span class="badge">{{ 'card.soldOut' | t }}</span>
          } @else {
            @if (p.is_new_arrival) { <span class="badge badge--new">{{ 'card.new' | t }}</span> }
            @if (saleOff(); as off) { <span class="badge badge--sale"><span class="ltr">−{{ off }}%</span><span class="visually-hidden"> {{ 'card.sale' | t }}</span></span> }
          }
        </div>
        @if (p.colours.length > 1) {
          <ul class="card__swatches" [attr.aria-label]="'count.colours' | tp: p.colours.length">
            @for (c of swatches(); track c.name) {
              <li class="swatch" [style.background]="c.hex ?? '#ccc'" [title]="c.name"><span class="visually-hidden">{{ c.name }}</span></li>
            }
            @if (p.colours.length > maxSwatches) {
              <li class="swatch-more">+{{ p.colours.length - maxSwatches }}</li>
            }
          </ul>
        }
      </div>
      <h3 class="card__name">{{ p | loc: 'name' }}</h3>
      <p class="card__price price">
        @if (p.sale_price) {
          <span class="card__sale">{{ p.sale_price | qar }}</span>
          <s class="card__was"><span class="visually-hidden">{{ 'card.was' | t }} </span>{{ p.base_price | qar }}</s>
        } @else {
          {{ p.price | qar }}
        }
      </p>
      @if (p.in_stock && p.total_available <= lowStock) {
        <p class="card__low">{{ 'card.onlyLeft' | t: { n: p.total_available } }}</p>
      }
    </a>
  `,
  styles: `
    .card { display: block; text-decoration: none; color: inherit; }
    .card__media { position: relative; aspect-ratio: 4 / 5; overflow: hidden; border-radius: var(--radius-md); background: var(--surface); }
    .card__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
      transition: transform var(--dur-slow) var(--ease-out), opacity var(--dur-base); }
    .card__img--hover { opacity: 0; }
    @media (hover: hover) {
      .card:hover .card__img { transform: scale(1.03); }
      .card:hover .card__img--hover { opacity: 1; }
    }
    .card--soldout .card__img { opacity: 0.5; }
    .card__badges { position: absolute; top: var(--space-2); inset-inline-start: var(--space-2); display: flex; gap: 4px; }
    .card__swatches { position: absolute; bottom: var(--space-2); inset-inline-start: var(--space-2); display: flex; align-items: center; gap: 4px;
      margin: 0; padding: 4px 6px; list-style: none; border-radius: var(--radius-pill); background: var(--glass); }
    .swatch { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(11, 11, 12, 0.2); }
    .swatch-more { font-size: 11px; font-weight: 700; padding-inline: 2px; }
    .card__name { margin: var(--space-3) 0 2px; font-family: var(--font-body); font-size: 15px; font-weight: 500; line-height: 1.35;
      letter-spacing: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card__price { margin: 0; font-size: 15px; font-weight: 600; }
    .card__sale { color: var(--danger-text); margin-inline-end: var(--space-2); }
    .card__was { color: var(--text-subtle); font-weight: 400; }
    .card__low { margin: 2px 0 0; font-size: 13px; font-weight: 600; color: var(--warning-text); }
  `,
})
export class ProductCard {
  readonly product = input.required<ProductCardModel>();
  /** Load the image eagerly (above the fold). */
  readonly eager = input(false);

  protected readonly lowStock = LOW_STOCK;
  protected readonly maxSwatches = MAX_SWATCHES;
  protected readonly saleOff = computed(() => percentOff(this.product().base_price, this.product().sale_price));
  protected readonly swatches = computed(() => this.product().colours.slice(0, MAX_SWATCHES));
}
