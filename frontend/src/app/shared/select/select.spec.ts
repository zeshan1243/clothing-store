import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { Select, SelectOption } from './select';

@Component({
  imports: [ReactiveFormsModule, Select],
  template: `<app-select [formControl]="control" [options]="options" [searchable]="searchable" />`,
})
class Host {
  control = new FormControl<number | null>(2);
  searchable: boolean | 'auto' = false;
  options: SelectOption<number | null>[] = [
    { value: null, label: 'None' },
    { value: 1, label: 'Al Khor', group: 'Charged' },
    { value: 2, label: 'Al Sadd', group: 'Free' },
    { value: 3, label: 'Dukhan', group: 'Charged', disabled: true },
  ];
}

describe('Select', () => {
  async function setup(searchable: boolean | 'auto' = false) {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.searchable = searchable;
    fixture.detectChanges();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const trigger = el.querySelector<HTMLButtonElement>('.trigger')!;
    return { fixture, el, trigger };
  }

  const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('shows the selected label from the form value', async () => {
    const { trigger } = await setup();
    expect(trigger.textContent).toContain('Al Sadd');
  });

  it('opens on click, lists groups and writes the chosen value back to the form', async () => {
    const { fixture, el, trigger } = await setup();
    trigger.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('[role="option"]').length).toBe(4);
    expect([...el.querySelectorAll('.group')].map((g) => g.textContent?.trim())).toEqual(['Charged', 'Free', 'Charged']);
    el.querySelectorAll<HTMLElement>('[role="option"]')[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe(1);
    expect(el.querySelector('.panel')).toBeNull();
  });

  it('supports the keyboard and skips disabled options', async () => {
    const { fixture, el, trigger } = await setup();
    key(trigger, 'ArrowDown'); // open on Al Sadd
    fixture.detectChanges();
    key(trigger, 'ArrowDown'); // Dukhan is disabled → stays on Al Sadd
    key(trigger, 'ArrowUp'); // Al Khor
    key(trigger, 'Enter');
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe(1);
    expect(el.querySelector('.panel')).toBeNull();
  });

  it('filters with the search box', async () => {
    const { fixture, el, trigger } = await setup(true);
    trigger.click();
    fixture.detectChanges();
    const search = el.querySelector<HTMLInputElement>('.search input')!;
    search.value = 'sadd';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const options = el.querySelectorAll('[role="option"]');
    expect(options.length).toBe(1);
    key(search, 'Enter');
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe(2);
  });

  it('respects a disabled form control', async () => {
    const { fixture, trigger } = await setup();
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    expect(trigger.disabled).toBe(true);
  });
});
