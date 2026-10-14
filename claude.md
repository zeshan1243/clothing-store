# Clothing Brand E-commerce Platform — Initial MVP Requirements

| | |
|---|---|
| **Document version** | 1.0 |
| **Status** | Initial MVP scope |
| **Market** | Qatar, starting with Doha |
| **Business model** | Online clothing store, self-managed delivery, Cash on Delivery (COD) |
| **Primary goal** | Launch a professional, mobile-first clothing store with a secure admin portal while keeping initial costs and complexity low. |

---

## 1. Project Overview

Build an e-commerce website for a new Gen Z streetwear/clothing brand. Customers can browse products, select sizes and colours, place orders using Cash on Delivery, and receive their orders through the founders' own delivery efforts.

The founders will initially handle order confirmation, packing, delivery, cash collection, and customer communication manually. The platform should automate core store operations (product and stock management, order records, invoice generation, and reporting) without requiring paid messaging integrations or a separate driver app.

### MVP principles

- Launch a responsive website before considering a native mobile app.
- Build one customer storefront and one secure admin portal.
- Keep customer notifications manual at launch.
- Support COD only in the first release.
- Do not build a driver interface, live GPS tracking, courier integrations, or automated messaging in the MVP.
- Design the system so future features can be added without a major rewrite.
- Track supplier purchases and amounts owed because clothing stock may be supplied on credit.
- Treat stock by product + colour + size as separate inventory variants.

---

## 2. Technology Stack

### Frontend
- Angular
- TypeScript
- Responsive CSS; use the project's chosen component/design system consistently
- Mobile-first, accessible user interface

### Backend
- Python
- FastAPI
- REST API with request validation and clear error responses

### Database and data access
- PostgreSQL
- SQLAlchemy (or SQLModel, if chosen consistently)
- Alembic for database migrations

### Supporting services
- **Product image hosting:** Cloudinary or another image CDN; store image URLs and metadata in PostgreSQL.
- **PDF invoice generation:** generate PDFs on the backend.
- **Deployment:** Angular static hosting plus a separately deployed FastAPI API and managed PostgreSQL database.
- **Configuration:** environment variables for secrets and environment-specific settings.

> **Deployment note:** Free hosting tiers can sleep, have resource limits, or have expiring databases. Do not rely on an expiring/free database for real orders. Use a production database with backups before launch.

---

## 3. User Roles

### 3.1 Customer

Can:
- Browse and search products.
- Filter products by category and available options.
- View product details, images, sizes, colours, prices, and stock availability.
- Add products to cart and update quantities.
- Place an order using COD.
- Provide contact and delivery details.
- View an order confirmation page and order reference.

### 3.2 Admin / Founders

An authenticated admin can:
- View and manage orders.
- Add and edit products, categories, images, colours, sizes, and prices.
- Manage inventory for each product variant.
- Confirm orders and update fulfilment statuses.
- Record COD collections, refunds, cancellations, and returns.
- View, download, and print invoices.
- Maintain supplier bills and outstanding supplier balances.
- View basic sales, stock, and cash-collection reports.

For the MVP, all three founders may use admin accounts. If practical, record which admin performed important actions.

---

## 4. Customer Storefront Requirements

### 4.1 Home page

Include:
- Brand logo and navigation.
- Main campaign/banner area.
- Featured or new-arrival products.
- Product categories/collections.
- Clear links to product pages, cart, contact information, and policies.
- Footer with contact details, social links, delivery policy, returns policy, privacy policy, and terms.

Homepage banners and featured products can initially be managed by the admin or configured simply.

### 4.2 Product listing / collection pages

Each product card should display:
- Product image.
- Product name.
- Price in QAR.
- Optional sale price.
- Available colours or a simple colour indicator.
- Availability status.

Support basic category filtering and sorting. Search can be included if it is straightforward, but is not a blocker for a very small catalogue.

### 4.3 Product details page

Display:
- Product name and description.
- Multiple product images.
- Price in QAR and sale price where applicable.
- Colour selection.
- Size selection.
- Size guide.
- Availability for the selected colour and size.
- Quantity selector, constrained by available stock.
- Add-to-cart action.
- Delivery and return information.

Do not allow a customer to select an unavailable variant or purchase more units than are available.

### 4.4 Cart

Allow customers to:
- Review selected products, colours, sizes, quantities, and prices.
- Change quantities or remove items.
- See subtotal, delivery fee, and final total.
- Continue to checkout.

Revalidate prices and inventory on the backend during order creation. **Never trust totals sent by the browser.**

### 4.5 Checkout

Use guest checkout for the MVP; customer account registration is optional and should not block purchase.

Collect:
- Customer full name.
- Qatar mobile number.
- Delivery area/address in Qatar.
- Building/street/zone details and a landmark or delivery instructions, as appropriate.
- Optional email address.
- Order notes, if needed.

**Payment method:** Cash on Delivery only.

Before submission, show an order summary and total. The customer must explicitly submit the order.

After successful placement, show:
- Order reference.
- Ordered items and selected variants.
- Total payable in QAR.
- Payment method: COD.
- A note that the team will contact them to confirm the order.

No automated SMS, WhatsApp, or email notifications are required in the MVP.

### 4.6 Static / policy pages

Provide:
- About the brand.
- Contact us.
- Delivery policy.
- Returns and exchanges policy.
- Privacy policy.
- Terms and conditions.
- Size guide.

Business and legal details must be reviewed for the actual registered business and applicable Qatar requirements before launch.

---

## 5. Admin Portal Requirements

The admin portal must be protected by authentication and role-based access. It should be responsive enough to use on a phone, although it is primarily an operations dashboard.

### 5.1 Dashboard

Show basic summaries:
- New/unconfirmed orders.
- Orders awaiting delivery.
- Orders delivered.
- Cancelled orders.
- Sales for a selected period.
- COD collected and COD outstanding.
- Low-stock variants.
- Outstanding supplier balances.

Define dashboard totals clearly. For example, placed order value is not the same as cash collected.

### 5.2 Product management

Admins can:
- Create, view, edit, archive, and deactivate products.
- Set product name, slug, description, category, price, optional sale price, and status.
- Upload/manage multiple images through the selected image-hosting service.
- Set available colours and sizes.
- Set SKU and stock quantity for every colour/size combination.
- Configure size guides and featured/new-arrival status.

Prefer archiving products rather than deleting products that already appear in orders.

### 5.3 Inventory management

Track stock per variant:

```
Product → Colour → Size → SKU → Quantity available
```

Requirements:
- Record initial stock.
- Increase/decrease stock through controlled admin actions.
- Deduct/reserve stock safely when orders are placed, according to the chosen inventory policy.
- Release reserved stock when an order is cancelled.
- Prevent overselling when two orders arrive close together by using database transactions and appropriate locking/conditional updates.
- Record stock adjustments with reason, timestamp, and admin where possible.
- Show low-stock variants.
- Preserve order line-item names, SKUs, sizes, colours, and prices as order snapshots so historical orders do not change when a product is edited.

For the MVP, choose and document one inventory policy. **Recommended simple policy:** reserve stock when an order is successfully created; release it if the order is cancelled or expires under a defined manual policy.

### 5.4 Order management

Order list should support:
- Search by order number, customer name, or phone number.
- Filters by order status, payment status, and date.
- Sorting by newest first.
- Opening a detailed order view.

Each order should show:
- Unique order number.
- Order creation date/time.
- Customer contact and delivery address.
- Ordered products, variants, quantities, and price snapshots.
- Subtotal, delivery fee, discounts if supported, and final total.
- Payment method and payment status.
- Fulfilment status.
- Internal admin notes.
- Invoice and payment/stock history.

**Suggested order statuses:**
- `PLACED`
- `CONFIRMED`
- `PREPARING`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `CANCELLED`
- `DELIVERY_FAILED`
- `RETURN_REQUESTED` (optional for MVP)

**Suggested payment statuses:**
- `PENDING`
- `PAID`
- `PARTIALLY_REFUNDED` (if needed)
- `REFUNDED`

Order and payment statuses must be separate. A delivered order is not automatically paid until the cash collection is recorded.

Admins should be able to:
- Confirm an order after manually contacting the customer.
- Add internal notes.
- Update fulfilment status.
- Assign an order to one of the founders for delivery (a simple optional field; no driver account or interface).
- Record delivery outcome.
- Cancel an order with a reason.
- Record COD amount collected and collection date/time.
- Record a refund or return adjustment when applicable.

Prevent invalid state changes where possible and keep an audit trail for critical actions.

### 5.5 Manual customer contact

Do not integrate a paid messaging API in the MVP.

Include a **Contact Customer** action on the order details page. It can:
- Display/copy the customer's phone number.
- Optionally open WhatsApp with a prefilled message using a `wa.me` link, after validating and formatting the phone number.
- Allow the admin to call the customer manually.

Opening WhatsApp does not mean a message was sent. The admin remains responsible for sending the message and updating the order.

### 5.6 Invoice management

Generate and store a digital invoice for each order. The invoice must be accessible from the admin order page.

Required actions:
- View invoice.
- Download invoice PDF.
- Print invoice.

Invoice contents should include, as applicable:
- Brand/business name and contact details.
- Business registration/tax details if required and applicable.
- Unique invoice number.
- Invoice date.
- Linked order number.
- Customer name and delivery/contact details as appropriate.
- Item description, SKU where useful, size, colour, quantity, unit price, and line total.
- Subtotal, delivery fee, discount if any, tax only when applicable, and grand total.
- Currency: QAR.
- Payment method: Cash on Delivery.
- Payment status: Unpaid/Paid.
- Payment date/receipt information after collection, if applicable.

Invoice numbering must be unique and generated by the backend. Do not use the order number as the invoice number unless the business explicitly adopts that convention. Store invoice metadata and enough data to reproduce the document; store the PDF file or generate it deterministically from a saved invoice snapshot.

At packing time, an admin can print the invoice and place it inside the parcel. Keep a separate shipping label for the outside of the parcel; do not expose purchase prices on the outside label unnecessarily.

> **Accounting control:** Do not edit a finalised invoice in place to conceal a change. Handle cancellations, returns, and corrections through a documented adjustment/credit-note process appropriate to local requirements.

### 5.7 Supplier and payable tracking

Because stock may be received from suppliers/relatives in Pakistan on credit, include a basic supplier ledger.

**Supplier records:**
- Supplier name and contact information.
- Currency and agreed payment terms, if applicable.
- Notes.

**Supplier bill records:**
- Supplier and bill/reference number.
- Bill date and due date.
- Items or a bill description.
- Amount and currency.
- Amount paid.
- Outstanding balance.
- Payment dates and references.
- Status: unpaid, partially paid, paid.

When goods are received, admins should be able to record the supplier bill and quantities received. For the MVP, detailed landed-cost allocation, foreign-exchange accounting, and full accounting software functionality are out of scope. Preserve original currency and record the QAR conversion rate/amount when a payment is entered if relevant.

Supplier bills are not customer invoices. Keep sales, COD collections, business expenses, and supplier payables as separate records.

### 5.8 Basic reports

Include:
- Orders by date and status.
- Sales/order value by period.
- COD collected vs. outstanding.
- Delivered, cancelled, and failed orders.
- Current stock by product variant.
- Low-stock variants.
- Supplier bills paid and outstanding.

Clearly label gross order value, cancellations/refunds, and actual cash collected so the dashboard does not confuse them.

---

## 6. Delivery Workflow (No Driver App)

The founders will deliver orders themselves at launch.

1. Customer submits a COD order.
2. Admin reviews the order and contacts the customer manually.
3. Admin marks the order `CONFIRMED`.
4. Admin prepares and packs the items and prints the invoice.
5. Admin optionally assigns the delivery to a founder using an `assigned_to` field.
6. Admin marks the order `OUT_FOR_DELIVERY`.
7. Founder delivers the parcel and collects the exact COD amount.
8. Admin marks the order `DELIVERED` and records the payment as `PAID`, including amount and collection date/time.
9. If delivery fails, record the reason and choose the next action.
10. If an order is cancelled before delivery, release reserved stock and retain the cancellation history.

No separate driver login, driver app, GPS tracking, automated route optimisation, or courier API is included in the MVP.

---

## 7. Core Data Model (Initial Proposal)

Use migrations and appropriate foreign keys, unique constraints, indexes, and timestamps.

### `admins`
- id
- name
- email (unique)
- password_hash
- role
- is_active
- created_at
- updated_at

### `categories`
- id
- name
- slug (unique)
- description
- is_active

### `products`
- id
- category_id
- name
- slug (unique)
- description
- base_price
- sale_price (nullable)
- status
- is_featured
- created_at
- updated_at

### `product_images`
- id
- product_id
- image_url
- alt_text
- sort_order

### `product_variants`
One row per product + colour + size combination.
- id
- product_id
- sku (unique)
- colour
- size
- stock_quantity
- reserved_quantity (if reservations are used)
- is_active
- Unique constraint on product + colour + size

### `customers`
- id
- full_name
- phone
- email (nullable)
- created_at

### `orders`
- id
- order_number (unique, human-readable)
- customer_id
- Customer/delivery snapshot fields, so historical order details remain stable
- subtotal
- delivery_fee
- discount_amount
- tax_amount (only if applicable)
- grand_total
- currency (QAR)
- payment_method (MVP: COD)
- payment_status
- order_status
- assigned_admin_id (nullable)
- customer_notes
- internal_notes
- confirmed_at (nullable)
- delivered_at (nullable)
- cancelled_at (nullable)
- created_at
- updated_at

### `order_items`
- id
- order_id
- product_variant_id (nullable if historical record must survive product removal)
- Snapshot product name, SKU, colour, size, unit price, quantity, and line total

### `payments`
Record collections/refunds separately from order status.
- id
- order_id
- type (COD collection, refund, adjustment)
- amount
- currency
- method (cash for initial COD collection)
- collected_at
- recorded_by_admin_id
- reference (nullable)
- notes

### `invoices`
- id
- invoice_number (unique)
- order_id
- invoice_date
- status
- Saved invoice snapshot or version data
- pdf_storage_url or generated-PDF metadata
- created_at

### `suppliers`
- id
- name
- phone / email (nullable)
- default_currency
- notes
- is_active

### `supplier_bills`
- id
- supplier_id
- supplier_reference
- bill_date
- due_date (nullable)
- currency
- total_amount
- paid_amount
- status
- notes
- created_at

### `supplier_payments`
- id
- supplier_bill_id
- amount
- currency
- paid_at
- payment_reference (nullable)
- notes

### `stock_movements`
- id
- product_variant_id
- movement_type (received, reserved, released, sold, adjustment, return)
- quantity_change
- related_order_id (nullable)
- related_supplier_bill_id (nullable)
- reason
- created_by_admin_id
- created_at

### `order_status_history`
- id
- order_id
- old_status
- new_status
- changed_by_admin_id
- note
- created_at

### `admin_audit_log` (recommended)
- id
- admin_id
- action
- entity_type
- entity_id
- details
- created_at

> Use appropriate numeric/decimal database types for money; **never use floating-point types for monetary values.**

---

## 8. API Outline

Use versioned endpoints such as `/api/v1`.

### Public storefront

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/products` | |
| GET | `/products/{slug}` | |
| GET | `/categories` | |
| POST | `/orders` | |
| GET | `/orders/{public_order_reference}` | Only if implemented with a secure, unguessable token; do not expose orders through sequential IDs. |

### Admin authentication

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/admin/auth/login` | |
| POST | `/admin/auth/logout` | If using server-managed sessions |
| GET | `/admin/auth/me` | |

### Admin products and inventory

| Method | Endpoint |
|---|---|
| GET | `/admin/products` |
| POST | `/admin/products` |
| GET | `/admin/products/{id}` |
| PATCH | `/admin/products/{id}` |
| POST | `/admin/products/{id}/images` |
| GET | `/admin/inventory` |
| POST | `/admin/inventory/adjustments` |

### Admin orders

| Method | Endpoint |
|---|---|
| GET | `/admin/orders` |
| GET | `/admin/orders/{id}` |
| PATCH | `/admin/orders/{id}/status` |
| POST | `/admin/orders/{id}/confirm` |
| POST | `/admin/orders/{id}/cancel` |
| POST | `/admin/orders/{id}/payments` |
| POST | `/admin/orders/{id}/assign` |

### Invoices

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/admin/orders/{id}/invoice` | |
| POST | `/admin/orders/{id}/invoice` | If invoice creation is explicit |
| GET | `/admin/invoices/{id}/pdf` | |

### Suppliers

| Method | Endpoint |
|---|---|
| GET | `/admin/suppliers` |
| POST | `/admin/suppliers` |
| GET | `/admin/supplier-bills` |
| POST | `/admin/supplier-bills` |
| POST | `/admin/supplier-bills/{id}/payments` |

This is an initial endpoint outline; adjust routes to the chosen API design and keep naming consistent.

---

## 9. Security, Reliability, and Data Integrity

Minimum requirements:

- Hash passwords using a modern password-hashing library; never store plaintext passwords.
- Protect all admin endpoints with authentication and authorisation.
- Keep secrets, database credentials, and API keys out of source control.
- Validate and normalise customer inputs, especially phone numbers and addresses.
- Validate prices, discounts, delivery fees, stock, and order totals on the backend.
- Use database transactions for order creation, stock reservation, invoice numbering, and payment recording.
- Prevent duplicate submissions from creating duplicate orders; consider an idempotency token for checkout.
- Use secure, unguessable public order references if customers can view orders without logging in.
- Apply rate limiting or other abuse controls to public order creation and login.
- Configure CORS for the actual frontend origin only.
- Use HTTPS in production.
- Keep audit history for order, stock, payment, and invoice adjustments.
- Back up the production database and test restoration.
- Do not log passwords, tokens, or unnecessary customer personal information.
- Restrict access to customer data to authorised admins.
- Define data retention and deletion practices consistent with applicable requirements.

---

## 10. SEO, Accessibility, and Performance

- Use meaningful product names, titles, meta descriptions, and URL slugs.
- Generate a sitemap and `robots.txt`.
- Provide canonical URLs where appropriate.
- Use descriptive alt text for product images.
- Optimise and resize images; lazy-load below-the-fold images.
- Ensure the site works on common mobile screen sizes.
- Provide visible keyboard focus, semantic controls, labels, and sufficient contrast.
- Avoid requiring sign-in to place an order.
- Show clear loading, empty, validation, and error states.
- Make the cart and checkout straightforward on mobile.
- Add analytics only with appropriate configuration and privacy disclosures.

Angular SEO requirements should be assessed for the chosen rendering approach. If organic search is a major acquisition channel, evaluate Angular SSR/prerendering for public product and category pages.

---

## 11. Out of Scope for MVP

Do not build these in the first release unless a clear business need appears:

- Native Android/iOS app.
- Driver app or driver login.
- Live GPS tracking.
- Courier-company API integration.
- Automated SMS, WhatsApp, or email notifications.
- Online card payments, wallets, or payment gateway.
- Customer loyalty points and referral system.
- Subscriptions.
- Advanced coupon engine.
- Multi-vendor marketplace.
- AI recommendations.
- Full accounting package or payroll.
- Advanced warehouse management.
- Multi-country shipping.
- Complex route optimisation.

Keep the architecture extensible so these can be considered after launch.

---

## 12. Suggested Implementation Phases

### Phase 1 — Project foundation
- Create Angular and FastAPI projects.
- Configure PostgreSQL, Alembic, environment settings, and deployment pipeline.
- Implement admin authentication.
- Add initial database models and migrations.

### Phase 2 — Catalogue and inventory
- Build product/category CRUD.
- Integrate image hosting.
- Build public home, category, and product pages.
- Implement variant-level inventory and stock adjustment history.

### Phase 3 — Cart and COD checkout
- Build cart and mobile checkout.
- Validate prices and inventory in the backend.
- Create order and order-item snapshots transactionally.
- Generate unique order references and show confirmation.

### Phase 4 — Admin order operations
- Build order list and order details.
- Add manual confirmation, status updates, assignment to a founder, cancellation, and failure reasons.
- Add a Contact Customer action for phone/WhatsApp.
- Implement COD collection recording and basic reports.

### Phase 5 — Invoices and suppliers
- Generate invoice PDFs.
- Add view/download/print actions.
- Add supplier bills, payments, and outstanding balance views.
- Add stock receiving and supplier-related stock movements.

### Phase 6 — Quality and launch readiness
- Test checkout, concurrent stock changes, cancellation, delivery failure, COD collection, invoice output, and supplier balance calculations.
- Test on mobile devices and major browsers.
- Configure HTTPS, backups, monitoring, and error reporting.
- Review Qatar business, consumer, privacy, tax, and invoicing requirements with qualified local sources/advisers.
- Complete real-order testing before public launch.

---

## 13. MVP Acceptance Criteria

The MVP is ready for a controlled launch when:

- [ ] Customers can browse active products and select an available colour/size.
- [ ] Product stock is tracked separately for each variant.
- [ ] Customers can place a COD order as guests.
- [ ] The backend calculates the authoritative total and delivery fee.
- [ ] Concurrent checkout attempts cannot oversell a variant.
- [ ] Admins can authenticate securely and manage products and inventory.
- [ ] Admins can view, search, confirm, assign, update, and cancel orders.
- [ ] Manual customer contact is possible from the order details page.
- [ ] COD collection is recorded separately from delivery status.
- [ ] An invoice can be generated, stored/reproduced, viewed, downloaded, and printed.
- [ ] A printed invoice can be placed inside a parcel.
- [ ] Supplier bills and payments show correct outstanding balances.
- [ ] Stock movements and critical order/payment changes are traceable.
- [ ] Customer and admin flows work on mobile.
- [ ] Production database backups and restore procedures are in place.
- [ ] Required local business and invoicing requirements have been checked before trading.

---

## 14. Important Business Rules

1. All storefront prices and totals are shown in QAR unless the business deliberately supports another currency.
2. COD is the only checkout payment method in the MVP.
3. A placed order is not necessarily a confirmed order.
4. A delivered order is not automatically a paid order; record cash collection explicitly.
5. Invoice, order, payment, and delivery statuses are separate concepts.
6. Historical order lines preserve the exact product name, variant, quantity, and price at the time of purchase.
7. Product stock must never be allowed to become negative through checkout.
8. Cancelled orders release reserved stock according to the defined inventory policy.
9. Supplier debt must be tracked independently from customer sales and cash collections.
10. Do not treat total order value as profit. Profit requires reliable cost, expense, return, and other accounting data.
11. Avoid making tax or legal assumptions in invoice templates; confirm which details are required for the registered business in Qatar.
12. Manual communication is intentional in the MVP; automation can be introduced later.

---

## 15. Expected Deliverables

- Angular customer storefront.
- Angular admin portal.
- FastAPI REST backend.
- PostgreSQL schema and Alembic migrations.
- Product and variant inventory management.
- COD checkout and order management.
- PDF invoice generation with print/download support.
- Basic supplier bills and payable tracking.
- Basic operational reports.
- Deployment and environment configuration documentation.
- README with local setup, migrations, tests, and deployment instructions.
- Automated tests for key checkout, inventory, payment, and invoice workflows.