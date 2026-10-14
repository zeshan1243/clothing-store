import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const API = environment.apiBaseUrl;

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);

    auth.login('founder@example.com', 'secret').subscribe();
    backend.expectOne(`${API}/admin/auth/login`).flush({
      access_token: 'token-123',
      token_type: 'bearer',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      admin: { id: 1, name: 'Founder', email: 'founder@example.com', role: 'OWNER', is_active: true },
    });
  });

  afterEach(() => backend.verify());

  it('adds the bearer token to admin API requests', () => {
    http.get(`${API}/admin/orders`).subscribe();
    const req = backend.expectOne(`${API}/admin/orders`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush([]);
  });

  it('never sends the admin token to public storefront endpoints', () => {
    http.get(`${API}/products`).subscribe();
    const req = backend.expectOne(`${API}/products`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('clears the session when the API returns 401', () => {
    http.get(`${API}/admin/auth/me`).subscribe({ error: () => undefined });
    backend.expectOne(`${API}/admin/auth/me`).flush({ detail: 'Not authenticated' }, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);
  });
});
