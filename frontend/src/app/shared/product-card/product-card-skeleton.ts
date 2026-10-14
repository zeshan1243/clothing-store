import { Component, input } from '@angular/core';

/** Placeholder matching the product card's shape while products load. */
@Component({
  selector: 'app-product-card-skeleton',
  template: `
    @for (i of slots(); track $index) {
      <div class="sk" aria-hidden="true">
        <div class="skeleton sk__img"></div>
        <div class="skeleton sk__line"></div>
        <div class="skeleton sk__line sk__line--short"></div>
      </div>
    }
  `,
  styles: `
    :host { display: contents; }
    .sk__img { aspect-ratio: 4 / 5; border-radius: var(--radius-md); }
    .sk__line { height: 14px; margin-top: var(--space-3); width: 80%; }
    .sk__line--short { width: 40%; margin-top: var(--space-2); }
  `,
})
export class ProductCardSkeleton {
  readonly count = input(4);
  protected slots = () => Array.from({ length: this.count() });
}
