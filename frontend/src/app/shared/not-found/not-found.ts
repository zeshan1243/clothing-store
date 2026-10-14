import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, TranslatePipe],
  template: `
    <section class="container not-found">
      <h1>{{ 'page.notFound' | t }}</h1>
      <p>{{ 'nf.text' | t }}</p>
      <a routerLink="/" class="btn">{{ 'common.backHome' | t }}</a>
    </section>
  `,
  styles: `
    .not-found {
      padding-block: var(--space-12);
      text-align: center;
    }
  `,
})
export class NotFound {}
