# Launch checklist

Status of the MVP acceptance criteria (claude.md §13) and what's left before taking real orders.

## Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Customers can browse active products and select an available colour/size | ✅ Built | Shop, product pages; sold-out sizes disabled. `test_catalog.py` |
| 2 | Stock tracked separately for each variant | ✅ Built | `product_variants` (product + colour + size, unique SKU), stock movements |
| 3 | Customers can place a COD order as guests | ✅ Built | `/checkout`, browser E2E tested. `test_checkout.py` |
| 4 | Backend calculates the authoritative total and delivery fee | ✅ Built | Browser-sent prices ignored. `test_place_order_snapshots_reserves_and_records_history` |
| 5 | Concurrent checkouts cannot oversell | ✅ Built | Row locks; 5 racing buyers → 1 order (repeated 10×). `test_concurrent_checkouts_cannot_oversell` |
| 6 | Admins authenticate securely and manage products and inventory | ✅ Built | Argon2, JWT, rate limits; every admin endpoint 401 without login. `test_security.py` |
| 7 | Admins can view, search, confirm, assign, update and cancel orders | ✅ Built | `test_admin_orders.py`, browser E2E tested |
| 8 | Manual customer contact from the order page | ✅ Built | Call / WhatsApp (prefilled, not auto-sent) / copy number |
| 9 | COD collection recorded separately from delivery status | ✅ Built | `payments` table; delivered ≠ paid. `test_payment_rules` |
| 10 | Invoice generated, stored/reproduced, viewed, downloaded, printed | ✅ Built | Snapshot + byte-identical PDF. `test_invoices.py` |
| 11 | Printed invoice can go inside the parcel | ✅ Built | A4 invoice + separate no-price A6 shipping label |
| 12 | Supplier bills and payments show correct outstanding balances | ✅ Built | Per-currency balances, partial payments. `test_suppliers.py` |
| 13 | Stock movements and critical order/payment changes are traceable | ✅ Built | `stock_movements`, `order_status_history`, `admin_audit_log` |
| 14 | Customer and admin flows work on mobile | ✅ Built, ⚠️ verify | Checked at 375–390px in headless Chrome. **Test on real iPhone/Android + Safari** |
| 15 | Production backups and restore procedures in place | ⚠️ Tooling ready | `ops/backup_db.sh`, `ops/restore_db.sh` (restore verified locally). **Enable provider backups and test a restore in production** |
| 16 | Local business and invoicing requirements checked | ❌ Business task | Needs a qualified adviser (see below) |

## Before launch — business / content

- [ ] Registered business name, address, phone, email and any registration/tax numbers set in
      `BUSINESS_*` env vars; confirm what Qatar requires on invoices and credit notes.
- [ ] Review and replace the draft policy pages (`frontend/src/app/storefront/pages/page-content.ts`):
      delivery, returns, privacy (incl. data retention), terms, contact details.
- [ ] Real brand name/logo (`environment.ts` `brandName`, `index.html` title, favicon).
- [ ] Real product photos uploaded to an image CDN (e.g. Cloudinary) and pasted into products.
- [ ] Delivery fee and any free-delivery threshold confirmed (`DELIVERY_FEE`, `FREE_DELIVERY_THRESHOLD`).
- [ ] Decide the manual policy for unconfirmed orders (suggested: cancel after 48 h unreachable).

## Before launch — technical

- [ ] Deploy per `DEPLOYMENT.md`; all `example.com` placeholders replaced.
- [ ] `ENVIRONMENT=production`, strong `JWT_SECRET`, https-only `CORS_ORIGINS` / `SITE_URL`
      (the API refuses to start otherwise).
- [ ] Each founder has their own admin account; demo/test accounts removed.
- [ ] Do **not** run `seed_demo` on the production database.
- [ ] Provider backups on; one restore tested; daily `backup_db.sh` copy scheduled off-site.
- [ ] Sentry DSN (or other error alerts) and an uptime monitor on `/health`.
- [ ] Real-device testing: iPhone Safari, Android Chrome — browse, checkout, admin order flow,
      WhatsApp link, invoice print.
- [ ] End-to-end real-order rehearsal: place → confirm → print invoice + label → deliver → record
      cash → check dashboard; plus a cancellation and a failed delivery.
- [ ] Submit `sitemap.xml` in Google Search Console.

## Known limitations (accepted for the MVP)

- Product images are added by URL (no in-app upload yet).
- Rate limiting is per API process; keep one worker or move to a shared store.
- Invoice PDFs use Helvetica (Latin script only).
- Public pages are client-rendered; consider Angular SSR/prerendering if organic search becomes a
  major channel.
- Returns are handled manually: mark "Return requested", restock via Inventory → Customer return,
  record the refund, and issue a partial credit note.
