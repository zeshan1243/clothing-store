import { HttpErrorResponse } from '@angular/common/http';

import { translate } from './i18n/i18n.service';

/** Turns an API error (FastAPI `detail` string or validation list) into a user-facing message. */
export function apiErrorMessage(error: unknown, fallback = translate('error.generic')): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return translate('error.offline');
  if (error.status === 429) return translate('error.rateLimited');

  const detail = error.error?.detail;
  if (typeof detail === 'string') return detail;
  if (typeof detail?.message === 'string') return detail.message;
  if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === 'string') {
    // Pydantic prefixes custom errors with "Value error, ".
    return String(detail[0].msg).replace(/^Value error, /, '');
  }
  return fallback;
}
