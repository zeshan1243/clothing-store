import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.token) return true;
  return inject(Router).createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};

/** Keeps a signed-in admin away from the login page. */
export const guestOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.token ? inject(Router).createUrlTree(['/admin']) : true;
};
