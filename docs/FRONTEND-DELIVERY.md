# BASIC — Frontend Delivery Report

**Date:** 2026-11-28 · **Session:** BASIC PEARL frontend master prompt
**Scope:** complete frontend per the BASIC master prompt, built on the existing
BASIC repo (TanStack Start + React 19 + Tailwind v4 + Supabase) with the
backend untouched.

---

## 1. What shipped in this pass

### BASIC PEARL design system (`src/styles.css`)
- **Light default** — the master-prompt palette: pearl `#FAF9F6`, warm ivory
  `#F5F2EC`, soft-white cards, charcoal ink `#242321`, secondary `#77736D`,
  hairline `#EAE6DE`, champagne gold `#C6A66B` (text-safe bronze `#8A6A2B` on
  light surfaces), light champagne `#E9D9B7`, plus restrained
  success/warning/error tokens.
- **Dark optional** — the existing after-dark "Palm & Gold" house preserved
  under `.dark` (previously the default; inverted cleanly with the pre-paint
  script + ThemeToggle). Token *names* are identical across modes — components
  never branch on theme.
- Theme-adaptive header glass (`--glass-*` vars), PEARL brand tokens
  (`--pearl-*`), `pearl-card`/`pearl-input` utilities, theme-color meta sync,
  mobile browser chrome follows the toggle.

### Navigation (approved architecture)
- **Mobile:** HOME | DISCOVER | **AI** | CHAT | PROFILE — the AI concierge in
  the elevated central orb (opens the one unified assistant via
  `basic:assistant:open`), safe-area aware, unread badges intact.
- **Desktop:** AURUM header — brand row, nav capsule with Discover mega-menu
  (real categories + trending products), search, favorites, **cart button with
  live badge**, theme toggle, notifications, account menu, and a contextual AI
  entry.
- Seller dashboard sidebar + mobile bar now expose every workspace incl.
  Autopilot, AI Studio, Affiliate, Deliveries (scrollable mobile bar).

### Buyer experience
- **Cart** (`/cart` + `src/lib/cart.ts`): client-side store (localStorage,
  cross-tab sync), grouped by store, qty steppers, honest "orders are created
  per item" note. Negotiable listings stay chat-only by design.
- **Checkout** (`/checkout`): 4 steps — Address → Delivery → Payment → Review —
  then places each line through the **authoritative `place_order` RPC**
  (server-priced, floor-checked, stock-locked, idempotent). Per-line results:
  failures (e.g. sold out) never touch the other lines.
- **Product page:** Add to cart beside the chat-first purchase path (variant +
  stock + negotiable aware), recently-viewed recording.
- **Homepage:** stories rail, special offers (real `compare_at_price` data),
  shorts rail, recommended, recently viewed, just-arrived feed, seller CTA,
  desktop footer.
- **Buyer hub** (`/account`): cart tile added; role-aware modes intact.

### Social commerce
- Stories: gold-ring rails on home + storefront deep links into the existing
  full-screen viewer (no separate tab, WhatsApp-style rings).
- Shorts: home discovery rail (hover-to-play on desktop, tap-through to
  product), storefront showreel, seller studio.

### Seller workspace + AI Autopilot
- **`/dashboard/autopilot`** (new ops desk): store-wide master switch
  (`stores.auto_pilot`), AI identity summary, real AI activity feed
  (`messages.metadata->>ai`), per-chat pause controls
  (`conversations.ai_enabled`), live stock alerts (variants ≤ 5), pending-order
  counter, and the seller-to-AI WhatsApp concept as an explicitly-labelled
  design-only card (integration is not live — nothing claims otherwise).
- AI Studio (marketing) + chat proposal confirmation untouched (backend
  contract honored).

### Affiliate
- Workspace upgraded: overview stats, "My partner picks" management (share/
  remove), open catalog with per-product commission, and an honest
  "how earnings work" card (no invented earnings/payouts).
- **Storefront "Partner picks"** section (new): re-listings finally render on
  the affiliate's storefront, always crediting the source seller and linking
  to the original product page.

### Service abstraction layer (`src/services/`)
- `types.ts` — domain interfaces; `orders.ts` — the single ordering doorway
  with typed `OrderPlacementError` classification; `README.md` — the pattern
  rules + backend contract map. Checkout consumes the service; future
  surfaces follow it.

### Audited, already complete (no changes needed)
- Rider app (onboarding, availability, open-requests feed with realtime,
  active/earnings/profile) — mobile-first, no invented GPS.
- Admin console (`/quoby`, role-gated client-side + server-fn re-verification):
  overview, users, stores, products, AI models.
- Auth: sign-in/up, forgot-password, recovery-link reset, Google OAuth,
  shop/sell modes.

---

## 2. Route inventory (45 routes)

| Area | Routes |
|---|---|
| Buyer | `/` · `/discover` · `/stores` · `/store` · `/s/$storeSlug` (·index) · `/s/$storeSlug/p/$productSlug` · `/cart` *new* · `/checkout` *new* · `/favorites` · `/orders` · `/account` · `/pricing` |
| Chat | `/chat` (inbox) · `/chat/$conversationId` |
| Seller | `/dashboard` (onboarding/home) · products · orders · chats(+thread) · **autopilot** *new* · ai (studio) · stories · shorts · storefront · **affiliate** · deliveries · settings · `/sell/chat` (+thread) |
| Rider | `/rider` (onboarding/home) · active · earnings · profile |
| Admin | `/quoby` (overview) · users · stores · products · ai |
| Auth | `/auth` (sign-in/up/forgot/reset) |

## 3. Feature inventory (master prompt §25 mapping)

1. Frontend source — the repo (`src/`).
2. All page routes — §2 above.
3. Reusable components — `src/components/` (AppShell, PearlHeader, Stories,
   HomeRails, ProductGallery, StoreChrome, chat components, skeletons/empty
   states inline per surface).
4. Design system — `src/styles.css` (BASIC PEARL tokens, both modes).
5–6. Responsive desktop + mobile layouts — every surface; mobile decisions are
   intentional (5-item nav, sticky buy bar, scroll rails).
7. Visual assets — product/store imagery from Supabase Storage; no broken
   URLs (fallbacks where media is missing).
8. Service abstraction — `src/services/`.
9. TypeScript interfaces — `src/services/types.ts` + generated types.
10. Backend integration documentation — `BACKEND-CONTRACT.md` (pre-existing,
    authoritative) + `src/services/README.md` (frontend-side map).
11. Route inventory — §2.
12. Feature inventory — §3.
13. Setup instructions — §4.
14. Env template — `.env.example` (no real credentials).
15. Incomplete backend integrations — §5.
16. Known limitations — §6.

## 4. Setup

```bash
bun install          # or: npm install
cp .env.example .env # fill in VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (+ NVIDIA keys for AI server fns)
bun run dev          # http://localhost:3000
bun run typecheck    # tsc --noEmit
bun run build        # production build
```

Apply `supabase/apply-pending-2026-11-21-order-hardening.sql` to the linked
project (place_order + stock guard) if not yet applied — checkout depends on
it. All other migrations are already the source of truth.

## 5. Incomplete backend integrations (frontend is honest about these)

| Area | State |
|---|---|
| Affiliate attribution | `affiliate_listings` renders as Partner picks; click tracking, conversion attribution, automated payouts — **no backend tables**; UI shows no earnings figures. |
| Seller-to-AI WhatsApp | Design/config surface only (`/dashboard/autopilot`); provider integration **not verified**; card says so. |
| Saved addresses | `localStorage` client-side until an addresses table exists. |
| Cart persistence | Client-side by design; the transaction of record is `place_order`. |
| Delivery pricing | No delivery-fee backend; checkout records delivery intent text, sellers settle terms (platform norm). |
| Review counts | Card ratings are deterministic prototypes until real `reviews` volume accumulates (marked in code). |
| Payments | No gateway integration invented; payment *terms* flow through place_order. Paystack keys configured in seller Settings for existing flows. |

## 6. Known limitations

- `no-explicit-any` lint debt on boundary casts is **intentional** —
  `BACKEND-CONTRACT.md §8` documents it until a `supabase gen types` regen
  with live credentials (never hand-edit cast sites).
- Premium 3D storefront avatar (§14 of the master prompt): the existing
  StoreCharacter (animated SVG shopkeeper, Pro storefronts) covers the
  engagement role with far better performance than a 3D asset on Ghana
  mobile networks; reduced-motion supported. A 3D tier was **not** added —
  flagging as an open product decision, not silently skipped.
- Role-aware UI everywhere, but authorization stays backend-side (RLS +
  server fns re-verify) — hiding admin UI is never treated as security.
- AI concierge latency UX (20–90s NIM) is contract-pinned in
  `BACKEND-CONTRACT.md §7` — the bubble/polling behavior was preserved, not
  redesigned.

## 7. Verification

- `tsc --noEmit` — clean.
- `vite build` (dev + production) — clean.
- Backend files (`supabase/*`, `src/lib/ai.functions.ts`, `models.server.ts`,
  `src/integrations/supabase/*`) — **untouched** by this session (git history
  shows the backend session's WIP preserved verbatim in the checkpoint commit
  `657da78`).
- Commits: `b9fc683` (PEARL + navigation), `06cc7a0` (cart/checkout/buyer),
  and the seller/affiliate/services pass following.
