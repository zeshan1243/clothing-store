import { Pipe, PipeTransform, inject } from '@angular/core';

import { TranslationKey } from './en';
import { I18nService, Params, translate, translatePlural } from './i18n.service';

/**
 * `{{ 'nav.newIn' | t }}` / `{{ 'card.onlyLeft' | t: { n: 3 } }}`.
 * Impure so text updates immediately when the language changes (reading the language signal makes
 * the template re-render).
 */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: TranslationKey, params?: Params): string {
    this.i18n.lang();
    return translate(key, params);
  }
}

/** `{{ 'count.items' | tp: total }}` — plural-aware (Arabic has six plural forms). */
@Pipe({ name: 'tp', pure: false })
export class TranslatePluralPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(base: string, count: number, params?: Params): string {
    this.i18n.lang();
    return translatePlural(base, count, params);
  }
}

/**
 * Picks the Arabic field when the storefront is in Arabic and a translation exists:
 * `{{ product | loc: 'name' }}` → product.name_ar ?? product.name.
 */
@Pipe({ name: 'loc', pure: false })
export class LocalizePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform<T extends object>(value: T | null | undefined, field: string): string {
    if (!value) return '';
    const record = value as Record<string, unknown>;
    const arabic = this.i18n.isArabic() ? record[`${field}_ar`] : null;
    return String((typeof arabic === 'string' && arabic.trim() ? arabic : record[field]) ?? '');
  }
}

/** Date in the storefront language with Western digits: "12 Oct 2026, 1:59 PM" / "12 أكتوبر 2026، 1:59 م". */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(value: string | Date | null | undefined): string {
    if (!value) return '';
    const locale = this.i18n.isArabic() ? 'ar-QA-u-nu-latn' : 'en-GB';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qatar' }).format(
      new Date(value),
    );
  }
}
