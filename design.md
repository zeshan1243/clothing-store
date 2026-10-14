# Design System & UI Specification

**Project:** Gen Z Streetwear E-commerce Platform (Qatar, Doha first)
**Companion to:** *Clothing Brand E-commerce Platform — Initial MVP Requirements v1.0*
**Scope:** Customer storefront + Admin portal
**Stack fit:** Angular + TypeScript, mobile-first, CSS custom properties (design tokens)

> The brand name is not final. `{BRAND}` is used as a placeholder throughout. Colours and type below are a recommended starting point and should be validated with the real logo.

---

## 1. Design Vision

**One-line direction:** *Dark, confident, editorial streetwear, made effortless to shop.*

The look should feel like a premium drop-culture brand (bold type, big photography, high contrast), but the shopping flow should feel as simple as a modern marketplace: few taps, no confusion, no friction.

### Design pillars

| Pillar | What it means in practice |
|---|---|
| **Bold, not busy** | Large type and large product photos; lots of breathing room; one accent colour used sparingly. |
| **Mobile first** | 80%+ of Gen Z traffic is on phones. Design for a 390px screen first, then scale up. |
| **Fast to buy** | Size selection and add-to-cart reachable without scrolling; guest checkout in one page. |
| **Trustworthy** | COD, delivery time, returns, and WhatsApp contact are always visible. New brands win on trust. |
| **Drop culture** | Make "new" and "limited" feel exciting: New Drop badges, low-stock indicators, collection banners. |
| **Local and bilingual-ready** | Built so Arabic (RTL) can be added without redesign. QAR pricing, Qatar phone format. |

### Mood keywords
Sleek · Confident · Editorial · Urban · Premium · Clean · Youthful

### What to avoid
- Cluttered grids with many badges and banners.
- Pop-ups on first load (newsletter, discount, cookie walls stacked together).
- Stock photos, low-quality images, or inconsistent image crops.
- Too many accent colours or gradients.
- Tiny tap targets and tiny grey text.

---

## 2. Colour System

A dark-neutral base with a single electric accent. Neutral surfaces keep product photos as the hero; the accent guides the eye to actions.

### 2.1 Core palette

| Token | Hex | Use |
|---|---|---|
| `--ink-950` | `#0B0B0C` | Primary dark background, headings on light |
| `--ink-900` | `#141416` | Cards on dark, footer |
| `--ink-800` | `#1E1E22` | Elevated dark surfaces, hover |
| `--ink-600` | `#4A4A52` | Secondary text on light |
| `--ink-400` | `#8A8A94` | Placeholder, disabled text |
| `--ink-200` | `#D9D9DE` | Borders on light |
| `--bone-100` | `#F5F2EC` | Primary light background (warm off-white) |
| `--bone-50` | `#FAF8F4` | Cards on light |
| `--white` | `#FFFFFF` | Inputs, modals |
| `--volt-400` | `#D4FF3A` | **Primary accent**: CTAs on dark, highlights, badges |
| `--volt-500` | `#BDE82A` | Accent hover/pressed |
| `--volt-700` | `#7A9A00` | Accent for text/icons on light backgrounds (passes contrast) |

### 2.2 Semantic colours

| Purpose | Hex | Notes |
|---|---|---|
| Success / In stock | `#1FA971` | Delivered, paid, available |
| Warning / Low stock | `#F5A524` | "Only 2 left", pending |
| Danger / Error | `#E5484D` | Errors, out of stock, cancelled |
| Info | `#3B82F6` | Notices, out for delivery |
| Sale price | `#E5484D` | Sale price text; old price in `--ink-400` with strikethrough |

### 2.3 Usage rules

- **60 / 30 / 10 rule:** 60% neutral (bone or ink), 30% secondary neutral/photography, 10% accent.
- **Volt is for actions and emphasis only:** primary buttons, "New" badges, active filter chips, focus accents. Never for large backgrounds or body text.
- **Volt on white/bone fails contrast.** On light backgrounds use a dark button (`--ink-950` with white text) or `--volt-700` for text/icons.
- **Primary button on light surfaces:** ink background, white text. **On dark surfaces:** volt background, ink text.
- Minimum text contrast: **4.5:1** for body, **3:1** for large text and UI components (WCAG AA).

### 2.4 Theme approach

- **Storefront default:** light theme (bone) with dark hero sections and dark footer. Product photos sit best on warm light backgrounds, and checkout should feel clean and calm.
- **Optional:** full dark mode via `prefers-color-scheme`, using the same tokens remapped.
- **Admin portal:** light theme by default for readability of data tables (see section 10).

---

## 3. Typography

Pairing a distinctive display face with a neutral workhorse gives the brand character without hurting readability.

| Role | Font | Fallback | Notes |
|---|---|---|---|
| **Display / Headings** | **Space Grotesk** (alt: Unbounded, Clash Display) | system-ui, sans-serif | Tight, geometric, modern. Use 600–700 weight. |
| **Body / UI** | **Inter** | system-ui, sans-serif | 400 / 500 / 600. Excellent at small sizes. |
| **Arabic (future)** | **IBM Plex Sans Arabic** or **Noto Kufi Arabic** | system-ui | Pair with Inter metrics; test line height. |
| **Numbers / prices** | Space Grotesk or Inter with `font-variant-numeric: tabular-nums` | | Aligned columns in cart and tables. |

### 3.1 Type scale (mobile → desktop)

| Style | Mobile | Desktop | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Display XL (hero) | 40px | 88px | 700 | 0.95 | -0.03em |
| H1 | 32px | 56px | 700 | 1.05 | -0.02em |
| H2 | 24px | 36px | 600 | 1.15 | -0.015em |
| H3 | 20px | 24px | 600 | 1.25 | -0.01em |
| Body L | 17px | 18px | 400 | 1.55 | 0 |
| Body | 15px | 16px | 400 | 1.55 | 0 |
| Small | 13px | 14px | 400 | 1.45 | 0 |
| Overline / label | 11px | 12px | 600 | 1.2 | 0.08em, UPPERCASE |
| Button | 15px | 15px | 600 | 1 | 0.01em |
| Price | 16px | 18px | 600 | 1 | tabular-nums |

**Rules:** minimum body size 15px on mobile; one display heading per screen; sentence case for buttons and body, uppercase only for small labels and badges.

---

## 4. Layout, Spacing & Shape

### 4.1 Grid

| Breakpoint | Width | Columns | Gutter | Side margin |
|---|---|---|---|---|
| Mobile | 360–599 | 4 | 12px | 16px |
| Tablet | 600–1023 | 8 | 16px | 24px |
| Desktop | 1024–1439 | 12 | 24px | 40px |
| Wide | 1440+ | 12 (max-width 1360px) | 24px | auto |

Product grid: **2 columns on mobile**, 3 on tablet, 4 on desktop.

### 4.2 Spacing scale (8px base)

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`
Section vertical spacing: 48px mobile / 96px desktop.

### 4.3 Shape and elevation

| Element | Radius |
|---|---|
| Buttons, inputs | 12px |
| Cards, product images | 16px |
| Chips, badges | 999px (pill) |
| Modals / bottom sheets | 24px (top corners) |

- Prefer **borders over shadows**: 1px `--ink-200`.
- Single soft shadow for floating elements (sheets, dropdowns): `0 12px 32px rgba(11,11,12,0.14)`.
- Product images: **4:5 portrait** ratio everywhere, consistently cropped.

---

## 5. Design Tokens (Angular-ready)

Define once in `src/styles/tokens.css` and use everywhere. No hard-coded colours in components.

```css
:root {
  /* Colour */
  --ink-950:#0B0B0C; --ink-900:#141416; --ink-800:#1E1E22;
  --ink-600:#4A4A52; --ink-400:#8A8A94; --ink-200:#D9D9DE;
  --bone-100:#F5F2EC; --bone-50:#FAF8F4; --white:#FFFFFF;
  --volt-400:#D4FF3A; --volt-500:#BDE82A; --volt-700:#7A9A00;
  --success:#1FA971; --warning:#F5A524; --danger:#E5484D; --info:#3B82F6;

  /* Semantic aliases */
  --bg: var(--bone-100);
  --surface: var(--bone-50);
  --text: var(--ink-950);
  --text-muted: var(--ink-600);
  --border: var(--ink-200);
  --accent: var(--volt-400);
  --focus-ring: 0 0 0 3px rgba(212,255,58,.55), 0 0 0 5px var(--ink-950);

  /* Type */
  --font-display: "Space Grotesk", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;

  /* Shape + space */
  --radius-sm:12px; --radius-md:16px; --radius-lg:24px; --radius-pill:999px;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-6:24px; --space-8:32px; --space-12:48px; --space-16:64px;

  /* Motion */
  --ease-out: cubic-bezier(.22,1,.36,1);
  --dur-fast:150ms; --dur-base:250ms; --dur-slow:450ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: var(--ink-950); --surface: var(--ink-900);
    --text: var(--bone-100); --text-muted: var(--ink-400);
    --border: var(--ink-800);
  }
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

---

## 6. Core Components

### 6.1 Buttons

| Variant | Light surface | Dark surface | Use |
|---|---|---|---|
| **Primary** | Ink bg, white text | Volt bg, ink text | Add to cart, Place order, Checkout |
| **Secondary** | Transparent, 1.5px ink border | Transparent, 1.5px bone border | Continue shopping, Filters |
| **Ghost** | Text only, underline on hover | Same | Tertiary links |
| **Danger** | Red bg, white text | Same | Cancel order (admin) |

- Height: **52px** on mobile for primary CTAs (comfortable thumb target), 44px minimum for all others.
- Full-width on mobile for primary actions.
- States: default, hover (slight lift + colour shift), pressed (scale 0.98), focus (focus ring), disabled (40% opacity, no pointer), loading (spinner replaces label, width stays fixed).

### 6.2 Product card

```
┌──────────────────────┐
│  [NEW]        [♡]    │   ← badges top-left, wishlist top-right (optional, post-MVP)
│                      │
│     Product image    │   ← 4:5, swaps to 2nd image on hover (desktop)
│                      │
│  ● ● ○  +2           │   ← colour swatches (max 3 + count)
├──────────────────────┤
│  Oversized Hoodie    │   ← 15px / 500, 2 lines max
│  QAR 189   QAR 229   │   ← sale in red, old price struck through
│  Only 3 left         │   ← only when low stock
└──────────────────────┘
```

- Whole card is the tap target.
- Badges: `NEW` (volt, ink text), `SALE` (red), `SOLD OUT` (ink, white text, image dimmed to 50%).
- Skeleton loader matches card shape.

### 6.3 Size selector (key UX element)

- Large square buttons in a horizontal row (min 48×48px), not a dropdown.
- States: available (outlined), selected (ink fill / white text), unavailable (diagonal strike-through, 40% opacity, not selectable).
- Selected colour determines which sizes are available (backed by variant stock).
- "Size guide" link directly above, opening a bottom sheet with a table and measuring tips.
- If the customer taps Add to Cart without choosing a size: scroll to selector, shake it subtly, show "Select a size".

### 6.4 Colour selector
- Round swatches 36px with a 2px ring when selected. Colour name shown beside label ("Colour: Washed Black").
- Swatch for sold-out colour is dimmed with a slash.

### 6.5 Quantity stepper
- `− 1 +` with 44px buttons. Max constrained to available stock; show "Max available" hint at the limit.

### 6.6 Form inputs
- 52px height, 12px radius, 1.5px border, labels above the field (never placeholder-only labels).
- Inline validation on blur; error text in red under the field with an icon.
- Correct input types and `inputmode` (`tel` for phone, `email` for email), `autocomplete` attributes enabled to speed up checkout.
- Phone field: fixed `+974` prefix chip, 8-digit validation for Qatar mobiles.

### 6.7 Chips / filters
- Pill-shaped, horizontally scrollable on mobile. Active chip: ink fill (light theme). Show result count on the apply button in the filter sheet: "Show 24 items".

### 6.8 Feedback components
- **Toast:** bottom-centre on mobile, 3s, used for "Added to cart" with a "View cart" action.
- **Mini-cart drawer:** slides in after add-to-cart (right on desktop, bottom sheet on mobile).
- **Empty states:** friendly illustration or icon, one sentence, one action.
- **Skeletons** instead of spinners for lists and product pages.

### 6.9 Iconography
- One consistent outline icon set (e.g., Lucide or Phosphor), 24px, 1.75px stroke. No mixing of styles.

---

## 7. Storefront Page Designs

### 7.1 Navigation

**Mobile header (sticky, 56px):** `☰ menu` · centred logo · `🔍 search` · `🛍 cart (count badge in volt)`
**Desktop header:** logo left, main links centre (New In, Men, Women, Accessories, Sale), search + cart right.
**Announcement bar (above header, 36px, ink bg, volt text):** "Cash on Delivery · Delivery across Doha · Easy exchanges". Rotating max 3 messages.

### 7.2 Home page

```
┌──────────────────────────────┐
│ ▓ Announcement bar ▓         │
│ ☰      {BRAND}      🔍  🛍   │
├──────────────────────────────┤
│                              │
│   HERO: full-bleed photo     │
│   or short looping video     │
│   "DROP 01" overline         │
│   BIG HEADLINE (Display XL)  │
│   [ Shop the drop ]          │  ← volt button on dark overlay
│                              │
├──────────────────────────────┤
│ Trust strip:                 │
│ 💵 Cash on Delivery  🚚 Doha │
│ 🔁 Easy exchange  💬 WhatsApp│
├──────────────────────────────┤
│ New arrivals  →  View all    │
│ [card][card][card][card] →   │  ← horizontal scroll on mobile
├──────────────────────────────┤
│ Shop by category             │
│ [ big tile ][ big tile ]     │  ← 2 large image tiles with label
│ [ big tile ][ big tile ]     │
├──────────────────────────────┤
│ Editorial banner (lookbook)  │
├──────────────────────────────┤
│ Best sellers grid            │
├──────────────────────────────┤
│ Social proof: Instagram feed │
│ or customer photos           │
├──────────────────────────────┤
│ Footer (dark)                │
└──────────────────────────────┘
```

**Unique touches**
- **Drop banner with countdown/label:** "DROP 01 · LIVE NOW" or "NEXT DROP IN 02:14:33" gives urgency and a reason to return.
- **Marquee strip:** slow, large scrolling text between sections (e.g. `NEW SEASON ✦ CASH ON DELIVERY ✦ MADE FOR THE CITY ✦`), a recognisable streetwear signature. Pauses under `prefers-reduced-motion`.
- **Oversized category tiles** with text overlaid in Display type.

### 7.2.1 Home Hero Section (Signature Animated Hero)

**Concept: "The Drop Reveal."** The first screen should feel like a fashion film title card: dark, cinematic, confident, and alive. The hero introduces the current drop, proves the brand is real (trust strip), and gets the visitor to a product in one tap.

**Design goals**
- Wow in the first 2 seconds, usable in the first 3.
- Fully animated but never blocking: the CTA is visible and tappable within 1.2s.
- Classy, not noisy: one accent colour (volt), large type, and photography do the work.
- Stays fast on mid-range phones (animate only `transform` and `opacity`).

#### Layout (mobile, 390×844, hero height `100svh` minus announcement bar and header)

```
┌──────────────────────────────┐
│ ▓ Cash on Delivery · Doha ▓  │  ← announcement bar
│ ☰       {BRAND}      🔍  🛍  │  ← transparent header over hero
├──────────────────────────────┤
│  ● DROP 01 · LIVE NOW        │  ← pulsing volt dot + overline
│                              │
│  BUILT                       │
│  FOR THE                     │  ← Display XL, 3 lines, masked reveal
│  CITY.                       │     last word in volt
│                              │
│  New season essentials.      │  ← Body L, muted bone
│  Delivered to your door.     │
│                              │
│  [ Shop the drop  → ]        │  ← volt primary button, magnetic
│  Watch lookbook ▸            │  ← ghost link
│                              │
│   ┌────────┐                 │
│   │ model  │  ← full-bleed photo/video, slow Ken Burns,
│   │ photo  │     dark gradient overlay (bottom 60%) for legibility
│   └────────┘                 │
│  ✦ NEW SEASON ✦ COD ✦ DOHA ✦ │  ← marquee strip pinned to hero bottom
│  ⌄ scroll                    │
└──────────────────────────────┘
```

**Desktop (1440×900):** two-layer composition. Headline left (Display XL up to 120px, spans 7 columns), model cut-out or portrait photo right, with a rotating circular text badge ("NEW DROP • LIMITED • NEW DROP • LIMITED •") overlapping the photo edge. Floating product mini-cards (2–3) drift at different speeds for depth.

#### Visual layers (back to front)

| Layer | Content | Behaviour |
|---|---|---|
| 1. Background | Full-bleed photo or ≤6s muted looping video (poster fallback) | Slow Ken Burns zoom 1.0 → 1.08 over 14s, alternating |
| 2. Overlay | Gradient `ink-950` 0% → 85% from top to bottom, plus subtle film grain (opacity 6%) | Static; grain flickers at 8fps |
| 3. Glow | Soft volt radial blur (opacity 12%) behind the headline | Slowly drifts (20s loop) |
| 4. Content | Overline, headline, subtext, CTAs | Staggered entrance (see timeline) |
| 5. Floating cards | Mini product cards with name and price | Parallax on scroll and pointer move (desktop) |
| 6. Marquee | Large looping text strip | Continuous, pauses on hover |

#### Page-load animation timeline

| Time | Animation |
|---|---|
| 0 ms | Dark screen; logo fades in centre (optional 600ms intro on first visit only, skipped on return visits via `sessionStorage`) |
| 0–400 ms | Background image fades from black and starts Ken Burns |
| 200 ms | Overline `● DROP 01 · LIVE NOW` slides up 12px + fades in; volt dot begins pulsing (scale 1 → 1.6, opacity 1 → 0, 1.8s loop) |
| 300–700 ms | **Headline line-by-line mask reveal:** each line rises from below a clipping mask (`translateY(110%) → 0`, 700ms, `--ease-out`), 90ms stagger. Final word "CITY." gets a volt colour wipe left → right |
| 700 ms | Subtext fades up (300ms) |
| 850 ms | Primary button scales from 0.9 → 1 with a soft volt glow pulse; secondary link fades in |
| 1000 ms | Floating product cards (desktop) fly in from the right with slight rotation (−4° → 0°), 120ms stagger |
| 1200 ms | Marquee strip slides up from the bottom edge; scroll cue bounces |
| Ongoing | Ken Burns, grain, glow drift, marquee, button idle pulse every 6s |

**Target:** headline and CTA fully interactive by **1.2s**.

#### Interaction animations

| Trigger | Effect |
|---|---|
| **CTA hover (desktop)** | Magnetic pull: button follows the cursor within a 40px radius; arrow slides right 6px; background shifts `volt-400 → volt-500` |
| **CTA press** | Scale 0.97, ripple from the touch point |
| **Pointer move (desktop)** | Photo and floating cards shift 8–20px by depth (parallax); headline letters respond subtly (±2px) |
| **Scroll (0 → 100vh)** | Hero content moves up slower than the page (0.6×) and fades; photo scales 1.08 → 1.2; header turns from transparent to solid ink with blur (`backdrop-filter`) after 80px |
| **Mobile tilt (optional)** | Gentle gyroscope parallax, only after permission is granted; off by default |
| **Scroll cue** | Mouse/chevron bounces; disappears after first scroll |
| **Marquee hover** | Slows to 30% speed |
| **Headline hover (desktop)** | Per-word underline sweep in volt |

#### Rotating hero slides (optional, up to 3)

- Auto-advance every 6s with a thin volt progress bar at the bottom; pause on hover and on touch.
- Transition: current slide wipes out with a diagonal clip-path (`polygon`) while the next scales in 1.1 → 1.0, 700ms.
- Swipe on mobile; arrow keys on desktop; dot/segment indicators are real buttons with labels.
- Each slide: its own overline, headline, image and link (e.g. "DROP 01", "HOODIE SEASON", "UNDER QAR 99").
- If there is only one campaign, use a single static hero. Do not rotate for the sake of it.

#### Copy options (pick one voice)

| Style | Headline | Subtext |
|---|---|---|
| Confident | BUILT FOR THE CITY. | New season essentials. Delivered to your door. |
| Minimal | WEAR THE DROP. | Limited pieces. Pay on delivery. |
| Local | DOHA, DRESSED. | Streetwear made for the heat and the hustle. |

CTA labels: **Shop the drop** (primary) · **Watch lookbook** (secondary). Keep headline ≤ 4 words and subtext ≤ 12 words.

#### Hero trust strip (directly under the hero)

Four compact items with icons: `Cash on Delivery` · `Delivery across Doha` · `Easy exchanges` · `WhatsApp support`. Items fade up with a 80ms stagger as they enter the viewport.

#### Implementation notes (Angular)

- Build as a standalone `HeroComponent` with `OnPush` change detection.
- **Animation tool options:** CSS keyframes + `IntersectionObserver` for most effects (lightest); **GSAP** (core + ScrollTrigger, lazy-loaded) for the timeline, magnetic button and scroll parallax; Angular Animations is acceptable for simple enter/leave.
- Run animation code outside Angular's zone (`NgZone.runOutsideAngular`) for pointer and scroll handlers to avoid unnecessary change detection.
- Use `requestAnimationFrame`, passive scroll listeners, and `will-change: transform` only on animating layers (remove after the intro completes).
- Headline reveal: split text into lines/words with spans (`aria-label` on the heading with the full text, `aria-hidden` on the split spans so screen readers read it once).

```css
/* Masked line reveal */
.hero-line { display:block; overflow:hidden; }
.hero-line > span {
  display:inline-block;
  transform: translateY(110%);
  animation: rise 700ms var(--ease-out) forwards;
  animation-delay: calc(300ms + var(--i) * 90ms);
}
@keyframes rise { to { transform: translateY(0); } }

/* Ken Burns */
.hero-bg { animation: kenburns 14s ease-in-out infinite alternate; }
@keyframes kenburns { from { transform: scale(1); } to { transform: scale(1.08); } }

/* Pulsing live dot */
.live-dot::after {
  content:""; position:absolute; inset:0; border-radius:50%;
  background: var(--volt-400);
  animation: ping 1.8s var(--ease-out) infinite;
}
@keyframes ping { to { transform: scale(2.4); opacity: 0; } }

/* Marquee */
.marquee-track { display:flex; width:max-content; animation: marquee 28s linear infinite; }
@keyframes marquee { to { transform: translateX(-50%); } }
.marquee:hover .marquee-track { animation-duration: 90s; }
```

#### Performance and fallback rules

- Hero image: AVIF/WebP, `fetchpriority="high"`, preloaded, sized per breakpoint, < 200KB. Never lazy-load the hero image.
- Video: muted, `playsinline`, `preload="metadata"`, ≤ 2MB, only loaded on desktop or good connections (`navigator.connection.saveData` / effective type check); otherwise show the poster image.
- Reserve hero height with `100svh` (not `100vh`) to avoid mobile browser-bar jumps; zero layout shift.
- Entrance animations run once; infinite loops (Ken Burns, grain, marquee) pause when the hero is off-screen (`IntersectionObserver`) or the tab is hidden.
- Skip heavy effects (grain, parallax, floating cards) on low-end devices (`hardwareConcurrency <= 4` or Save-Data).

#### Accessibility rules for the hero

- Honour `prefers-reduced-motion`: show the final state immediately (no mask reveal, Ken Burns, marquee, parallax, or auto-rotation); keep simple 150ms fades only.
- Text over imagery must keep ≥ 4.5:1 contrast (gradient overlay guarantees this; test on every new image).
- Provide a visible pause/play control for any auto-rotating slides or looping video (WCAG 2.2.2).
- CTAs reachable by keyboard in logical order; focus ring visible against the dark overlay (volt ring).
- Don't flash faster than 3 times per second (the grain flicker must stay subtle and low-contrast).
- Hero headline is a real `<h1>`; the marquee is `aria-hidden="true"` (decorative).

#### Hero acceptance checklist

- [ ] CTA visible and interactive within 1.2s on a mid-range phone over 4G.
- [ ] LCP < 2.5s with the hero image/poster as the LCP element.
- [ ] No layout shift during the intro (CLS ≈ 0).
- [ ] Reduced-motion mode shows a static, fully legible hero.
- [ ] Looks correct at 360px, 390px, 768px, 1440px and 1920px widths.
- [ ] Works in Safari iOS, Chrome Android and desktop Chrome/Safari/Firefox.
- [ ] Text remains readable over every uploaded hero image (admin guidance: use photos with calm negative space on the text side).

### 7.3 Collection / listing page

- Page title (H1) + item count.
- Sticky filter bar: `Filter` and `Sort` buttons (mobile) opening bottom sheets. Desktop: left filter sidebar.
- Filters: category, size, colour, price range, availability (in stock only).
- Sort: Newest, Price low→high, Price high→low.
- Infinite scroll with "Load more" fallback; keep scroll position when returning from a product page.
- Empty result state with "Clear filters" action.

### 7.4 Product details page (highest-conversion screen)

**Mobile layout**
```
┌──────────────────────────────┐
│ ‹ Back                  🛍   │
│ ┌──────────────────────────┐ │
│ │  Swipeable image gallery │ │  ← dots + pinch zoom
│ │  (4:5, edge-to-edge)     │ │
│ └──────────────────────────┘ │
│ Oversized Hoodie             │  ← H2
│ QAR 189  ̶Q̶A̶R̶ ̶2̶2̶9̶   SALE    │
│ Colour: Washed Black         │
│ ◉ ○ ○                        │
│ Size            Size guide → │
│ [S] [M] [L] [XL] [XXL]       │
│ ⚠ Only 3 left in M           │  ← from variant stock
│ Quantity  [ − 1 + ]          │
│ ▸ Description                │  ← accordions
│ ▸ Fit & fabric               │
│ ▸ Delivery & returns         │
│ 💬 Ask us on WhatsApp        │
├──────────────────────────────┤
│ You may also like  →         │
├──────────────────────────────┤
│ ▓ STICKY BAR (bottom) ▓      │
│ QAR 189   [ Add to cart ]    │  ← always visible
└──────────────────────────────┘
```

**Desktop:** two columns, image gallery (thumbnails on the left, large image) and a sticky purchase panel on the right.

**Key behaviours**
- Sticky bottom "Add to cart" bar on mobile so the action is always one tap away.
- Availability text updates instantly when colour/size changes.
- Delivery info chip: "Cash on Delivery · Delivered in 1–3 days" near the CTA.
- "Ask on WhatsApp" opens `wa.me` with a prefilled message including the product name and link.

### 7.5 Cart

- Opens as a **drawer** from the product page; full page at `/cart`.
- Each line: thumbnail, name, colour/size, stepper, remove, line price.
- Summary: subtotal, delivery fee, **total (large, bold)**.
- Free-delivery progress bar if a threshold is configured ("Add QAR 40 for free delivery"), with the bar filled in volt.
- Primary CTA: **Checkout** (full-width). Under it: payment note "Pay with cash when your order arrives."
- Stock/price changes detected on revalidation shown clearly: "Size M is now only 1 left. We updated your cart."

### 7.4 Checkout (single page, guest)

Goal: **under 60 seconds on a phone.** One scrolling page, with a persistent order summary.

```
1. Contact        Full name · Mobile (+974) · Email (optional)
2. Delivery       Area (searchable list) · Street/Building/Zone · Landmark / instructions
3. Payment        ◉ Cash on Delivery (pre-selected, only option)
                  "Pay the exact amount to the delivery person."
4. Order summary  Items · Subtotal · Delivery · Total (QAR)
                  [ Place order · QAR 378 ]   ← sticky bottom CTA on mobile
```

- Collapsed order summary at the top on mobile ("Show order summary · QAR 378"), expandable.
- No account wall, no distractions: minimal header (logo + secure/back link), no main navigation.
- Prevent double taps: button goes into loading state and is disabled after the first press.
- Error handling: scroll to the first invalid field and focus it.

### 7.5 Order confirmation

- Large success mark (volt circle with ink check), headline "Order placed!"
- Order reference in a copyable chip.
- Items, delivery details, total payable, "Payment: Cash on Delivery".
- Clear next-step message: "We'll contact you on WhatsApp/phone shortly to confirm your order."
- Actions: `Continue shopping`, `Save order reference` (screenshot-friendly layout).
- Optional: "Message us on WhatsApp" button prefilled with the order reference.

### 7.6 Static pages
- Single readable column (max 680px), clear H1/H2 hierarchy, table of contents on long policy pages.
- Size guide: tabbed by category (Tops / Bottoms), cm and inch toggle, "How to measure" illustration.

### 7.7 Footer (dark)
- Logo, short brand line, link groups (Shop, Help, Company), contact (WhatsApp, phone, email), social icons, policy links, copyright, "Cash on Delivery" mark.

---

## 8. Imagery & Content Direction

- **Photography:** consistent style: natural light or studio with one backdrop colour, model + flat-lay shots. Consistent 4:5 crop; first image clean front shot, then detail, then on-model.
- **Image delivery:** Cloudinary transformations (`f_auto,q_auto,w_…`), responsive `srcset`, lazy-load below the fold, reserve space to avoid layout shift.
- **Video:** short muted looping hero (≤ 6s, <2MB) with poster image fallback.
- **Copy tone:** short, confident, casual. Example: "Built for the city. Delivered to your door." Avoid long paragraphs.
- **Microcopy examples:**
  - Add to cart → "Added. Nice pick."
  - Empty cart → "Your cart is empty. Let's fix that."
  - Low stock → "Only 2 left"
  - Sold out → "Sold out" (no "notify me" in MVP)

---

## 9. Motion & Interaction

Motion should feel quick and purposeful. Never decorative for its own sake.

| Interaction | Behaviour | Duration |
|---|---|---|
| Button press | Scale to 0.98 | 100ms |
| Add to cart | Button label morphs to a check, cart badge pops, mini-cart opens | 250ms |
| Bottom sheet / drawer | Slide + fade, ease-out | 250–350ms |
| Image gallery | Swipe with snap, subtle zoom on tap | 250ms |
| Page transitions | Fade/slide 8px | 200ms |
| Scroll reveal | Fade-up on product grids (once only) | 450ms |
| Marquee | Linear, slow | continuous |
| Skeleton | Shimmer | 1.4s loop |

- Honour `prefers-reduced-motion`.
- Animate only `transform` and `opacity` to keep it smooth on mid-range phones.

---

## 10. Admin Portal Design

Goal: **clear, fast, and calm.** Founders use it daily, often on a phone, while packing and delivering orders.

### 10.1 Visual style
- Same tokens and fonts as the storefront for brand consistency, but a **light, denser** layout. Ink sidebar with volt active indicator.
- Data first: tables, status pills, big numbers.

### 10.2 Layout
- **Desktop:** left sidebar (Dashboard, Orders, Products, Inventory, Suppliers, Reports, Settings) + top bar (search, admin name).
- **Mobile:** bottom tab bar (Dashboard, Orders, Products, More). Tables become stacked cards.

### 10.3 Dashboard

```
┌─────────┬─────────┬─────────┬─────────┐
│ New     │ To      │ Out for │ Delivered│
│ orders  │ prepare │ delivery│ today    │
│   7     │   4     │   3     │   12     │
├─────────┴─────────┴─────────┴─────────┤
│ Sales (placed)   │ COD collected      │
│ QAR 12,450       │ QAR 9,820          │
│ (gross order     │ COD outstanding    │
│  value, labelled)│ QAR 2,630          │
├──────────────────┴────────────────────┤
│ Low stock variants   │ Supplier owed  │
│ Hoodie / Black / M: 1│ QAR 8,200      │
└──────────────────────┴────────────────┘
```
- Every figure labelled precisely (e.g. "Gross order value" vs "Cash collected") per the business rules.
- Period selector: Today · 7 days · 30 days · Custom.

### 10.4 Order list and detail
- **List:** search bar, filter chips (status, payment), newest first. Each row: order number, customer, total, **status pill + payment pill (separate)**, time.
- **Detail:** header with order number and both statuses; sections for Customer, Items, Totals, Payment, Notes, History.
- **Primary action area (sticky on mobile):** shows only the next valid action: *Confirm order* → *Mark preparing* → *Out for delivery* → *Delivered & record cash*.
- **Contact Customer** button group: `Call` · `WhatsApp` · `Copy number`.
- **Invoice** card: View · Download PDF · Print.
- Destructive actions (Cancel order) in a danger button with a confirmation dialog requiring a reason.
- Timeline component for status/payment/stock history.

### 10.5 Status pill colours

| Status | Colour |
|---|---|
| PLACED | Grey |
| CONFIRMED | Blue |
| PREPARING | Amber |
| OUT_FOR_DELIVERY | Purple |
| DELIVERED | Green |
| CANCELLED | Red |
| DELIVERY_FAILED | Red outline |
| Payment PENDING | Amber outline |
| Payment PAID | Green |
| REFUNDED | Grey outline |

Always pair colour with a text label and optional icon (never colour alone).

### 10.6 Product & inventory screens
- Product form in tabs: *Details · Images · Variants & Stock · SEO*.
- **Variant grid:** rows = colours, columns = sizes, cells = editable stock number. Fast to update and easy to scan.
- Low-stock cells highlighted amber; zero stock red.
- Drag-and-drop image upload with reorder and alt-text field.

### 10.7 Supplier screens
- Supplier list with outstanding balance per supplier.
- Bill detail: total, paid, **outstanding (large)**, payment history, "Record payment" action.
- Status pills: Unpaid · Partially paid · Paid.

### 10.8 Invoice view
- A4 print-friendly layout: logo, invoice number and date, order number, customer block, items table, totals, payment status, footer note. Black and white friendly; no heavy backgrounds so it prints cleanly.

---

## 11. Accessibility Checklist

- [ ] Colour contrast meets WCAG AA (4.5:1 text, 3:1 UI).
- [ ] Visible focus ring on every interactive element (`--focus-ring`).
- [ ] All images have meaningful `alt` text; decorative images use empty alt.
- [ ] Tap targets at least 44×44px.
- [ ] Form fields have programmatic labels, error messages linked with `aria-describedby`.
- [ ] Size/colour selectors are real radio groups with keyboard support.
- [ ] Modals and drawers trap focus and close with Escape.
- [ ] Status never conveyed by colour alone.
- [ ] Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- [ ] Page works with 200% zoom and without horizontal scroll.
- [ ] Semantic landmarks (`header`, `nav`, `main`, `footer`) and one `h1` per page.

---

## 12. Arabic / RTL Readiness (Plan for Now, Build Later)

- Use **CSS logical properties** (`margin-inline-start`, `padding-inline`, `inset-inline-end`) instead of left/right from day one.
- Use Angular i18n or ngx-translate; no hard-coded strings in templates.
- Mirror layout, chevrons and progress bars in RTL; do **not** mirror logos, photos, or phone numbers.
- Test long Arabic strings in buttons and chips (allow wrapping and flexible width).
- Keep numerals consistent (Western digits recommended for prices; confirm with the business).

---

## 13. Performance Targets (Design-Related)

| Metric | Target |
|---|---|
| Largest Contentful Paint (mobile, 4G) | < 2.5s |
| Cumulative Layout Shift | < 0.1 |
| Interaction to Next Paint | < 200ms |
| Hero image | < 200KB (WebP/AVIF) |
| Product thumbnails | < 40KB each |
| Total fonts | 2 families, ≤ 4 weights, `font-display: swap`, subset |

---

## 14. What Makes This UI Unique

1. **Volt-on-ink accent system:** an instantly recognisable colour signature that stands out from the typical black-and-white fashion store.
2. **Drop-culture storytelling:** drop banners, countdowns, New Drop badges, marquee strips.
3. **Size-first product page:** big tap-friendly size buttons with live variant stock and a sticky Add to Cart bar.
4. **Trust built in:** COD, delivery time, exchange policy and WhatsApp contact are always one glance away, which matters for a brand new store with no reputation yet.
5. **One-page, 60-second checkout:** guest only, minimal fields, Qatar-specific phone and address UX.
6. **Admin that matches the brand:** the same design language, with a "next action only" order workflow built for founders handling orders on their phones.

---

## 15. Recommended Tooling & Implementation Notes

| Need | Suggestion |
|---|---|
| Component library | Angular Material (themed with tokens) **or** PrimeNG / Spartan UI; choose one and theme it fully so it does not look default |
| Styling | CSS custom properties + SCSS or Tailwind (pick one) |
| Icons | Lucide or Phosphor |
| Fonts | Google Fonts (Space Grotesk, Inter), self-hosted for performance |
| Image CDN | Cloudinary with auto format/quality |
| Design handoff | Figma file with tokens as variables; component library mirrors the Angular components |
| Prototyping | Build mobile screens first (390×844), then 768 and 1440 |
| Testing | Real-device tests on iPhone Safari and Android Chrome; Lighthouse + axe for accessibility |

### Suggested Angular structure

```
src/
  styles/
    tokens.css
    typography.css
    utilities.css
  app/
    shared/ui/
      button/  chip/  badge/  size-selector/  colour-selector/
      quantity-stepper/  product-card/  bottom-sheet/  toast/
    storefront/
      home/  collection/  product-detail/  cart/  checkout/  confirmation/
    admin/
      dashboard/  orders/  products/  inventory/  suppliers/  reports/
```

---

## 16. Design Deliverables Checklist

- [ ] Logo and brand mark finalised (light + dark versions)
- [ ] Figma file with colour, type and spacing tokens
- [ ] Component library (buttons, inputs, cards, sheets, toasts)
- [ ] Mobile screens: Home, Collection, Product, Cart, Checkout, Confirmation
- [ ] Desktop screens for the same
- [ ] Admin screens: Dashboard, Orders, Order detail, Products, Variant grid, Suppliers, Invoice
- [ ] Empty, loading, and error states for each screen
- [ ] Interactive prototype for the checkout flow
- [ ] Accessibility review against section 11
- [ ] Final QA on real devices

---

*Note: all colours, fonts and layouts are recommendations to be validated with the final brand identity and tested with real users before launch.*