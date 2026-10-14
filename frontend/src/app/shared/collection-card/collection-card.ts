import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Collection } from '../../core/catalog.models';
import { LocalizePipe, TranslatePipe, TranslatePluralPipe } from '../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';

/** Wide banner card linking to a collection (homepage and /collections). */
@Component({
  selector: 'app-collection-card',
  imports: [RouterLink, Icon, TranslatePipe, TranslatePluralPipe, LocalizePipe],
  template: `
    @let c = collection();
    <a class="cc" [class.cc--hero]="hero()" [routerLink]="['/collections', c.slug]">
      @if (c.cover_image_url) {
        <img class="cc__img" [src]="c.cover_image_url" alt="" [attr.loading]="hero() ? 'eager' : 'lazy'" width="1200" height="800" />
      }
      <span class="cc__body">
        <span class="cc__count">{{ 'count.items' | tp: c.product_count }}</span>
        <span class="cc__name">{{ c | loc: 'name' }}</span>
        @if (c.description) {
          <span class="cc__desc">{{ c | loc: 'description' }}</span>
        }
        <span class="cc__cta">{{ 'collections.shop' | t }} <app-icon name="arrow-right" [size]="16" /></span>
      </span>
    </a>
  `,
  styles: `
    :host { display: block; }
    .cc {
      position: relative; display: flex; align-items: flex-end; overflow: hidden;
      aspect-ratio: 4 / 5; border-radius: var(--radius-md); background: var(--ink-950); color: #f6f4ef;
      text-decoration: none; container-type: inline-size;
    }
    @media (min-width: 700px) { .cc { aspect-ratio: 5 / 4; } .cc--hero { aspect-ratio: 21 / 9; } }
    .cc::after {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(11, 11, 12, 0.85) 0%, rgba(11, 11, 12, 0.35) 45%, transparent 75%);
    }
    .cc__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%;
      transition: transform var(--dur-slow) var(--ease-out); }
    .cc:hover .cc__img { transform: scale(1.04); }
    .cc__body { position: relative; z-index: 1; display: grid; gap: var(--space-2); padding: clamp(16px, 5cqi, 40px); max-width: 640px; }
    .cc__count { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--volt-400); }
    .cc__name { font-family: var(--font-display); font-weight: 700; line-height: 0.95; letter-spacing: -0.03em;
      text-transform: uppercase; font-size: clamp(26px, 9cqi, 72px); overflow-wrap: anywhere; }
    .cc__desc { font-size: 15px; color: rgba(246, 244, 239, 0.85); display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden; }
    .cc__cta { justify-self: start; display: inline-flex; align-items: center; gap: 6px; margin-top: var(--space-2);
      padding: 10px 18px; border-radius: var(--radius-pill); background: var(--volt-400); color: var(--on-volt);
      font-weight: 700; font-size: 14px; transition: gap var(--dur-base) var(--ease-out); }
    .cc:hover .cc__cta { gap: 10px; }
  `,
})
export class CollectionCard {
  readonly collection = input.required<Collection>();
  /** Full-width banner (the first/only featured collection). */
  readonly hero = input(false);
}
