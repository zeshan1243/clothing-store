# Sample data: 3 categories, 3 products, inventory

Copy-paste values for trying out the admin portal. Enter them in this order: **categories → products
(with variants and starting stock) → inventory adjustments**. All image links have been checked and load.

> These are new names, so they won't clash with the existing Hoodies / T-Shirts / Pants / Accessories.

---

## 1. Categories (Admin → Categories → Add category)

| Field | Shirts | Jackets | Denim |
|---|---|---|---|
| Name (English) | Shirts | Jackets | Denim |
| Name (Arabic) | قمصان | جاكيتات | دنيم |
| URL slug | *(leave blank)* → `shirts` | *(leave blank)* → `jackets` | *(leave blank)* → `denim` |
| Description (English) | Overshirts and button-ups for every layer. | Light layers for Doha evenings. | Straight, relaxed and washed-in denim. |
| Description (Arabic) | قمصان خارجية وقمصان بأزرار لكل إطلالة. | طبقات خفيفة لأمسيات الدوحة. | دنيم مستقيم وواسع بغسلات مميزة. |
| Display order | 5 | 6 | 7 |
| Visible in store | ✅ | ✅ | ✅ |

**Tile image URL** (optional; if left blank, a product photo is used):

- Shirts: `https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?q=80&w=1200&auto=format&fit=crop`
- Jackets: `https://images.unsplash.com/photo-1544022613-e87ca75a784a?q=80&w=1200&auto=format&fit=crop`
- Denim: `https://images.unsplash.com/photo-1565084888279-aca607ecce0c?q=80&w=1200&auto=format&fit=crop`

---

## 2. Products (Admin → Products → New product)

### Product 1: Check Flannel Overshirt

**Details tab**

| Field | Value |
|---|---|
| Name (English) | Check Flannel Overshirt |
| Name (Arabic) | قميص فلانيل مربعات واسع |
| URL slug | *(leave blank)* |
| Status | Active |
| Category | Shirts |
| Size guide | Tops — oversized |
| Description (English) | Brushed cotton flannel in a mustard check. Boxy fit, two chest pockets, and a weight that works as a shirt or a light jacket. |
| Description (Arabic) | قميص فلانيل قطني ناعم بنقشة مربعات خردلية. قصّة واسعة مع جيبين على الصدر، ووزن يناسب ارتداءه كقميص أو جاكيت خفيف. |
| Price | 165 |
| Sale price / discount % | *(leave blank)* |
| Featured on homepage | ✅ |
| New arrival | ✅ |

**Images tab**

| Image URL | Alt text | Colour |
|---|---|---|
| `https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?q=80&w=1200&auto=format&fit=crop` | Man wearing a mustard check flannel overshirt | Mustard Check |

**Variants & stock tab**: in the generator, enter Colours `Mustard Check #c9a227`, Sizes `S, M, L, XL`,
SKU prefix `CFO`, then set the starting stock:

| SKU | Colour | Hex | Size | Initial stock |
|---|---|---|---|---|
| CFO-MUS-S | Mustard Check | #c9a227 | S | 6 |
| CFO-MUS-M | Mustard Check | #c9a227 | M | 10 |
| CFO-MUS-L | Mustard Check | #c9a227 | L | 8 |
| CFO-MUS-XL | Mustard Check | #c9a227 | XL | 2 ← shows "Only 2 left" |

**SEO tab**: Page title `Check Flannel Overshirt | Brand Name`, Meta description
`Mustard check flannel overshirt with a boxy fit. Cash on delivery across Qatar.`

---

### Product 2: Nylon Bomber Jacket (on sale)

**Details tab**

| Field | Value |
|---|---|
| Name (English) | Nylon Bomber Jacket |
| Name (Arabic) | جاكيت بومبر نايلون |
| Status | Active |
| Category | Jackets |
| Size guide | Tops — oversized |
| Description (English) | Lightweight nylon bomber in rust with ribbed cuffs and hem, a sleeve utility pocket and a smooth lining. Built for breezy evenings. |
| Description (Arabic) | جاكيت بومبر خفيف من النايلون بلون الصدأ، بأساور وحافة مضلّعة وجيب على الكم وبطانة ناعمة. مثالي للأمسيات المعتدلة. |
| Price | 290 |
| Discount % | **15** (sets the sale price to 246.50 and shows a "−15%" badge) |
| Featured on homepage | ✅ |
| New arrival | ☐ |

**Images tab**

| Image URL | Alt text | Colour |
|---|---|---|
| `https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=1200&auto=format&fit=crop` | Rust nylon bomber jacket on a hanger | Rust |

**Variants & stock tab**: Colours `Rust #b4553a`, Sizes `S, M, L, XL`, SKU prefix `NBJ`:

| SKU | Colour | Hex | Size | Initial stock |
|---|---|---|---|---|
| NBJ-RUS-S | Rust | #b4553a | S | 4 |
| NBJ-RUS-M | Rust | #b4553a | M | 7 |
| NBJ-RUS-L | Rust | #b4553a | L | 5 |
| NBJ-RUS-XL | Rust | #b4553a | XL | 0 ← shows as sold out |

**SEO tab**: Page title `Nylon Bomber Jacket | Brand Name`, Meta description
`Rust nylon bomber jacket, now 15% off. Cash on delivery across Qatar.`

---

### Product 3: 90s Straight Jeans (two colours)

**Details tab**

| Field | Value |
|---|---|
| Name (English) | 90s Straight Jeans |
| Name (Arabic) | جينز مستقيم طراز التسعينات |
| Status | Active |
| Category | Denim |
| Size guide | None |
| Description (English) | Rigid cotton denim with a mid rise and a straight leg. Available in a faded light wash and washed black. |
| Description (Arabic) | جينز قطني متين بخصر متوسط وساق مستقيمة. متوفر بغسلة فاتحة باهتة وبالأسود المغسول. |
| Price | 210 |
| Sale price / discount % | *(leave blank)* |
| Featured on homepage | ☐ |
| New arrival | ✅ |

**Images tab**

| Image URL | Alt text | Colour |
|---|---|---|
| `https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=1200&auto=format&fit=crop` | Light wash and black straight jeans folded | *(blank)* |
| `https://images.unsplash.com/photo-1565084888279-aca607ecce0c?q=80&w=1200&auto=format&fit=crop` | Stack of folded denim jeans | Light Wash |

**Variants & stock tab**: Colours `Light Wash #a9c4dc, Black #1d1d1f`, Sizes `28, 30, 32, 34`,
SKU prefix `STJ`:

| SKU | Colour | Hex | Size | Initial stock |
|---|---|---|---|---|
| STJ-LIG-28 | Light Wash | #a9c4dc | 28 | 3 |
| STJ-LIG-30 | Light Wash | #a9c4dc | 30 | 8 |
| STJ-LIG-32 | Light Wash | #a9c4dc | 32 | 8 |
| STJ-LIG-34 | Light Wash | #a9c4dc | 34 | 4 |
| STJ-BLA-28 | Black | #1d1d1f | 28 | 2 |
| STJ-BLA-30 | Black | #1d1d1f | 30 | 6 |
| STJ-BLA-32 | Black | #1d1d1f | 32 | 9 |
| STJ-BLA-34 | Black | #1d1d1f | 34 | 1 |

**SEO tab**: Page title `90s Straight Jeans | Brand Name`, Meta description
`Mid-rise straight-leg jeans in light wash or black. Cash on delivery across Qatar.`

---

## 3. Inventory adjustments (Admin → Inventory → search the SKU → Adjust)

Three practice movements, one per adjustment type. Each one appears in the variant's stock history.

| SKU | Type | Quantity | Reason | Stock after |
|---|---|---|---|---|
| NBJ-RUS-XL | Received stock | +6 | New batch from supplier, bill INV-1042 | 0 → 6 (back in stock) |
| CFO-MUS-M | Correction | −1 | Recount: one shirt damaged in storage | 10 → 9 |
| STJ-BLA-32 | Customer return | +1 | Exchange returned unworn with tags | 9 → 10 |

---

## What to check afterwards

- **Home page:** the overshirt and bomber appear under featured, and the overshirt and jeans under new arrivals.
- **Shop → Jackets:** the bomber shows **−15%**, **QAR 246.50** with QAR 290.00 crossed out.
- **Product pages:** Overshirt XL shows "Only 2 left". Bomber XL shows as sold out until you do the "Received stock" adjustment.
- **Shop filters:** the Denim page offers sizes 28–34 and the colours Light Wash and Black.
- **Admin → Inventory → "Low stock only":** lists the variants at or below 3 (e.g. CFO-MUS-XL, STJ-BLA-28, STJ-BLA-34).
