import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

import { ar } from './ar';
import { en, TranslationKey } from './en';

export type Lang = 'en' | 'ar';
export type Params = Record<string, string | number>;

const STORAGE_KEY = 'lang';
const DICTIONARIES: Record<Lang, Record<TranslationKey, string>> = { en, ar };

/** The shopper's chosen language (module-level so plain functions like apiErrorMessage can translate). */
const chosenLang = signal<Lang>(readStoredLang());
/** True while an admin page is shown: the admin portal is always English / LTR. */
const adminScope = signal(false);
/** Language actually used for rendering. */
const currentLang = computed<Lang>(() => (adminScope() ? 'en' : chosenLang()));

/** Translate a key in the current language; {name} placeholders are filled from params. */
export function translate(key: TranslationKey, params?: Params): string {
  const text = DICTIONARIES[currentLang()][key] ?? en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : text;
}

/**
 * Plural-aware translation. Looks up `${base}.${category}` using the language's plural rules
 * (Arabic has zero/one/two/few/many/other), falling back to `${base}.other`.
 */
export function translatePlural(base: string, count: number, params: Params = {}): string {
  const category = new Intl.PluralRules(currentLang()).select(count);
  const dict = DICTIONARIES[currentLang()] as Record<string, string>;
  const key = (`${base}.${category}` in dict ? `${base}.${category}` : `${base}.other`) as TranslationKey;
  return translate(key, { n: count, ...params });
}

/**
 * Storefront language (English default, Arabic optional). The choice is remembered per browser.
 * The admin portal always renders in English / LTR.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);

  readonly lang = currentLang;
  readonly isArabic = computed(() => currentLang() === 'ar');
  readonly dir = computed(() => (currentLang() === 'ar' ? 'rtl' : 'ltr'));

  setLang(lang: Lang): void {
    chosenLang.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Storage unavailable: the choice lasts for this page session.
    }
    this.applyToDocument(lang);
  }

  toggle(): void {
    this.setLang(chosenLang() === 'en' ? 'ar' : 'en');
  }

  /** Admin pages call this with true (forces English/LTR); the storefront with false. */
  setAdminScope(admin: boolean): void {
    adminScope.set(admin);
    this.applyToDocument();
  }

  /** Sets <html lang/dir> to the language currently in effect. */
  applyToDocument(lang: Lang = currentLang()): void {
    const html = this.document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}
