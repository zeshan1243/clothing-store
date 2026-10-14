import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Qatar mobiles: 8 digits starting with 3, 5, 6 or 7 (optionally prefixed with +974 / 00974). */
export function qatarMobile(control: AbstractControl): ValidationErrors | null {
  const digits = String(control.value ?? '').replace(/[\s-]/g, '').replace(/^(\+|00)974/, '');
  if (!digits) return null;
  return /^[3567]\d{7}$/.test(digits) ? null : { qatarMobile: true };
}
