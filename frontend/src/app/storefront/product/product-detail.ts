import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { CartService, MAX_QUANTITY_PER_LINE } from '../../core/cart.service';
import { ProductCard as ProductCardModel, ProductDetail as ProductDetailModel, PublicVariant, percentOff } from '../../core/catalog.models';
import { CatalogService } from '../../core/catalog.service';
import { QarPipe } from '../../core/qar.pipe';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { Icon } from '../../shared/icon/icon';
import { ProductCard } from '../../shared/product-card/product-card';
import { Sheet } from '../../shared/sheet/sheet';
import { ToastService } from '../../shared/toast/toast.service';

const LOW_STOCK = 3;
const CM_PER_INCH = 2.54;

/** Product details page (design.md §7.4): size-first, sticky add-to-cart on mobile. */
@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, QarPipe, Icon, ProductCard, Sheet, TranslatePipe, LocalizePipe],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
})
export class ProductDetail {
  private readonly catalog = inject(CatalogService);
  private readonly cart = inject(CartService);
  private readonly seo = inject(SeoService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  /** Route param :slug */
  readonly slug = input.required<string>();

  protected readonly product = signal<ProductDetailModel | null>(null);
  protected readonly saleOff = computed(() => {
    const p = this.product();
    return p ? percentOff(p.base_price, p.sale_price) : null;
  });
  protected readonly related = signal<ProductCardModel[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly selectedColour = signal<string | null>(null);
  protected readonly selectedSize = signal<string | null>(null);
  protected readonly quantity = signal(1);
  protected readonly activeImage = signal(0);
  protected readonly sizeError = signal(false);
  protected readonly justAdded = signal(false);
  protected readonly sizeGuideOpen = signal(false);
  protected readonly guideUnit = signal<'cm' | 'in'>('cm');
  protected readonly lowStock = LOW_STOCK;

  private readonly sizePicker = viewChild<ElementRef<HTMLElement>>('sizePicker');
  private readonly gallery = viewChild<ElementRef<HTMLElement>>('gallery');

  protected readonly colours = computed(() => {
    const seen = new Map<string, { name: string; hex: string | null; available: boolean }>();
    for (const v of this.product()?.variants ?? []) {
      const entry = seen.get(v.colour) ?? { name: v.colour, hex: v.colour_hex, available: false };
      entry.available ||= v.available_quantity > 0;
      seen.set(v.colour, entry);
    }
    return [...seen.values()];
  });

  protected readonly sizes = computed(() =>
    (this.product()?.variants ?? []).filter((v) => v.colour === this.selectedColour()),
  );

  protected readonly selectedVariant = computed<PublicVariant | null>(
    () => this.sizes().find((v) => v.size === this.selectedSize()) ?? null,
  );

  protected readonly maxQuantity = computed(() =>
    Math.min(this.selectedVariant()?.available_quantity ?? 0, MAX_QUANTITY_PER_LINE),
  );

  /** Gallery in the admin's order (stable: reordering the slides made the scroll land on the wrong one). */
  protected readonly images = computed(() => [...(this.product()?.images ?? [])].sort((a, b) => a.sort_order - b.sort_order));

  /** Size-guide table, converted to inches on request (first column is the size label). */
  protected readonly guideRows = computed(() => {
    const content = this.product()?.size_guide?.content;
    const rows = content?.rows ?? [];
    if (this.guideUnit() === 'cm' || content?.unit !== 'cm') return rows;
    return rows.map((row) =>
      row.map((cell, i) => (i === 0 || isNaN(Number(cell)) ? cell : (Number(cell) / CM_PER_INCH).toFixed(1))),
    );
  });

  protected readonly whatsappLink = computed(() => {
    const p = this.product();
    if (!p) return '';
    this.i18n.lang();
    const text = translate('pdp.whatsappText', { name: this.localName(p), url: `${location.origin}/products/${p.slug}` });
    return `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(text)}`;
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.state.set('loading');
      this.related.set([]);
      this.catalog.product(slug).subscribe({
        next: (product) => this.onLoaded(product),
        error: (err: unknown) => {
          this.state.set(err instanceof HttpErrorResponse && err.status === 404 ? 'not-found' : 'error');
          this.seo.set(translate('pdp.notFound'));
        },
      });
    });
  }

  protected selectColour(colour: string): void {
    this.selectedColour.set(colour);
    this.showColourImage(colour);
    const variant = this.sizes().find((v) => v.size === this.selectedSize());
    if (!variant || variant.available_quantity === 0) this.selectedSize.set(null);
    this.clampQuantity();
  }

  protected selectSize(variant: PublicVariant): void {
    if (variant.available_quantity === 0) return;
    this.selectedSize.set(variant.size);
    this.sizeError.set(false);
    this.clampQuantity();
  }

  protected changeQuantity(delta: number): void {
    this.quantity.update((q) => Math.min(Math.max(1, q + delta), Math.max(1, this.maxQuantity())));
  }

  protected addToCart(): void {
    const product = this.product();
    const variant = this.selectedVariant();
    if (!product) return;
    if (!variant) {
      // design.md §6.3: scroll to the selector, shake it, ask for a size.
      this.sizeError.set(false);
      requestAnimationFrame(() => this.sizeError.set(true));
      this.sizePicker()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const image = product.images.find((i) => sameColour(i.colour, variant.colour)) ?? product.images[0];
    this.cart.add({
      variantId: variant.id,
      productSlug: product.slug,
      productName: product.name,
      productName_ar: product.name_ar ?? null,
      sku: variant.sku,
      colour: variant.colour,
      size: variant.size,
      imageUrl: image?.image_url ?? null,
      unitPrice: product.price,
      quantity: this.quantity(),
      maxQuantity: variant.available_quantity,
    });
    this.justAdded.set(true);
    setTimeout(() => this.justAdded.set(false), 1600);
    this.toast.show(translate('pdp.addedToast'), {
      tone: 'success',
      action: { label: translate('common.viewCart'), link: '/cart' },
    });
    this.cart.drawerOpen.set(true);
  }

  /** Gallery: thumbnails / dots scroll the snap container; scrolling updates the active dot. */
  protected goToImage(index: number, smooth = true): void {
    this.activeImage.set(index);
    const el = this.gallery()?.nativeElement;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el?.scrollTo({ left: index * el.clientWidth, behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  /** Thumbnail click: show it, and if the photo is tagged with one of the product's colours, select that colour. */
  protected pickThumbnail(index: number): void {
    this.goToImage(index);
    const tagged = this.images()[index]?.colour;
    const colour = tagged && this.colours().find((c) => sameColour(c.name, tagged));
    if (colour && !sameColour(colour.name, this.selectedColour())) {
      this.selectedColour.set(colour.name);
      const variant = this.sizes().find((v) => v.size === this.selectedSize());
      if (!variant || variant.available_quantity === 0) this.selectedSize.set(null);
      this.clampQuantity();
    }
  }

  /** Jump to the first photo tagged with this colour (untagged products just stay where they are). */
  private showColourImage(colour: string | null, smooth = true): void {
    const index = this.images().findIndex((img) => sameColour(img.colour, colour));
    if (index >= 0) this.goToImage(index, smooth);
  }

  protected onGalleryScroll(el: HTMLElement): void {
    const index = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
    if (index !== this.activeImage()) this.activeImage.set(index);
  }

  private onLoaded(product: ProductDetailModel): void {
    this.product.set(product);
    this.state.set('ready');
    const firstAvailable = product.variants.find((v) => v.available_quantity > 0) ?? product.variants[0];
    this.selectedColour.set(firstAvailable?.colour ?? null);
    this.selectedSize.set(null);
    this.sizeError.set(false);
    this.quantity.set(1);
    this.activeImage.set(0);
    // Open on the photo of the colour that's selected (after the gallery has rendered).
    setTimeout(() => this.showColourImage(this.selectedColour(), false));

    const arabic = this.i18n.isArabic();
    this.seo.set(
      arabic ? this.localName(product) : product.meta_title || product.name,
      arabic ? product.description_ar || product.description : product.meta_description || product.description,
      product.images[0]?.image_url,
    );
    this.seo.setStructuredData({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description ?? undefined,
      image: product.images.map((i) => i.image_url),
      sku: product.variants[0]?.sku,
      brand: { '@type': 'Brand', name: environment.brandName },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'QAR',
        price: product.price,
        availability: product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: location.href,
      },
    });

    this.catalog
      .products({ category: product.category_slug ?? undefined, exclude: product.id, page_size: 4, in_stock: true })
      .subscribe({ next: (page) => this.related.set(page.items) });
  }

  private localName(p: ProductDetailModel): string {
    return (this.i18n.isArabic() && p.name_ar) || p.name;
  }

  private clampQuantity(): void {
    this.quantity.update((q) => Math.min(q, Math.max(1, this.maxQuantity())));
  }
}

function sameColour(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}
