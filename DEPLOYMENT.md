# Deployment guide

Three pieces are deployed separately:

| Piece | What it is | Suggested hosting |
|---|---|---|
| Storefront + admin | Static Angular build (`frontend/dist/frontend/browser`) | Netlify, Cloudflare Pages or Vercel |
| API | FastAPI container (`backend/Dockerfile`) | Render, Railway, Fly.io, or any VM with Docker |
| Database | PostgreSQL 15+ | A **paid** managed plan with automatic daily backups (e.g. Neon, Supabase, Render, DigitalOcean) |

> Do not use a free database tier that expires or sleeps for real orders. Turn on the provider's
> automatic backups and point-in-time recovery if offered.

Suggested domains: `www.brand.qa` for the storefront, `api.brand.qa` for the API.

---

## Render (Blueprint)

[render.yaml](render.yaml) defines all three pieces: `clothing-store-db` (Postgres),
`clothing-store-api` (Docker, from `backend/`) and `clothing-store-web` (static site, with the SPA
fallback, sitemap proxy and security headers that `_redirects`/`_headers` provide elsewhere).

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo → **Apply**.
3. Service names become `https://<name>.onrender.com`, but Render adds a suffix when a name is taken.
   This deployment uses `https://clothing-store-api-ste1.onrender.com` (API) and
   `https://clothing-store-web-5a63.onrender.com` (site); if they ever change, update `render.yaml`,
   `environment.ts` and `robots.txt`, then push again.
4. Create an admin account. The free plan has no Shell, so run it locally against the database's
   **External Database URL** (database page → Connections):
   ```bash
   cd backend
   DATABASE_URL='postgresql://...external-url...' .venv/bin/python -m scripts.create_admin \
     --email you@example.com --name "Your Name" --owner
   ```
5. Visit `https://clothing-store-api-ste1.onrender.com/health`, then sign in at `/admin` on the site.

Free plan limits: the API sleeps after 15 minutes idle (the next request takes about a minute), and
the free database **expires 30 days after creation** and has no backups. Fine for a demo; upgrade the
database (and ideally the API) before taking real orders.

---

## 1. Database

1. Create a PostgreSQL database and a dedicated user for the app.
2. Note the connection URL and convert it for SQLAlchemy:
   `postgresql+psycopg://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require`
3. Enable the provider's automatic backups.

## 2. API

Build from `backend/` with the included `Dockerfile`. On start it runs `alembic upgrade head`, then
serves on `$PORT` (default 8000) behind the platform's HTTPS proxy.

Environment variables (see `backend/.env.example`):

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production` (hides `/docs`, enables HSTS, enforces the checks below) |
| `DATABASE_URL` | the URL from step 1 |
| `JWT_SECRET` | random, ≥ 32 chars: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `CORS_ORIGINS` | `https://www.brand.qa` (https only; the API refuses to start with localhost here) |
| `SITE_URL` | `https://www.brand.qa` |
| `DELIVERY_OUTSIDE_BASE_FEE`, `DELIVERY_FEE_PER_STEP`, `DELIVERY_STEP_KM`, `FREE_DELIVERY_THRESHOLD` | delivery pricing (defaults: QAR 10 + QAR 1 per 5 km outside the free zone) |
| `BUSINESS_NAME`, `BUSINESS_PHONE`, `BUSINESS_EMAIL`, `BUSINESS_ADDRESS`, `BUSINESS_REGISTRATION` | printed on invoices — confirm Qatar requirements |
| `SENTRY_DSN` | optional, for error alerts (see §6) |
| `FORWARDED_ALLOW_IPS` | optional: your platform's proxy IP range (default trusts all forwarded headers) |
| `WEB_CONCURRENCY` | keep `1` (the rate limiter is in-process) |

Health check path: `/health`.

Create the founders' accounts once the API is up (from the platform's shell / one-off job):

```bash
python -m scripts.create_admin --email founder@brand.qa --name "Founder Name" --owner
```

Founders can then change their password under **Admin → My account**.

## 3. Storefront

1. Edit `frontend/src/environments/environment.ts`: set `apiBaseUrl` to `https://api.brand.qa/api/v1`
   and `brandName`, `deliveryFee` (display only — the API is authoritative).
2. Edit the deploy files in `frontend/public/`, replacing the `example.com` placeholders:
   - `robots.txt` — the `Sitemap:` URL.
   - `_redirects` — the API host for `/sitemap.xml` (Netlify proxies it; on Cloudflare Pages, instead
     add a scheduled job that saves `https://api.brand.qa/api/v1/seo/sitemap.xml` as `sitemap.xml`).
   - `_headers` — `connect-src` (API host) and `img-src` (image CDN host) in the Content-Security-Policy.
3. Build: `cd frontend && npm ci && npm run build`. Publish `dist/frontend/browser`.
4. The `_redirects` file provides the single-page-app fallback so deep links like `/products/x` work.

For Vercel, translate `_redirects`/`_headers` into `vercel.json` rewrites and headers.

## 4. After the first deploy

- Visit `https://api.brand.qa/health` → `{"status":"ok"}`.
- Sign in at `https://www.brand.qa/admin`, add categories/products, and place a test order.
- Optionally load demo data on a **staging** database only: `python -m scripts.seed_demo`.

## 5. Backups and restore

Besides the provider's automatic backups, keep an independent copy:

```bash
DATABASE_URL=postgresql://... ./ops/backup_db.sh /path/to/backups      # pg_dump custom format
```

Run it daily (cron or a scheduled job) and store the files away from the database host (e.g. object
storage). `BACKUP_RETENTION_DAYS` (default 30) prunes old files.

**Test a restore before launch, then monthly:**

```bash
createdb restore_check
TARGET_DATABASE_URL=postgresql://.../restore_check ./ops/restore_db.sh /path/to/backups/clothing_store_XXXX.dump
```

The script refuses to restore into a non-empty database and prints row counts and the migration
version to compare with production. (Verified locally: a backup of the dev database restored with
identical order/product/variant counts.)

## 6. Monitoring and logs

- **Errors:** set `SENTRY_DSN` to receive alerts for unhandled API errors. Request bodies, query
  strings, cookies and the `Authorization` header are stripped before sending; order tokens in URLs
  are redacted.
- **Request log:** one line per request — method, path (order tokens replaced by `[token]`), status,
  duration, request id. No bodies or personal data are logged. Uvicorn's own access log is disabled
  because it prints full URLs.
- **Uptime:** point an uptime monitor (e.g. UptimeRobot, Better Stack) at `/health` and the storefront.

## 7. Security notes

- HTTPS everywhere (the hosts above provide certificates). The API sends HSTS in production.
- API responses carry `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, and
  admin responses `Cache-Control: no-store`. The storefront `_headers` adds a strict CSP.
- Login and order creation are rate-limited per client IP (`--proxy-headers` makes the real IP
  visible behind the platform proxy).
- Admin tokens expire after 12 hours (`JWT_EXPIRES_MINUTES`) and stop working immediately when an
  admin is deactivated.
- Never commit `.env` files; keep secrets in the hosting platform's secret store.

## 8. Data retention (to confirm with an adviser)

Customer names, phones and addresses are stored for order fulfilment, invoicing and returns. Decide
how long to keep them (e.g. as long as invoice records must be retained) and how to handle deletion
requests; invoices and order snapshots are kept unchanged for accounting. Record the decision in the
privacy policy page.
