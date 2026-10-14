import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from './i18n/i18n.service';

const formatter = new Intl.NumberFormat('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Formats a decimal string or number as a QAR price, with Western digits in both languages
 * (design.md §12): "QAR 1,234.00" in English, "1,234.00 ر.ق" in Arabic.
 */
@Pipe({ name: 'qar', pure: false })
export class QarPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(value: string | number | null | undefined): string {
    return formatQar(value, this.i18n.isArabic());
  }
}

/** Same formatting as the pipe, for use in TypeScript (no injection needed). */
export function formatQar(value: string | number | null | undefined, arabic: boolean): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return '';
  const formatted = formatter.format(amount);
  return arabic ? `${formatted} ر.ق` : `QAR ${formatted}`;
}
