import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../../core/api-error';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { qatarMobile } from '../../core/validators';
import { Icon } from '../../shared/icon/icon';

/** /account/login — phone + password. "Forgot password" goes to WhatsApp (the team resets it). */
@Component({
  selector: 'app-account-sign-in',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Icon],
  template: `
    <div class="container auth">
      <header class="auth__head">
        <h1>{{ 'account.signInTitle' | t }}</h1>
        <p>{{ 'account.signInIntro' | t }}</p>
      </header>
      <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error(); as e) {
          <p class="alert alert--error" role="alert">{{ e }}</p>
        }
        <div class="field">
          <label for="si-phone">{{ 'co.mobile' | t }}</label>
          <div class="phone" dir="ltr">
            <span class="phone__prefix" aria-hidden="true">+974</span>
            <input id="si-phone" type="tel" inputmode="tel" formControlName="phone" autocomplete="tel-national" placeholder="5512 3456"
              [attr.aria-invalid]="invalid('phone')" />
          </div>
          @if (invalid('phone')) { <p class="field-error">{{ 'co.mobileError' | t }}</p> }
        </div>
        <div class="field">
          <div class="label-row">
            <label for="si-password">{{ 'account.password' | t }}</label>
            <button type="button" (click)="forgotOpen.set(!forgotOpen())" [attr.aria-expanded]="forgotOpen()">{{ 'account.forgot' | t }}</button>
          </div>
          <div class="password">
            <input id="si-password" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password"
              [attr.aria-invalid]="invalid('password')" />
            <button type="button" class="password__toggle" (click)="show.set(!show())">{{ (show() ? 'account.hide' : 'account.show') | t }}</button>
          </div>
        </div>
        @if (forgotOpen()) {
          <div class="forgot">
            <app-icon name="message" [size]="20" />
            <p>{{ 'account.forgotText' | t }} <a [href]="forgotLink()" target="_blank" rel="noopener">WhatsApp ↗</a></p>
          </div>
        }
        <button type="submit" class="btn btn--lg btn--block" [disabled]="busy()">{{ (busy() ? 'account.signingIn' : 'account.signIn') | t }}</button>
      </form>
      <p class="switch">{{ 'account.noAccount' | t }} <a routerLink="/account/register" [queryParams]="{ returnUrl: returnUrl() }">{{ 'account.create' | t }}</a></p>
      <p class="note">{{ 'account.optionalNote' | t }}</p>
    </div>
  `,
  styleUrl: './account-forms.scss',
})
export class AccountSignIn {
  private readonly auth = inject(CustomerAuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  readonly returnUrl = input<string>('/account');

  protected readonly form = inject(NonNullableFormBuilder).group({
    phone: ['', [Validators.required, qatarMobile]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly show = signal(false);
  protected readonly forgotOpen = signal(false);
  private readonly phoneValue = signal('');

  protected readonly forgotLink = computed(() => {
    this.i18n.lang();
    const phone = this.phoneValue().trim() ? `+974 ${this.phoneValue().trim()}` : '…';
    return `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(translate('account.forgotWhatsapp', { phone }))}`;
  });

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      this.i18n.lang();
      seo.set(translate('account.signInTitle'));
      seo.setRobots(false);
    });
    if (this.auth.signedIn()) void this.router.navigateByUrl('/account', { replaceUrl: true });
    this.form.controls.phone.valueChanges.subscribe((v) => this.phoneValue.set(v));
  }

  protected invalid(name: 'phone' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { phone, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(phone.trim(), password).subscribe({
      next: (s) => {
        this.busy.set(false);
        void this.router.navigateByUrl(s.customer.must_change_password ? '/account?tab=password' : safeReturn(this.returnUrl()));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(err instanceof HttpErrorResponse && err.status === 401 ? translate('account.badLogin') : apiErrorMessage(err));
      },
    });
  }
}

/** Only allow in-site paths (no open redirects). */
export function safeReturn(url: string | undefined): string {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/account';
}
