import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

const ADMIN_API_PREFIX = `${environment.apiBaseUrl}/admin/`;
const LOGIN_URL = `${environment.apiBaseUrl}/admin/auth/login`;

/** Attaches the admin bearer token to admin API calls only (never to public storefront calls). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(ADMIN_API_PREFIX) || req.url === LOGIN_URL) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.token;
  const authorised = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.handleUnauthorised();
      }
      return throwError(() => error);
    }),
  );
};
