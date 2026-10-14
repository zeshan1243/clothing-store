import { HttpErrorResponse } from '@angular/common/http';
import { Component, effect, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { apiErrorMessage } from '../../core/api-error';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { I18nService, translate } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SeoService } from '../../core/seo.service';
import { qatarMobile } from '../../core/validators';
import { safeReturn } from './sign-in';

/** /account/register — optional account. ?name=&phone= prefill it (e.g. from the order confirmation). */
@Component({
  selector: 'app-account-register',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="container auth">
      <header class="auth__head">
        <h1>{{ 'account.createTitle' | t }}</h1>
        <p>{{ 'account.createIntro' | t }}</p>
      </header>
      <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error(); as e) {
          <p class="alert alert--error" role="alert">
            {{ e }}
            @if (exists()) { <a routerLink="/account/login" [queryParams]="{ returnUrl: returnUrl() }">{{ 'account.signIn' | t }}</a> }
          </p>
        }
        <div class="field">
          <label for="rg-name">{{ 'co.fullName' | t }}</label>
          <input id="rg-name" formControlName="full_name" autocomplete="name" [attr.aria-invalid]="invalid('full_name')" />
          @if (invalid('full_name')) { <p class="field-error">{{ 'account.nameError' | t }}</p> }
        </div>
        <div class="field">
          <label for="rg-phone">{{ 'co.mobile' | t }}</label>
          <div class="phone" dir="ltr">
            <span class="phone__prefix" aria-hidden="true">+974</span>
            <input id="rg-phone" type="tel" inputmode="tel" formControlName="phone" autocomplete="tel-national" placeholder="5512 3456"
              [attr.aria-invalid]="invalid('phone')" />
          </div>
          @if (invalid('phone')) { <p class="field-error">{{ 'co.mobileError' | t }}</p> }
        </div>
        <div class="field">
          <label for="rg-email">{{ 'co.email' | t }} <span class="muted">{{ 'common.optional' | t }}</span></label>
          <input id="rg-email" type="email" formControlName="email" autocomplete="email" [attr.aria-invalid]="invalid('email')" />
          @if (invalid('email')) { <p class="field-error">{{ 'co.emailError' | t }}</p> }
        </div>
        <div class="field">
          <label for="rg-password">{{ 'account.password' | t }}</label>
          <div class="password">
            <input id="rg-password" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="new-password"
              [attr.aria-invalid]="invalid('password')" aria-describedby="rg-password-hint" />
            <button type="button" class="password__toggle" (click)="show.set(!show())">{{ (show() ? 'account.hide' : 'account.show') | t }}</button>
          </div>
          @if (invalid('password')) {
            <p class="field-error" id="rg-password-hint">{{ 'account.passwordError' | t }}</p>
          } @else {
            <p class="hint" id="rg-password-hint">{{ 'account.passwordHint' | t }}</p>
          }
        </div>
        <button type="submit" class="btn btn--lg btn--block" [disabled]="busy()">{{ (busy() ? 'account.creating' : 'account.create') | t }}</button>
      </form>
      <p class="switch">{{ 'account.haveAccount' | t }} <a routerLink="/account/login" [queryParams]="{ returnUrl: returnUrl() }">{{ 'account.signIn' | t }}</a></p>
      <p class="note">{{ 'account.optionalNote' | t }}</p>
    </div>
  `,
  styleUrl: './account-forms.scss',
})
export class AccountRegister {
  private readonly auth = inject(CustomerAuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  readonly returnUrl = input<string>('/account');
  readonly name = input<string>();
  readonly phone = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    full_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    phone: ['', [Validators.required, qatarMobile]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly exists = signal(false);
  protected readonly show = signal(false);

  constructor() {
    const seo = inject(SeoService);
    effect(() => {
      this.i18n.lang();
      seo.set(translate('account.createTitle'));
      seo.setRobots(false);
    });
    if (this.auth.signedIn()) void this.router.navigateByUrl('/account', { replaceUrl: true });
    effect(() => {
      const name = this.name();
      const phone = this.phone()?.replace(/^\+?974/, '').trim();
      if (name && !this.form.controls.full_name.value) this.form.controls.full_name.setValue(name);
      if (phone && !this.form.controls.phone.value) this.form.controls.phone.setValue(phone);
    });
  }

  protected invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.exists.set(false);
    this.auth.register({ full_name: v.full_name.trim(), phone: v.phone.trim(), email: v.email.trim() || null, password: v.password }).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigateByUrl(safeReturn(this.returnUrl()));
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const conflict = err instanceof HttpErrorResponse && err.status === 409;
        this.exists.set(conflict);
        this.error.set(conflict ? translate('account.exists') : apiErrorMessage(err));
      },
    });
  }
}
