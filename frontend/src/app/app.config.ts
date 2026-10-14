import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { customerAuthInterceptor } from './core/customer-auth.interceptor';
import { authInterceptor } from './core/auth.interceptor';
import { I18nService } from './core/i18n/i18n.service';
import { ThemeService } from './core/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Scrolling is handled in App (see app.ts) so filter/sort changes don't jump to the top.
      withInMemoryScrolling({ scrollPositionRestoration: 'disabled', anchorScrolling: 'disabled' }),
    ),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, customerAuthInterceptor])),
    // Apply the saved language (lang/dir) and theme before the first render to avoid a flash.
    provideAppInitializer(() => {
      inject(I18nService).applyToDocument();
      inject(ThemeService);
    }),
  ],
};
