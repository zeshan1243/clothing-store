import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService, translate } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { STATIC_PAGES } from './page-content';
import { STATIC_PAGES_AR } from './page-content-ar';

/** Policy / info pages (design.md §7.6): one readable column, contents list on longer pages. */
@Component({
  selector: 'app-static-page',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (page(); as p) {
      <article class="container page prose">
        <p class="overline muted">{{ (slug() === 'about' || slug() === 'contact' ? 'page.info' : 'page.policies') | t }}</p>
        <h1>{{ p.title }}</h1>
        @if (toc().length > 2) {
          <nav class="toc" [attr.aria-label]="'page.onThisPage' | t">
            <p class="overline">{{ 'page.onThisPage' | t }}</p>
            <ol>
              @for (item of toc(); track item.id) {
                <li><a [href]="'#' + item.id" (click)="jump($event, item.id)">{{ item.heading }}</a></li>
              }
            </ol>
          </nav>
        }
        @for (section of p.sections; track $index; let i = $index) {
          @if (section.heading) {
            <h2 [id]="'s' + i">{{ section.heading }}</h2>
          }
          @for (para of section.paragraphs; track $index) {
            <p>{{ para }}</p>
          }
        }
        <aside class="help">
          <p><strong>{{ 'page.question' | t }}</strong> {{ 'page.questionText' | t }}</p>
          <a routerLink="/pages/contact" class="btn btn--secondary">{{ 'common.contactUs' | t }}</a>
        </aside>
      </article>
    } @else {
      <section class="container page">
        <h1>{{ 'page.notFound' | t }}</h1>
        <a routerLink="/" class="btn">{{ 'common.backHome' | t }}</a>
      </section>
    }
  `,
  styles: `
    .prose { max-width: calc(680px + 2 * var(--gutter)); font-size: 17px; line-height: 1.65; }
    .prose h1 { margin-top: var(--space-2); }
    .prose h2 { font-size: 22px; margin-top: var(--space-8); }
    .prose p { margin: 0 0 var(--space-4); }
    .toc { margin: var(--space-6) 0 var(--space-8); padding: var(--space-4) var(--space-6); border-radius: var(--radius-md); background: var(--surface); border: 1px solid var(--border); }
    .toc ol { margin: var(--space-2) 0 0; padding-inline-start: var(--space-6); }
    .toc li { padding: 4px 0; }
    .help { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);
      margin-top: var(--space-12); padding: var(--space-6); border-radius: var(--radius-md); background: var(--dark-block); color: var(--bone-100); }
    .help p { margin: 0; }
    .help .btn { --btn-fg: var(--bone-100); }
  `,
})
export class StaticPageView {
  /** Route param :slug */
  readonly slug = input.required<string>();
  private readonly i18n = inject(I18nService);
  protected readonly page = computed(
    () => (this.i18n.isArabic() ? STATIC_PAGES_AR : STATIC_PAGES)[this.slug()] ?? STATIC_PAGES[this.slug()] ?? null,
  );
  protected readonly toc = computed(() =>
    (this.page()?.sections ?? [])
      .map((s, i) => ({ heading: s.heading, id: 's' + i }))
      .filter((s): s is { heading: string; id: string } => !!s.heading),
  );

  constructor() {
    const seo = inject(SeoService);
    effect(() => seo.set(this.page()?.title ?? translate('page.notFound'), this.page()?.description));
  }

  /** In-page anchor that doesn't fight the router's base href. */
  protected jump(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }
}
