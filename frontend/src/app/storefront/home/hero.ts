import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { ProductCard } from '../../core/catalog.models';
import { LocalizePipe, TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { QarPipe } from '../../core/qar.pipe';
import { Icon } from '../../shared/icon/icon';

/**
 * Home hero: light editorial layout (bone background, ink type, one volt highlight) with an arched
 * photo of the drop. CSS keyframes handle the intro; pointer parallax and scroll effects write CSS
 * variables from requestAnimationFrame (no change detection). Motion is skipped under
 * prefers-reduced-motion and on coarse pointers / low-end devices.
 */
@Component({
  selector: 'app-hero',
  imports: [RouterLink, QarPipe, Icon, TranslatePipe, LocalizePipe],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Featured products shown as floating mini-cards on desktop. */
  readonly products = input<ProductCard[]>([]);

  protected readonly imageUrl = environment.heroImageUrl;
  private readonly i18n = inject(I18nService);
  /** Headline lines from the translation ("Built|for the|city."); the last line gets the highlight. */
  protected readonly headline = computed(() => {
    this.i18n.lang();
    return translate('hero.headline').split('|');
  });
  protected readonly headlineText = computed(() => this.headline().join(' '));

  /** The product pictured in the arch: real photography first (demo placeholder art is skipped). */
  protected readonly lead = computed(() => {
    const withPhotos = this.products().filter((p) => isPhoto(p.image_url));
    return withPhotos.find((p) => isPhoto(p.hover_image_url)) ?? withPhotos[0] ?? null;
  });

  /** Small floating thumbnail: another photographed product, else the lead's second photo. */
  protected readonly thumb = computed(() => {
    const lead = this.lead();
    const other = this.products().find((p) => p.id !== lead?.id && isPhoto(p.image_url));
    if (other) return { slug: other.slug, url: other.image_url! };
    if (lead && isPhoto(lead.hover_image_url)) return { slug: lead.slug, url: lead.hover_image_url! };
    return null;
  });

  private frame = 0;
  private visible = true;
  private target = { x: 0, y: 0 };
  private current = { x: 0, y: 0 };
  private cleanup: (() => void)[] = [];

  ngAfterViewInit(): void {
    const root = this.host.nativeElement as HTMLElement;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    // Pause infinite loops when the hero is off-screen or the tab is hidden.
    const io = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      root.classList.toggle('is-paused', !this.visible);
    });
    io.observe(root);
    this.cleanup.push(() => io.disconnect());

    const onScroll = () => {
      const progress = Math.min(window.scrollY / Math.max(root.offsetHeight, 1), 1);
      root.style.setProperty('--scroll', progress.toFixed(3));
      root.classList.toggle('has-scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    this.cleanup.push(() => window.removeEventListener('scroll', onScroll));

    const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;
    const finePointer = matchMedia('(pointer: fine)').matches;
    if (!finePointer || lowEnd) return;

    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      this.target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => (this.target = { x: 0, y: 0 });
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    this.cleanup.push(() => {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
    });

    const tick = () => {
      if (this.visible && !document.hidden) {
        this.current.x += (this.target.x - this.current.x) * 0.08;
        this.current.y += (this.target.y - this.current.y) * 0.08;
        root.style.setProperty('--px', this.current.x.toFixed(4));
        root.style.setProperty('--py', this.current.y.toFixed(4));
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  /** Magnetic primary button: follows the pointer within its own bounds (desktop). */
  protected magnet(event: PointerEvent, el: HTMLElement): void {
    if (event.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const dx = (event.clientX - (r.left + r.width / 2)) * 0.25;
    const dy = (event.clientY - (r.top + r.height / 2)) * 0.35;
    el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  }

  protected release(el: HTMLElement): void {
    el.style.transform = '';
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.cleanup.forEach((fn) => fn());
  }
}

/** Demo seed images are generated placeholders; never feature them in the hero. */
function isPhoto(url: string | null | undefined): url is string {
  return !!url && !url.includes('placehold.co');
}
