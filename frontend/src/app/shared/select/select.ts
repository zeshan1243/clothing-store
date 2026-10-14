import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { Icon } from '../icon/icon';

export interface SelectOption<T = unknown> {
  value: T;
  label: string;
  /** Optional group heading (options with the same group are listed together, in order). */
  group?: string;
  /** Small text on the right, e.g. a price. */
  hint?: string;
  disabled?: boolean;
}

let nextId = 0;

/**
 * Custom dropdown that replaces native <select>. Works with formControlName, [(ngModel)] and
 * (selectionChange). Keyboard: ↑/↓, Home/End, Enter/Space, Esc, type-ahead; optional search box.
 * The panel is position:fixed so it isn't clipped by scrolling tables or cards.
 */
@Component({
  selector: 'app-select',
  imports: [Icon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Select), multi: true }],
  host: { class: 'app-select', '[class.is-open]': 'open()', '[class.is-disabled]': 'isDisabled()' },
  template: `
    <button #trigger type="button" class="trigger trigger--{{ size() }}" [id]="inputId() || null"
      role="combobox" aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="open() && !showSearch() && activeIndex() >= 0 ? optionId(activeIndex()) : null"
      [attr.aria-invalid]="invalid() || null" [attr.aria-label]="ariaLabel() || null" [attr.aria-describedby]="describedBy() || null"
      [disabled]="isDisabled()" (click)="toggle()" (keydown)="onTriggerKey($event)" (blur)="onTouched()">
      <span class="trigger__label" [class.is-placeholder]="!selected()">{{ selected()?.label ?? placeholder() }}</span>
      @if (selected()?.hint; as h) { <span class="trigger__hint">{{ h }}</span> }
      <app-icon class="trigger__chevron" name="chevron-down" [size]="18" />
    </button>

    @if (open()) {
      <div #panel class="panel" [class.panel--up]="placement().up" [style.top.px]="placement().top" [style.left.px]="placement().left"
        [style.width.px]="placement().width" [style.max-height.px]="placement().maxHeight">
        @if (showSearch()) {
          <div class="search">
            <app-icon name="search" [size]="16" />
            <input #searchBox type="text" [placeholder]="searchPlaceholder()" [value]="query()" autocomplete="off" spellcheck="false"
              role="combobox" aria-autocomplete="list" [attr.aria-controls]="listId" aria-expanded="true"
              [attr.aria-activedescendant]="activeIndex() >= 0 ? optionId(activeIndex()) : null"
              (input)="setQuery($any($event.target).value)" (keydown)="onListKey($event)" />
          </div>
        }
        <ul class="list" role="listbox" [id]="listId" [attr.aria-label]="ariaLabel() || placeholder()" (mousedown)="$event.preventDefault()">
          @for (row of rows(); track $index) {
            @if (row.kind === 'group') {
              <li class="group" role="presentation">{{ row.label }}</li>
            } @else {
              <li class="option" role="option" [id]="optionId(row.index)" [class.is-active]="row.index === activeIndex()"
                [class.is-selected]="row.selected" [class.is-disabled]="row.option.disabled" [attr.aria-selected]="row.selected"
                [attr.aria-disabled]="row.option.disabled || null" (mouseenter)="activeIndex.set(row.index)" (click)="choose(row.index)">
                <span class="option__label">{{ row.option.label }}</span>
                @if (row.option.hint) { <span class="option__hint">{{ row.option.hint }}</span> }
                <app-icon class="option__check" name="check" [size]="16" />
              </li>
            }
          } @empty {
            <li class="empty" role="presentation">{{ emptyText() }}</li>
          }
        </ul>
      </div>
    }
  `,
  styleUrl: './select.scss',
})
export class Select<T = unknown> implements ControlValueAccessor {
  readonly options = input.required<SelectOption<T>[]>();
  readonly placeholder = input('Choose…');
  /** Id for <label for="…">. */
  readonly inputId = input<string>();
  readonly ariaLabel = input<string>();
  readonly describedBy = input<string>();
  readonly invalid = input(false);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  /** Show a search box: always, never, or automatically for long lists. */
  readonly searchable = input<boolean | 'auto'>('auto');
  readonly searchPlaceholder = input('Search…');
  readonly emptyText = input('No matches');
  readonly disabled = input(false);
  /** Fires after the user picks an option (like the native (change) event). */
  readonly selectionChange = output<T>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  protected readonly listId = `select-list-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(-1);
  protected readonly placement = signal({ top: 0, left: 0, width: 0, maxHeight: 320, up: false });
  private readonly value = signal<T | null | undefined>(undefined);
  private readonly formDisabled = signal(false);
  private typeahead = '';
  private typeaheadTimer?: ReturnType<typeof setTimeout>;

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly selected = computed(() => this.options().find((o) => Object.is(o.value, this.value()) || o.value === this.value()));
  protected readonly showSearch = computed(() => {
    const s = this.searchable();
    return s === 'auto' ? this.options().length > 8 : s;
  });
  /** Options matching the search, keeping their original index. */
  private readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.options()
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !q || option.label.toLowerCase().includes(q) || (option.group ?? '').toLowerCase().includes(q));
  });
  protected readonly rows = computed(() => {
    const out: ({ kind: 'group'; label: string } | { kind: 'option'; option: SelectOption<T>; index: number; selected: boolean })[] = [];
    let group: string | undefined;
    const current = this.selected();
    for (const { option, index } of this.visible()) {
      if (option.group && option.group !== group) out.push({ kind: 'group', label: option.group });
      group = option.group;
      out.push({ kind: 'option', option, index, selected: option === current });
    }
    return out;
  });

  private onChange: (value: T) => void = () => {};
  protected onTouched: () => void = () => {};

  constructor() {
    const onPointer = (e: PointerEvent) => {
      if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close(false);
    };
    const onViewport = (e: Event) => {
      if (!this.open()) return;
      // Scrolling inside the list itself is fine; anything else repositions the panel.
      if (e.type === 'scroll' && this.panel()?.nativeElement.contains(e.target as Node)) return;
      this.position();
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onViewport, true);
    window.addEventListener('resize', onViewport);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onViewport, true);
      window.removeEventListener('resize', onViewport);
    });
  }

  // ---- ControlValueAccessor ----
  writeValue(value: T): void {
    this.value.set(value);
  }
  registerOnChange(fn: (value: T) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  protected optionId(index: number): string {
    return `${this.listId}-o${index}`;
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.openPanel();
  }

  protected setQuery(q: string): void {
    this.query.set(q);
    const first = this.visible().find((v) => !v.option.disabled);
    this.activeIndex.set(first ? first.index : -1);
  }

  protected choose(index: number): void {
    const option = this.options()[index];
    if (!option || option.disabled) return;
    const changed = !this.selected() || this.selected() !== option;
    this.value.set(option.value);
    this.close();
    if (changed) {
      this.onChange(option.value);
      this.selectionChange.emit(option.value);
    }
  }

  protected onTriggerKey(e: KeyboardEvent): void {
    if (!this.open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        this.openPanel();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.typeAhead(e.key, true);
      }
      return;
    }
    this.onListKey(e);
  }

  protected onListKey(e: KeyboardEvent): void {
    const ids = this.visible().filter((v) => !v.option.disabled).map((v) => v.index);
    const pos = ids.indexOf(this.activeIndex());
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.activate(ids[Math.min(ids.length - 1, pos + 1)] ?? ids[0]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.activate(ids[Math.max(0, pos - 1)] ?? ids[0]);
        break;
      case 'Home':
        if (!this.showSearch()) {
          e.preventDefault();
          this.activate(ids[0]);
        }
        break;
      case 'End':
        if (!this.showSearch()) {
          e.preventDefault();
          this.activate(ids[ids.length - 1]);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (this.activeIndex() >= 0) this.choose(this.activeIndex());
        break;
      case ' ':
        if (!this.showSearch()) {
          e.preventDefault();
          if (this.activeIndex() >= 0) this.choose(this.activeIndex());
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
      case 'Tab':
        this.close(false);
        break;
      default:
        if (!this.showSearch() && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) this.typeAhead(e.key, false);
    }
  }

  private openPanel(): void {
    if (this.isDisabled()) return;
    this.query.set('');
    const current = this.selected();
    const first = this.options().findIndex((o) => !o.disabled);
    this.activeIndex.set(current ? this.options().indexOf(current) : first);
    this.position();
    this.open.set(true);
    setTimeout(() => {
      this.searchBox()?.nativeElement.focus();
      this.scrollActiveIntoView();
    });
  }

  private close(returnFocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    this.query.set('');
    if (returnFocus) this.trigger().nativeElement.focus();
  }

  private activate(index: number | undefined): void {
    if (index === undefined) return;
    this.activeIndex.set(index);
    this.scrollActiveIntoView();
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => document.getElementById(this.optionId(this.activeIndex()))?.scrollIntoView({ block: 'nearest' }));
  }

  /** Jump to the next option starting with the typed letters (like a native select). */
  private typeAhead(char: string, selectWhenClosed: boolean): void {
    clearTimeout(this.typeaheadTimer);
    this.typeahead += char.toLowerCase();
    this.typeaheadTimer = setTimeout(() => (this.typeahead = ''), 600);
    const match = this.options().findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(this.typeahead));
    if (match < 0) return;
    if (selectWhenClosed) this.choose(match);
    else this.activate(match);
  }

  /** Place the panel under the trigger, or above it when there isn't room below. */
  private position(): void {
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const gap = 6;
    const margin = 12;
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const wanted = 340;
    const up = below < Math.min(wanted, 220) && above > below;
    const maxHeight = Math.max(160, Math.min(wanted, up ? above : below));
    const width = Math.max(rect.width, 200);
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    this.placement.set({ top: up ? rect.top - gap - maxHeight : rect.bottom + gap, left, width, maxHeight, up });
  }
}
