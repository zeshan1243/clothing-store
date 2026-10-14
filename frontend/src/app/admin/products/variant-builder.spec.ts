import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormArray, FormGroup } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { VariantBuilder } from './variant-builder';

@Component({
  imports: [VariantBuilder],
  template: `<app-variant-builder [rows]="rows" productName="Summer Linen Shirt" />`,
})
class Host {
  rows = new FormArray<FormGroup>([]);
}

describe('VariantBuilder', () => {
  async function setup() {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideHttpClient()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const rows = () => fixture.componentInstance.rows.getRawValue().map((r) => `${r['sku']}|${r['colour']}|${r['size']}|${r['size_sort_order']}`);
    const click = (selector: string, text: string) => {
      [...el.querySelectorAll<HTMLElement>(selector)].find((b) => b.textContent?.trim().startsWith(text))!.click();
      fixture.detectChanges();
    };
    return { fixture, el, rows, click };
  }

  it('starts a new product with Black in S–XL and generated SKUs', async () => {
    const { rows } = await setup();
    expect(rows()).toEqual(['SLS-BLA-S|Black|S|0', 'SLS-BLA-M|Black|M|1', 'SLS-BLA-L|Black|L|2', 'SLS-BLA-XL|Black|XL|3']);
  });

  it('adds a row per colour × size and keeps sizes in the usual order', async () => {
    const { rows, click } = await setup();
    click('.preset', 'Navy');
    click('.size', 'XS');
    expect(rows()).toContain('SLS-NAV-XS|Navy|XS|0');
    expect(rows()).toContain('SLS-BLA-XL|Black|XL|4');
    expect(rows().length).toBe(10);
  });

  it('gives colours with the same first letters different codes', async () => {
    const { el, rows, click } = await setup();
    click('.preset', 'Brown');
    click('.add', 'Add colour');
    const name = el.querySelectorAll<HTMLInputElement>('.colour__name');
    const last = name[name.length - 1];
    last.value = 'Bronze';
    last.dispatchEvent(new Event('input'));
    const skus = rows().filter((r) => r.endsWith('|S|0')).map((r) => r.split('|')[0]);
    expect(skus).toEqual(['SLS-BLA-S', 'SLS-BRO-S', 'SLS-BRN-S']);
  });

  it('removes a combination with ✕ and brings it back', async () => {
    const { el, rows, fixture } = await setup();
    el.querySelectorAll<HTMLButtonElement>('.skip')[1].click(); // Black / M
    fixture.detectChanges();
    expect(rows().some((r) => r.includes('|M|'))).toBe(false);
    el.querySelector<HTMLButtonElement>('.cell--off')!.click();
    fixture.detectChanges();
    expect(rows().some((r) => r.startsWith('SLS-BLA-M|'))).toBe(true);
  });
});
