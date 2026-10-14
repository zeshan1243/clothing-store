import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../../environments/environment';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { CartService } from '../../core/cart.service';
import { CatalogService } from '../../core/catalog.service';
import { ThemeService } from '../../core/theme.service';
import { TranslationKey } from '../../core/i18n/en';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { Icon } from '../../shared/icon/icon';
import { MiniCart } from '../../shared/mini-cart/mini-cart';
import { Sheet } from '../../shared/sheet/sheet';

interface NavLink {
  /** Translation key, or a category whose name may have an Arabic version. */
  label: TranslationKey | { name: string; name_ar?: string | null };
  path: string;
  query?: Record<string, string>;
}

const ANNOUNCEMENTS: TranslationKey[] = ['announce.cod', 'announce.delivery', 'announce.exchanges'];

@Component({
  selector: 'app-storefront-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Icon, MiniCart, Sheet, TranslatePipe, LocalizePipe],
  templateUrl: './storefront-layout.html',
  styleUrl: './storefront-layout.scss',
})
export class StorefrontLayout {
  private readonly router = inject(Router);
  protected readonly cart = inject(CartService);
  protected readonly account = inject(CustomerAuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly brandName = environment.brandName;
  protected readonly year = new Date().getFullYear();
  protected readonly announcements = ANNOUNCEMENTS;
  protected readonly popularSearches: TranslationKey[] = ['search.s1', 'search.s2', 'search.s3', 'search.s4'];

  protected readonly menuOpen = signal(false);
  protected readonly searchOpen = signal(false);
  protected readonly scrolled = signal(false);
  /** The home page has a dark hero, so the header starts transparent there. */
  protected readonly overHero = signal(false);
  /** Checkout uses a minimal header with no navigation (design.md §7.4). */
  protected readonly minimal = signal(false);
  protected readonly announcementIndex = signal(0);
  protected searchText = '';

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly baseLinks: NavLink[] = [
    { label: 'common.newIn', path: '/shop', query: { new: '1' } },
    { label: 'common.shopAll', path: '/shop' },
  ];
  private readonly navCategories = signal<NavLink[]>([]);
  private readonly hasCollections = signal(false);
  protected readonly navLinks = computed<NavLink[]>(() => [
    ...this.baseLinks,
    ...(this.hasCollections() ? [{ label: 'common.collections' as TranslationKey, path: '/collections' }] : []),
    ...this.navCategories(),
  ]);

  protected readonly footerGroups: { title: TranslationKey; links: NavLink[] }[] = [
    {
      title: 'footer.shop',
      links: [
        { label: 'common.newIn', path: '/shop', query: { new: '1' } },
        { label: 'common.shopAll', path: '/shop' },
        { label: 'common.collections', path: '/collections' },
        { label: 'footer.sizeGuide', path: '/pages/size-guide' },
      ],
    },
    {
      title: 'footer.help',
      links: [
        { label: 'footer.delivery', path: '/pages/delivery' },
        { label: 'footer.track', path: '/track' },
        { label: 'footer.returns', path: '/pages/returns' },
        { label: 'common.contactUs', path: '/pages/contact' },
      ],
    },
    {
      title: 'footer.company',
      links: [
        { label: 'footer.about', path: '/pages/about' },
        { label: 'footer.privacy', path: '/pages/privacy' },
        { label: 'footer.terms', path: '/pages/terms' },
      ],
    },
  ];

  protected readonly whatsappLink = `https://wa.me/${environment.whatsappNumber}`;

  constructor() {
    // Storefront pages render in the shopper's language (English default, Arabic optional).
    this.i18n.setAdminScope(false);
    this.theme.setAdminScope(false);

    const catalog = inject(CatalogService);
    catalog.categories().subscribe({
      next: (cats) => this.navCategories.set(cats.slice(0, 5).map((c) => ({ label: c, path: `/shop/${c.slug}` }))),
    });
    catalog.collections().subscribe({ next: (c) => this.hasCollections.set(c.length > 0) });

    const onScroll = () => this.scrolled.set(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = reduceMotion
      ? undefined
      : setInterval(() => this.announcementIndex.update((i) => (i + 1) % ANNOUNCEMENTS.length), 4000);

    const sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.syncRoute());
    this.syncRoute();

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', onScroll);
      if (timer) clearInterval(timer);
      sub.unsubscribe();
    });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected openSearch(): void {
    this.closeMenu();
    this.searchOpen.set(true);
    setTimeout(() => this.searchInput()?.nativeElement.focus(), 50);
  }

  protected isKey(label: NavLink['label']): label is TranslationKey {
    return typeof label === 'string';
  }

  protected switchLanguage(): void {
    this.i18n.toggle();
    this.closeMenu();
  }

  protected searchFor(key: TranslationKey): void {
    this.searchText = translate(key);
    this.submitSearch();
  }

  protected submitSearch(): void {
    const q = this.searchText.trim();
    this.searchOpen.set(false);
    void this.router.navigate(['/shop'], { queryParams: q ? { q } : {} });
  }

  private syncRoute(): void {
    const path = this.router.url.split('?')[0];
    this.overHero.set(path === '/');
    this.minimal.set(path === '/checkout');
    this.menuOpen.set(false);
  }
}
