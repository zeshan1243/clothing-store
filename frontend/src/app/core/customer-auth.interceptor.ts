import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { CustomerAuthService } from './customer-auth.service';

const ACCOUNT_API = `${environment.apiBaseUrl}/account/`;
const ORDERS_API = `${environment.apiBaseUrl}/orders`;
const PUBLIC_ACCOUNT = [`${ACCOUNT_API}login`, `${ACCOUNT_API}register`];

/**
 * Sends the customer's token to their account endpoints and to order placement (so a signed-in
 * order lands in their history). Never to admin or other public calls.
 */
export const customerAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const isAccount = req.url.startsWith(ACCOUNT_API) && !PUBLIC_ACCOUNT.includes(req.url);
  const isPlaceOrder = req.method === 'POST' && req.url === ORDERS_API;
  if (!isAccount && !isPlaceOrder) return next(req);

  const auth = inject(CustomerAuthService);
  const token = auth.token;
  if (!token) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
    catchError((error: unknown) => {
      // Password changed elsewhere, reset by the shop, or account removed: sign out locally.
      if (isAccount && error instanceof HttpErrorResponse && error.status === 401) auth.clear();
      return throwError(() => error);
    }),
  );
};
