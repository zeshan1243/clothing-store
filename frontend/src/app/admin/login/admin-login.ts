import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.scss',
})
export class AdminLogin {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Bound from query params. */
  readonly returnUrl = input<string>();
  readonly expired = input<string>();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  constructor() {
    // Admin screens are English-only regardless of the storefront language.
    inject(I18nService).setAdminScope(true);
    inject(ThemeService).setAdminScope(true);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => void this.router.navigateByUrl(this.safeReturnUrl()),
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err, 'Sign in failed. Please try again.'));
        this.submitting.set(false);
      },
    });
  }

  /** Only allow redirects inside the admin portal (prevents open redirects). */
  private safeReturnUrl(): string {
    const url = this.returnUrl();
    return url && url.startsWith('/admin') && !url.startsWith('/admin/login') ? url : '/admin';
  }
}
