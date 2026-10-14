import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormArray, FormGroup, NonNullableFormBuilder, Validators } from '@angular/forms';

import { apiErrorMessage } from '../../core/api-error';
import { Icon } from '../../shared/icon/icon';
import { AdminCatalogService, AdminProduct, AdminVariant } from '../admin-catalog.service';
import { AdminToastService } from '../shared/admin-toast.service';

const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'];
const COLOUR_PRESETS = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Bone', hex: '#e7e1d6' },
  { name: 'Grey', hex: '#9a9a9a' },
  { name: 'Navy', hex: '#1f2a44' },
  { name: 'Olive', hex: '#556b2f' },
  { name: 'Sand', hex: '#c8b38a' },
  { name: 'Brown', hex: '#6b4a32' },
];
const HEX = /^#[0-9a-fA-F]{6}$/;
const LOW = 3;

interface Colour {
  key: number;
  name: string;
  hex: string;
}

/**
 * Variant builder: pick colours and sizes, type stock in a colour × size grid. SKUs are generated
 * (PREFIX-COL-SIZE) and kept in step with the names; they can be overridden under "Advanced".
 * Works directly on the product form's `variants` FormArray.
 */
@Component({
  selector: 'app-variant-builder',
  imports: [Icon],
  templateUrl: './variant-builder.html',
  styleUrls: ['../admin-shared.scss', './variant-builder.scss'],
})
export class VariantBuilder {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(AdminCatalogService);
  private readonly toast = inject(AdminToastService);

  readonly rows = input.required<FormArray<FormGroup>>();
  /** Saved product (null while creating): used for stock, reserved and deleting saved variants. */
  readonly product = input<AdminProduct | null>(null);
  readonly productName = input('');
  /** Bumped by the parent whenever it reloads the rows (after load/save). */
  readonly revision = input(0);
  readonly productChanged = output<AdminProduct>();

  protected readonly sizePresets = SIZE_PRESETS;
  protected readonly colourPresets = COLOUR_PRESETS;
  protected readonly low = LOW;

  protected readonly colours = signal<Colour[]>([]);
  protected readonly sizes = signal<string[]>([]);
  /** New colour × size combinations the admin switched off ("colourKey|SIZE"). */
  private readonly skipped = signal<Set<string>>(new Set());
  /** Bumped on every FormArray change so the grid re-reads the rows. */
  private readonly version = signal(0);
  protected readonly prefix = signal('');
  private prefixEdited = false;
  protected readonly advanced = signal(false);
  protected readonly busyId = signal<number | null>(null);
  protected customSize = '';

  private nextKey = 1;
  private readonly keyOf = new WeakMap<FormGroup, number>();
  /** Rows whose SKU is generated (and follows colour/size/prefix changes). */
  private readonly autoSku = new WeakSet<FormGroup>();

  protected readonly savedById = computed(() => new Map((this.product()?.variants ?? []).map((v) => [v.id, v])));
  protected readonly customSizes = computed(() => this.sizes().filter((s) => !SIZE_PRESETS.includes(s)));
  protected readonly unusedPresets = computed(() => {
    const names = new Set(this.colours().map((c) => c.name.trim().toLowerCase()));
    return COLOUR_PRESETS.filter((p) => !names.has(p.name.toLowerCase()));
  });
  /** Every row with its labels, for the Advanced table. */
  protected readonly rowList = computed(() => {
    this.version();
    const colours = new Map(this.colours().map((c) => [c.key, c]));
    const colourOrder = new Map(this.colours().map((c, i) => [c.key, i]));
    const sizes = this.sizes();
    const sizeIndex = (row: FormGroup) => sizes.findIndex((s) => sameSize(s, row.controls['size'].value));
    return this.rows()
      .controls.map((row, index) => ({
        row,
        index,
        colour: colours.get(this.keyOf.get(row) ?? -1),
        saved: row.controls['id'].value !== null ? this.savedById().get(row.controls['id'].value) : undefined,
      }))
      .sort(
        (a, b) =>
          (colourOrder.get(this.keyOf.get(a.row) ?? -1) ?? 99) - (colourOrder.get(this.keyOf.get(b.row) ?? -1) ?? 99) ||
          sizeIndex(a.row) - sizeIndex(b.row),
      );
  });
  protected readonly count = computed(() => {
    this.version();
    return this.rows().length;
  });

  constructor() {
    // (Re)build the colour and size lists whenever the parent loads new rows.
    effect(() => {
      this.revision();
      const rows = this.rows();
      untracked(() => this.init(rows));
    });
    effect((onCleanup) => {
      const sub = this.rows().valueChanges.subscribe(() => this.version.update((v) => v + 1));
      onCleanup(() => sub.unsubscribe());
    });
    // Until the admin types their own prefix, follow the product name (new products only).
    effect(() => {
      const name = this.productName();
      untracked(() => {
        if (this.prefixEdited || this.hasSaved()) return;
        this.prefix.set(prefixFrom(name));
        this.refreshSkus();
      });
    });
    inject(DestroyRef);
  }

  // ---------- Grid ----------

  protected cell(colour: Colour, size: string) {
    this.version();
    const row = this.find(colour.key, size);
    const id = row?.controls['id'].value as number | null | undefined;
    return {
      row,
      saved: id != null ? this.savedById().get(id) : undefined,
      skipped: this.skipped().has(comboKey(colour.key, size)),
    };
  }

  protected setInitialStock(row: FormGroup, value: string): void {
    const n = Math.max(0, Math.trunc(Number(value)) || 0);
    row.controls['initial_stock'].setValue(n);
    row.markAsDirty();
  }

  /** Saved variants: changing the number records a stock correction straight away. */
  protected adjustStock(variant: AdminVariant, el: HTMLInputElement): void {
    const target = Math.trunc(Number(el.value));
    if (!Number.isFinite(target) || target < 0) {
      el.value = String(variant.stock_quantity);
      return;
    }
    const change = target - variant.stock_quantity;
    if (!change) return;
    this.busyId.set(variant.id);
    this.api
      .adjustStock({
        product_variant_id: variant.id,
        movement_type: 'ADJUSTMENT',
        quantity_change: change,
        reason: `Stock count update (${variant.stock_quantity} → ${target})`,
      })
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.toast.success(`${variant.sku}: stock ${variant.stock_quantity} → ${target}.`);
          this.reloadProduct();
        },
        error: (err: unknown) => {
          this.busyId.set(null);
          el.value = String(variant.stock_quantity);
          this.toast.error(apiErrorMessage(err, 'Could not update stock.'));
        },
      });
  }

  protected skip(colour: Colour, size: string): void {
    this.skipped.update((s) => new Set(s).add(comboKey(colour.key, size)));
    this.sync();
  }

  protected unskip(colour: Colour, size: string): void {
    this.skipped.update((s) => {
      const next = new Set(s);
      next.delete(comboKey(colour.key, size));
      return next;
    });
    this.sync();
  }

  // ---------- Colours ----------

  protected addColour(name = '', hex = '#111111'): void {
    this.colours.update((list) => [...list, { key: this.nextKey++, name, hex }]);
    this.sync();
    if (!name) setTimeout(() => document.getElementById(`colour-name-${this.nextKey - 1}`)?.focus());
  }

  protected renameColour(colour: Colour, name: string): void {
    this.updateColour(colour.key, { name });
  }

  protected recolour(colour: Colour, hex: string): void {
    if (HEX.test(hex)) this.updateColour(colour.key, { hex: hex.toLowerCase() });
  }

  protected removeColour(colour: Colour): void {
    if (this.savedRows().some((r) => this.keyOf.get(r) === colour.key)) {
      this.toast.error(`${colour.name || 'This colour'} has saved variants. Delete or hide them under "Advanced" first.`);
      return;
    }
    this.colours.update((list) => list.filter((c) => c.key !== colour.key));
    this.sync();
  }

  protected duplicateName(colour: Colour): boolean {
    const name = colour.name.trim().toLowerCase();
    return !!name && this.colours().some((c) => c.key !== colour.key && c.name.trim().toLowerCase() === name);
  }

  // ---------- Sizes ----------

  protected isSize(size: string): boolean {
    return this.sizes().includes(size);
  }

  protected toggleSize(size: string): void {
    if (this.isSize(size)) {
      if (this.savedRows().some((r) => sameSize(r.controls['size'].value, size))) {
        this.toast.error(`Size ${size} has saved variants. Delete or hide them under "Advanced" first.`);
        return;
      }
      this.sizes.update((list) => list.filter((s) => s !== size));
    } else {
      this.sizes.update((list) => orderSizes([...list, size]));
    }
    this.sync();
  }

  protected addCustomSize(): void {
    const size = this.customSize.trim().toUpperCase();
    this.customSize = '';
    if (!size) return;
    if (this.sizes().some((s) => sameSize(s, size))) return;
    this.sizes.update((list) => orderSizes([...list, size]));
    this.sync();
  }

  // ---------- Advanced ----------

  protected setPrefix(value: string): void {
    this.prefixEdited = true;
    this.prefix.set(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
    this.refreshSkus();
  }

  protected editSku(row: FormGroup, value: string): void {
    this.autoSku.delete(row);
    row.controls['sku'].setValue(value.toUpperCase().trim());
    row.markAsDirty();
  }

  /** Regenerate every SKU (including saved ones) from prefix, colour and size. */
  protected resetSkus(): void {
    if (this.hasSaved() && !confirm('Regenerate the SKUs of all variants, including saved ones? Old orders keep the SKU they were placed with.')) return;
    for (const row of this.rows().controls) this.autoSku.add(row);
    this.refreshSkus(true);
    this.toast.info('SKUs regenerated. Save the product to keep them.');
  }

  protected setLowAt(row: FormGroup, value: string): void {
    row.controls['low_stock_threshold'].setValue(value === '' ? null : Math.max(0, Math.trunc(Number(value)) || 0));
    row.markAsDirty();
  }

  protected setActive(row: FormGroup, active: boolean): void {
    row.controls['is_active'].setValue(active);
    row.markAsDirty();
  }

  protected deleteRow(item: { row: FormGroup; saved?: AdminVariant }): void {
    const row = item.row;
    const key = this.keyOf.get(row);
    const size = row.controls['size'].value as string;
    if (!item.saved) {
      if (key !== undefined) this.skip({ key, name: '', hex: '' }, size);
      return;
    }
    const product = this.product();
    if (!product) return;
    if (!confirm(`Delete ${item.saved.sku} (${item.saved.colour} / ${item.saved.size})? Its stock history is removed too.`)) return;
    this.busyId.set(item.saved.id);
    this.api.deleteVariant(product.id, item.saved.id).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        const at = this.rows().controls.indexOf(row);
        if (at >= 0) this.rows().removeAt(at);
        if (key !== undefined) this.skipped.update((s) => new Set(s).add(comboKey(key, size)));
        this.productChanged.emit(updated);
        this.toast.success(`${item.saved!.sku} deleted.`);
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.toast.error(apiErrorMessage(err, 'Could not delete the variant.'));
      },
    });
  }

  // ---------- Internals ----------

  private init(rows: FormArray<FormGroup>): void {
    const colours: Colour[] = [];
    const byName = new Map<string, Colour>();
    const sizeSet: string[] = [];
    for (const row of rows.controls) {
      const name = String(row.controls['colour'].value ?? '');
      const lower = name.trim().toLowerCase();
      let colour = byName.get(lower);
      if (!colour) {
        colour = { key: this.nextKey++, name, hex: row.controls['colour_hex'].value || '#cccccc' };
        byName.set(lower, colour);
        colours.push(colour);
      }
      this.keyOf.set(row, colour.key);
      if (row.controls['id'].value === null) this.autoSku.add(row);
      const size = String(row.controls['size'].value ?? '');
      if (size && !sizeSet.some((s) => sameSize(s, size))) sizeSet.push(size);
    }
    // Brand-new product: start with Black in S–XL so there is something to fill in.
    if (!rows.length && !this.product()) {
      this.colours.set([{ key: this.nextKey++, name: 'Black', hex: '#111111' }]);
      this.sizes.set(['S', 'M', 'L', 'XL']);
    } else {
      this.colours.set(colours);
      // Always the usual order (XS → XXL, then numbers), whatever order the rows were saved in.
      this.sizes.set(orderSizes(sizeSet));
    }
    // Existing products: combinations that don't exist yet start as "not offered" instead of
    // silently becoming new 0-stock variants. New colours/sizes added later fill in normally.
    const skipped = new Set<string>();
    if (rows.length) {
      for (const c of this.colours()) {
        for (const s of this.sizes()) {
          if (!rows.controls.some((r) => this.keyOf.get(r) === c.key && sameSize(r.controls['size'].value, s))) skipped.add(comboKey(c.key, s));
        }
      }
    }
    this.skipped.set(skipped);
    const firstSaved = rows.controls.find((r) => r.controls['id'].value !== null);
    if (firstSaved) this.prefix.set(String(firstSaved.controls['sku'].value).split('-')[0] || prefixFrom(this.productName()));
    else if (!this.prefixEdited) this.prefix.set(prefixFrom(this.productName()));
    this.sync();
  }

  /** Make the rows match colours × sizes (minus skipped), keep sort order and auto SKUs current. */
  private sync(): void {
    const rows = this.rows();
    const colours = this.colours();
    const sizes = this.sizes();
    const skipped = this.skipped();
    // Drop unsaved rows that no longer belong to the grid.
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows.at(i);
      if (row.controls['id'].value !== null) continue;
      const key = this.keyOf.get(row);
      const size = row.controls['size'].value as string;
      const keep = colours.some((c) => c.key === key) && sizes.some((s) => sameSize(s, size)) && !skipped.has(comboKey(key!, size));
      if (!keep) rows.removeAt(i);
    }
    // Add missing combinations.
    for (const colour of colours) {
      for (const size of sizes) {
        if (skipped.has(comboKey(colour.key, size)) || this.find(colour.key, size)) continue;
        const row = this.newRow(colour, size);
        this.keyOf.set(row, colour.key);
        this.autoSku.add(row);
        rows.push(row);
      }
    }
    // Size order follows the chip order.
    for (const row of rows.controls) {
      const index = sizes.findIndex((s) => sameSize(s, row.controls['size'].value));
      if (index >= 0 && row.controls['size_sort_order'].value !== index) row.controls['size_sort_order'].setValue(index);
    }
    this.refreshSkus();
    rows.markAsDirty();
    this.version.update((v) => v + 1);
  }

  private updateColour(key: number, patch: Partial<Colour>): void {
    this.colours.update((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    const colour = this.colours().find((c) => c.key === key)!;
    for (const row of this.rows().controls) {
      if (this.keyOf.get(row) !== key) continue;
      row.controls['colour'].setValue(colour.name.trim());
      row.controls['colour_hex'].setValue(colour.hex);
      row.markAsDirty();
    }
    this.refreshSkus();
  }

  private refreshSkus(includeSaved = false): void {
    const taken = new Set<string>();
    for (const row of this.rows().controls) {
      const regenerate = this.autoSku.has(row) && (includeSaved || row.controls['id'].value === null);
      if (!regenerate) taken.add(String(row.controls['sku'].value).toUpperCase());
    }
    for (const row of this.rows().controls) {
      const regenerate = this.autoSku.has(row) && (includeSaved || row.controls['id'].value === null);
      if (!regenerate) continue;
      const colour = this.colours().find((c) => c.key === this.keyOf.get(row));
      let sku = makeSku(this.prefix() || 'SKU', this.colourCode(colour), row.controls['size'].value);
      for (let n = 2; taken.has(sku); n++) sku = `${makeSku(this.prefix() || 'SKU', this.colourCode(colour), row.controls['size'].value)}-${n}`;
      taken.add(sku);
      if (row.controls['sku'].value !== sku) row.controls['sku'].setValue(sku);
    }
  }

  /** Three letters per colour, made unique within the product (Black → BLA, Blue → BLU, Blush → BLS…). */
  private colourCode(colour: Colour | undefined): string {
    if (!colour) return 'COL';
    const used = new Set<string>();
    for (const c of this.colours()) {
      if (c.key === colour.key) break;
      used.add(codeFor(c.name, used));
    }
    return codeFor(colour.name, used);
  }

  private find(key: number, size: string): FormGroup | undefined {
    return this.rows().controls.find((r) => this.keyOf.get(r) === key && sameSize(r.controls['size'].value, size));
  }

  private savedRows(): FormGroup[] {
    return this.rows().controls.filter((r) => r.controls['id'].value !== null);
  }

  private hasSaved(): boolean {
    return this.savedRows().length > 0;
  }

  private newRow(colour: Colour, size: string): FormGroup {
    return this.fb.group({
      id: this.fb.control<number | null>(null),
      sku: ['', [Validators.required, Validators.maxLength(64)]],
      colour: [colour.name.trim(), Validators.required],
      colour_hex: [colour.hex, Validators.pattern(HEX)],
      size: [size, Validators.required],
      size_sort_order: [0],
      low_stock_threshold: this.fb.control<number | null>(null),
      is_active: [true],
      initial_stock: [0, [Validators.min(0)]],
      stock_quantity: [{ value: 0, disabled: true }],
      reserved_quantity: [{ value: 0, disabled: true }],
    });
  }

  private reloadProduct(): void {
    const product = this.product();
    if (!product) return;
    this.api.product(product.id).subscribe({ next: (fresh) => this.productChanged.emit(fresh) });
  }
}

function comboKey(colourKey: number, size: string): string {
  return `${colourKey}|${String(size).trim().toUpperCase()}`;
}

function sameSize(a: unknown, b: unknown): boolean {
  return String(a).trim().toUpperCase() === String(b).trim().toUpperCase();
}

/** Presets in their usual order, then custom sizes (numbers ascending, others as added). */
function orderSizes(list: string[]): string[] {
  const presets = SIZE_PRESETS.filter((p) => list.some((s) => sameSize(s, p)));
  const custom = list.filter((s) => !SIZE_PRESETS.some((p) => sameSize(p, s)));
  const numeric = custom.filter((s) => /^\d+(\.\d+)?$/.test(s)).sort((a, b) => Number(a) - Number(b));
  const other = custom.filter((s) => !/^\d+(\.\d+)?$/.test(s));
  return [...presets, ...numeric, ...other];
}

function prefixFrom(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return 'SKU';
  return words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join('').slice(0, 4);
}

function codeFor(name: string, used: Set<string>): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'COL';
  const candidates = [
    letters.slice(0, 3),
    letters[0] + (letters.slice(1).replace(/[AEIOU]/g, '') + 'XX').slice(0, 2),
    letters[0] + letters.slice(-2),
  ];
  for (const c of candidates) if (c.length === 3 && !used.has(c)) return c;
  for (let n = 2; ; n++) if (!used.has(`${letters.slice(0, 2)}${n}`)) return `${letters.slice(0, 2)}${n}`;
}

function makeSku(prefix: string, colourCode: string, size: unknown): string {
  const sizeCode = String(size).toUpperCase().replace(/ONE\s*SIZE/, 'OS').replace(/\s+/g, '');
  return `${prefix}-${colourCode}-${sizeCode}`;
}
