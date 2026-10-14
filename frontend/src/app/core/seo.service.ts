import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { environment } from '../../environments/environment';

const JSON_LD_ID = 'structured-data';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  /** Title, description, canonical URL and Open Graph tags for a public page. */
  set(pageTitle: string, description?: string | null, image?: string | null): void {
    const fullTitle = pageTitle ? `${pageTitle} | ${environment.brandName}` : environment.brandName;
    this.title.setTitle(fullTitle);
    const url = this.document.location.origin + this.document.location.pathname;

    if (description) {
      const text = description.slice(0, 300);
      this.meta.updateTag({ name: 'description', content: text });
      this.meta.updateTag({ property: 'og:description', content: text });
    }
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:site_name', content: environment.brandName });
    if (image) {
      this.meta.updateTag({ property: 'og:image', content: image });
    } else {
      this.meta.removeTag("property='og:image'");
    }
    this.setRobots(true);
    this.setCanonical(url);
    this.setStructuredData(null);
  }

  /** Keep private pages (admin, order confirmations) out of search results. */
  setRobots(index: boolean): void {
    if (index) {
      this.meta.removeTag("name='robots'");
    } else {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    }
  }

  /** schema.org JSON-LD (e.g. Product) for rich search results; pass null to remove. */
  setStructuredData(data: object | null): void {
    this.document.getElementById(JSON_LD_ID)?.remove();
    if (!data) return;
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.id = JSON_LD_ID;
    script.text = JSON.stringify(data);
    this.document.head.appendChild(script);
  }

  private setCanonical(url: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      this.document.head.appendChild(link);
    }
    link.href = url;
  }
}
