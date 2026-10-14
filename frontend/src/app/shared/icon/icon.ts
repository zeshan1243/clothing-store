import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  ArrowRight,
  ArrowUpDown,
  Banknote,
  Boxes,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Copy,
  Ellipsis,
  FileText,
  Info,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Minus,
  Moon,
  Package,
  Phone,
  Plus,
  Receipt,
  Repeat,
  Ruler,
  Search,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Sun,
  Tags,
  Trash2,
  TicketPercent,
  TriangleAlert,
  Truck,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-static';

/** Lucide icons used in the app (design.md §6.9: one outline set, 1.75px stroke). */
const ICONS = {
  'arrow-right': ArrowRight,
  'arrow-up-down': ArrowUpDown,
  banknote: Banknote,
  boxes: Boxes,
  chart: ChartColumn,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-check': CircleCheck,
  clock: Clock,
  copy: Copy,
  ellipsis: Ellipsis,
  'file-text': FileText,
  info: Info,
  layers: Layers,
  dashboard: LayoutDashboard,
  'log-out': LogOut,
  menu: Menu,
  message: MessageCircle,
  minus: Minus,
  moon: Moon,
  package: Package,
  phone: Phone,
  plus: Plus,
  receipt: Receipt,
  repeat: Repeat,
  ruler: Ruler,
  search: Search,
  shirt: Shirt,
  bag: ShoppingBag,
  sliders: SlidersHorizontal,
  store: Store,
  sun: Sun,
  tags: Tags,
  trash: Trash2,
  ticket: TicketPercent,
  alert: TriangleAlert,
  truck: Truck,
  user: User,
  users: Users,
  wallet: Wallet,
  x: X,
} as const;

export type IconName = keyof typeof ICONS;

/** Icons that point along the reading direction; they're mirrored in right-to-left layouts. */
const DIRECTIONAL = new Set<IconName>(['arrow-right', 'chevron-left', 'chevron-right']);

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    'aria-hidden': 'true',
    '[innerHTML]': 'svg()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[class.icon--directional]': 'directional()',
  },
  styles: `
    :host { display: inline-flex; flex: none; line-height: 0; }
    :host ::ng-deep svg { width: 100%; height: 100%; }
    :host-context([dir='rtl']).icon--directional ::ng-deep svg { transform: scaleX(-1); }
  `,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  readonly size = input(20);
  protected readonly directional = computed(() => DIRECTIONAL.has(this.name()));

  protected readonly svg = computed<SafeHtml>(() =>
    // Static strings bundled from lucide-static (no user input), so bypassing sanitisation is safe.
    this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()].replace('stroke-width="2"', 'stroke-width="1.75"')),
  );
}
