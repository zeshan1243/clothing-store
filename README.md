# Clothing Store — COD e-commerce MVP (Doha, Qatar)

Mobile-first storefront and admin portal for a streetwear brand. Cash on Delivery only; delivery,
confirmation and customer contact are handled manually by the founders. Full requirements live in
[claude.md](claude.md).

| Part | Stack | Folder |
|---|---|---|
| Storefront + admin portal | Angular 22 (standalone, zoneless, signals), SCSS design tokens | [frontend/](frontend/) |
| REST API | Python 3.14, FastAPI, SQLAlchemy 2.1, Alembic | [backend/](backend/) |
| Database | PostgreSQL 17 | — |

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation: projects, config, full data model + migration, admin auth | **Done** |
| 2 | Catalogue and inventory: shop, product pages, cart, policy pages; admin products, categories, inventory | **Done** (images by URL; Cloudinary upload later) |
| 3 | COD checkout: server-side quote, order creation with stock reservation, confirmation page | **Done** |
| 4 | Admin orders (list, detail, confirm/assign/status/cancel), contact customer, COD collection & refunds, dashboard, sales report | **Done** |
| 5 | Invoices & credit notes (PDF), shipping labels, supplier ledger with payments & stock receiving | **Done** |
| 6 | Launch readiness: security hardening, SEO, deployment files, backups, monitoring | **Done** — see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for remaining business tasks |

## Design system

The UI follows [design.md](design.md): bone/ink neutrals with a single volt accent, Space Grotesk +
Inter (self-hosted via `@fontsource-variable`), Lucide icons (`lucide-static`, rendered by
`app-icon`). Tokens live at the top of `frontend/src/styles.scss`; components never hard-code colours.

Deviation from design.md: `--volt-700`, `--danger`, `--warning` and `--ink-400` fail WCAG AA as small
text on bone, so text uses darker `--volt-text`, `--danger-text`, `--warning-text` and `--text-subtle`
(the original values remain for fills, badges and icons). Optional campaign photo for the home hero:
`heroImageUrl` in the environment files.

## Languages (English / Arabic)

The storefront is bilingual: English by default, Arabic via the header switch (remembered per
browser). Arabic switches the layout to right-to-left (`<html lang="ar" dir="rtl">`), uses IBM Plex
Sans Arabic, mirrors directional icons and keeps Western digits for prices (`220.00 ر.ق`).

- UI copy: `frontend/src/app/core/i18n/en.ts` (keys) and `ar.ts` (TypeScript enforces that every key is
  translated). Use `{{ 'key' | t }}`, plurals with `| tp: count` (Arabic has six plural forms).
- Product/category content: optional `name_ar` / `description_ar` fields in the admin forms; the
  storefront falls back to English when empty (`| loc: 'name'`). Orders snapshot the Arabic name too.
- Policy pages: `storefront/pages/page-content-ar.ts`.
- The admin portal is always English / LTR.
- **All Arabic copy is a draft — have a native speaker review it before launch.**
- Limitation: language is chosen client-side (no `/ar/...` URLs), so search engines index English.
  Add Angular SSR with locale-prefixed routes if Arabic organic search matters.

## Dark mode

Light (bone) is the default; the header moon/sun toggle switches the storefront to the dark theme
(remembered per browser). Dark values are a remap of the same tokens in `styles.scss`
(`[data-theme='dark']`); components use role tokens (`--field`, `--strong`, `--dark-block`,
`--on-volt`, `--glass`, …) rather than raw palette colours. The admin portal always stays light.

## Local setup

### Quick start

```bash
./dev.sh          # backend on :8000 + frontend on :4200; Ctrl+C stops both
./dev.sh --seed   # same, but loads demo categories/products first
```

The script starts PostgreSQL if needed, creates the databases, venv, `backend/.env` and
`node_modules` if missing, and applies migrations. You still need an admin account (see below).

### Prerequisites

- Python 3.12+ (developed on 3.14)
- Node 22 LTS or 24 LTS recommended (Angular warns on odd-numbered Node versions)
- PostgreSQL 15+ running locally

```bash
# macOS (Homebrew)
brew install postgresql@17 && brew services start postgresql@17
createdb clothing_store
createdb clothing_store_test
```

### Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env            # then set JWT_SECRET (see comment in the file)
.venv/bin/alembic upgrade head  # create/upgrade the schema
.venv/bin/python -m scripts.create_admin --email you@example.com --name "Your Name" --owner
.venv/bin/python -m scripts.seed_demo      # optional: demo categories + products
.venv/bin/uvicorn app.main:app --reload    # http://localhost:8000, docs at /docs
```

### Frontend

```bash
cd frontend
npm install
npm start                        # http://localhost:4200 (storefront), /admin (portal)
```

The dev build calls the API at `http://localhost:8000/api/v1`
([environment.development.ts](frontend/src/environments/environment.development.ts)).

## Tests

```bash
cd backend && .venv/bin/python -m pytest      # uses the clothing_store_test database
cd frontend && npx ng test --watch=false
```

The backend test suite rebuilds the test schema through the Alembic migrations on each run, so
migrations are exercised as well as the models.

## Database migrations

```bash
cd backend
.venv/bin/alembic revision --autogenerate -m "describe change"   # review the generated file!
.venv/bin/alembic upgrade head
.venv/bin/alembic check          # fails if models and migrations have drifted
```

Enum columns are stored as `VARCHAR` + `CHECK` constraints (not native PostgreSQL enums) so adding a
status later is a simple migration. Autogenerate emits each enum CHECK twice; keep the
`op.f('ck_<table>_<column>')` version and set `create_constraint=False` on the `sa.Enum`, as in the
initial migration.

## Key design decisions

### Money
All amounts use `NUMERIC(12,2)` and Python `Decimal`. No floating point anywhere for money.

### Inventory policy (MVP)
Stock is tracked per variant (product + colour + size, unique SKU).

- `stock_quantity` = units physically on hand; `reserved_quantity` = units held by open orders.
  **Available to sell = stock − reserved.** Database CHECKs guarantee `0 ≤ reserved ≤ stock`.
- **Order placed** → reserve (`reserved += qty`), inside the order transaction, with row locks so
  concurrent checkouts cannot oversell.
- **Order delivered** → sold (`stock −= qty`, `reserved −= qty`).
- **Order cancelled / delivery abandoned** → release (`reserved −= qty`).
- Unconfirmed orders do not expire automatically; the founders cancel them manually after failing
  to reach the customer (suggested: 48 hours).
- Every change writes a `stock_movements` row (type, quantity, order/supplier bill, reason, admin).

### Numbers and references
- Order numbers (`ORD-2026-00001`) and invoice numbers (`INV-2026-00001`) are separate, gap-free
  yearly sequences from the `document_counters` table, locked inside the creating transaction.
- Customers see their order via an unguessable `public_token`, never a sequential ID.
- Checkout accepts an idempotency key so a double-submit returns the same order.

### Statuses
Order (fulfilment) status, payment status and invoice status are independent columns. Delivered ≠
paid: cash collection is recorded explicitly as a `payments` row.

Allowed order transitions (enforced by the API, see `backend/app/services/order_operations.py`):

| From | To |
|---|---|
| PLACED | CONFIRMED, CANCELLED |
| CONFIRMED | PREPARING, OUT_FOR_DELIVERY, CANCELLED |
| PREPARING | OUT_FOR_DELIVERY, CANCELLED |
| OUT_FOR_DELIVERY | DELIVERED, DELIVERY_FAILED |
| DELIVERY_FAILED | OUT_FOR_DELIVERY (retry), CANCELLED |
| DELIVERED | RETURN_REQUESTED |
| RETURN_REQUESTED | DELIVERED (return closed) |

Cancelling and failed deliveries require a reason. Cash can be recorded from OUT_FOR_DELIVERY
onwards and never above the order total; refunds never above the cash collected. An order holding
collected cash must be refunded before it can be cancelled. Returned items are put back into stock
with an Inventory → "Customer return" adjustment.

Payment status is derived from the payments: PENDING → PAID (collected ≥ total) →
PARTIALLY_REFUNDED / REFUNDED.

### Invoices
- An invoice (`INV-YYYY-NNNNN`, its own gap-free sequence) is issued automatically when an order is
  confirmed, so it can be printed at packing time. It can also be issued manually.
- Each invoice stores a JSON snapshot of everything printed on it; the PDF is regenerated from that
  snapshot byte-for-byte (`invariant=1`). Product or order edits never change an issued invoice.
- The only live part of the PDF is the payment receipt block, taken from the append-only `payments`
  table (so a printed invoice can show "Paid" with the collection date).
- Invoices are never edited. Cancelling an invoiced order issues a full credit note
  (`CN-YYYY-NNNNN`) automatically; returns/corrections use partial credit notes from the order page.
- A separate A6 shipping label (`/admin/orders/{id}/label.pdf`) carries delivery details only — no
  prices or item list — for the outside of the parcel.
- Seller details come from `BUSINESS_*` env vars. Confirm what Qatar requires on invoices for the
  registered business before launch. Helvetica covers Latin script only; register a Unicode font in
  `invoice_pdf.py` if names in Arabic script must print.

### Supplier payables
Suppliers, bills (in the original currency, e.g. PKR), partial payments with an optional QAR rate or
amount, and per-currency outstanding/overdue balances. Bill items can link to product variants and be
received into stock (each receipt is a `RECEIVED` stock movement linked to the bill). Bill amounts
are fixed once recorded. Supplier money is never mixed into sales or COD figures.

### Customer accounts (optional)
Customers can always check out as guests. If they choose to, they can create an account at
`/account/register` with **phone + password** (email optional) and then see their orders and profile
at `/account`.
- **Sessions:** customer sessions use their own token type (`typ: customer`, 30 days, `CUSTOMER_SESSION_DAYS`),
  so a customer token can never reach admin endpoints. Changing or resetting a password, or deleting the
  account, ends all existing sessions (`token_version`).
- **Signed-in checkout:** the order uses the account's phone, prefills name, email and the saved address,
  and can save the address to the profile. A guest checkout with the same phone never overwrites a
  registered profile.
- **Order history:** shows orders placed while signed in. **Earlier guest orders with the same phone
  appear only after an admin marks the phone verified** (Admin → Customers → Verify). Phones aren't
  verified by SMS, so this stops someone registering with another person's number and seeing their orders.
- **Forgot password:** there's no email/SMS sending. The sign-in page links to WhatsApp, and an admin
  uses **Reset password** to create a temporary password, which is shown once with a "Send on WhatsApp"
  button. The customer must choose a new password after signing in with it.
- **Admin → Customers:** Registered / Guests / All, with search, order count and total. Each customer
  page lets you edit the profile, verify the phone, reset the password or delete the account. Deleting
  removes the login and saved address; orders are kept for the records.
- **Rate limiting:** sign-in and registration are limited to `ACCOUNT_RATE_LIMIT_PER_MINUTE` per IP.

### Delivery fees
We deliver across Qatar. Customers pick their **delivery area** at checkout from a list (Admin → Delivery),
and the server prices delivery from it:
- areas marked **free zone** (Doha city + Al Rayyan suburbs) → free;
- an area with a **charge set by hand** in Admin → Delivery → exactly that amount;
- everywhere else → `DELIVERY_OUTSIDE_BASE_FEE` (QAR 10) + `DELIVERY_FEE_PER_STEP` (QAR 1) for every
  started `DELIVERY_STEP_KM` (5 km) from central Doha, e.g. Al Khor ≈ 50 km → QAR 20; 52 km → QAR 21.

The migration seeds 63 Qatar areas with **approximate** road distances; correct them in Admin → Delivery
(changes apply to new orders only). Orders snapshot the area name, distance and fee. An order with an
unknown or hidden area is refused (422). The cart shows delivery as "at checkout" until an area has been
chosen (it's remembered for next time). `FREE_DELIVERY_THRESHOLD` and free-delivery coupons still waive the fee.

### Collections
A product has exactly **one category** (Hoodies, Pants…) but can belong to **any number of collections**:
hand-picked groups such as "Summer Drop 01" or "Eid Edit". They're managed under **Admin → Collections**
(name, Arabic name, description, an optional banner image (otherwise a product photo is used), the
product picker, "Show on homepage" and "Visible in store"). The storefront shows them at
`/collections` and `/collections/<slug>` (the normal shop grid with filters, under a banner), and
featured ones appear in a homepage section. A "Collections" link is added to the header once at least
one collection is live. Only active products count. A collection with no live products is hidden.
Deleting a collection never touches its products.

### Order tracking
Customers track an order at `/track` (linked in the footer and from the order confirmation page) by entering
the order number **and** the mobile number used at checkout. Order numbers are sequential, so the
number alone is never enough. `POST /api/v1/orders/track` returns the same error for a wrong number or a
wrong phone, and is rate-limited (10 per minute per IP). A successful lookup opens `/track/<public token>`,
which can be bookmarked. The page shows the status, a timeline built from the order's status history
(times only, never admin names or internal notes), the items, the totals and the payment status.

### Coupons
Admins create codes under **Admin → Coupons**: percentage off (optional QAR cap), fixed QAR off, or
free delivery, with an optional minimum subtotal, start/end time (Doha), total-use limit and
per-customer limit (by phone). Codes are case-insensitive. The server always recalculates the
discount: `/cart/quote` previews it, and `POST /orders` re-checks it under a row lock, so limits can't
be exceeded by concurrent checkouts. An order whose coupon became invalid is refused (409 with
`coupon_error`) rather than placed at a different price. The order and invoice keep the code and
discount amount. Cancelling an order gives the use back. A code that has been used can't be renamed;
switch it off instead. Discounts apply to items only, never to the delivery fee (except free delivery).

### Admin auth
Argon2 password hashing, short-lived JWT bearer tokens (12 h default), per-IP login rate limiting,
and an active-admin check on every request (deactivating an admin revokes access immediately). The
Angular app keeps the token in `sessionStorage` and only sends it to `/admin/*` API calls. Important
actions are written to `admin_audit_log`.

> The rate limiter is in-process. If the API ever runs on more than one instance, move it to a
> shared store (e.g. Redis).

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) (hosting, environment variables, backups/restore, monitoring) and
[LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) (acceptance criteria status and pre-launch tasks).
