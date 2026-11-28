# BASIC BUILD PLAN — Enhanced Execution Brief

> The executable version of `docs/FRONTEND-MASTER-SPEC.md`. The master spec says WHAT;
> this file says HOW, grounded in the actual repo (recon verified 2026-11-28 03:56).
> Read master spec PART 2 (no cart) + PART 3 (Pearl) + BACKEND-CONTRACT.md + repo
> AGENTS.md first. This plan never contradicts them — it operationalizes them.

---

## 0. GROUND TRUTH (what actually exists)

**Stack:** React 19.2 · TanStack Start v1 + Router 1.170 · Vite 8 · Tailwind v4
(CSS-first, `@theme inline` in `src/styles.css`) · shadcn new-york (`components.json`,
40 primitives in `components/ui/`) · Supabase JS 2.110 · TanStack Query v5 ·
lucide-react only icon lib · Bun runner · `bun run build && bun run lint && bun run
typecheck` must exit 0 before any commit.

**BASIC PEARL is DONE at token level** (`src/styles.css`, commit b9fc683): pearl
`#FAF9F6` paper, ivory `#F5F2EC`, charcoal `#242321`, `--gold #8A6A2B` (AA text) +
`--gild #C6A66B` (metal fills), muted `#77736D`, hairline `#EAE6DE`, status trio,
`.pearl-card/.pearl-input/.pearl-glass/.aurum-*` classes, Cormorant Garamond display +
Nunito Sans body, dark "Palm & Gold" house. **Do not redesign tokens — apply them.**
The pre-Pearl surfaces are: all five `quoby.*` admin pages (raw emerald badges,
generic chrome) and the rider shell.

**Quality map (code-verified):** dense + polished: home, discover, stores, storefront,
product detail, buyer orders, chat thread (app centerpiece), seller dashboard suite,
auth, account, pricing, rider home. Light-but-real: favorites, rider earnings/profile,
dashboard deliveries, channels (static). Spartan/pre-Pearl: `quoby.*` (5 pages).

**State:** TanStack Query v5 (contract keys `["msgs", id]`, `["conversations", …]`),
`useSyncExternalStore` for local stores, `useSession()` (45s presence heartbeat),
guards: `_authenticated/route.tsx` beforeLoad, `/rider`, `/quoby` (poll +
`user_roles`). Services seed: `src/services/` ("one doorway per domain", `placeOrder()`
wrapper around `place_order` RPC).

## 1. ACTIVE COORDINATION — parallel session (do-not-touch list)

A second session is concurrently executing the no-cart refactor in this working tree.
**Frontend-design session (that one) currently owns — DO NOT EDIT until it commits:**
`src/lib/cart.ts` · `src/routes/cart.tsx` · `src/routes/checkout.tsx` ·
`src/components/PearlHeader.tsx` · `src/components/AppShell.tsx` ·
`src/components/HomeRails.tsx` · `src/routes/index.tsx` ·
`src/routes/s.$storeSlug.p.$productSlug.tsx` · `src/routes/s.$storeSlug.index.tsx` ·
`src/routes/account.tsx` · `src/routes/_authenticated/dashboard.tsx` ·
`src/routes/_authenticated/dashboard.affiliate.tsx` ·
`src/routes/_authenticated/dashboard.autopilot.tsx` · `src/services/*`

Rule: `git add` only the files you changed (never `git add .` / `git commit -a`),
and never commit while another session's WIP is in tree. Re-check `git status`
before each commit. File ownership per BACKEND-CONTRACT §8 stands (backend files
untouchable).

## 2. CART EXCISION — verification checklist (in flight, parallel session)

When the parallel session lands, verify all of (master spec PART 2 acceptance):

- [ ] `src/lib/cart.ts` deleted; localStorage `basic:cart:v1` key ignored/cleared once
- [ ] `/cart` route file deleted (after `paymentLabel()` moved to a shared lib), routeTree regenerated
- [ ] `/checkout` replaced by direct order flow (per-line `place_order` via `src/services/orders.ts` — server-priced, stock-locked, idempotent; server confirmation step preserved)
- [ ] No `useCart`/`addToCart`/CartButton refs anywhere (`grep -rn "cart" src/` clean except innocent matches listed in recon §5)
- [ ] No `ShoppingCart` icons used for orders (swap to `Package`) — orders icon is fine, cart icon is not
- [ ] `src/services/types.ts` loses `CartItem`; `src/services/README.md` no longer documents a cart
- [ ] Bottom nav stays HOME|DISCOVER|AI|CHAT|PROFILE — no cart destination
- [ ] Buyer orders/order-details/delivery-tracking pages exist (order history ≠ cart)

## 3. ROUTE INVENTORY → TARGET STATE

Legend: ✅ keep+polish · 🔧 rework · ➕ new route · 🗑 delete. "Blocked" = no backend
contract yet (document, isolate service interface, never fake).

| Path | Spec page | Target | Notes |
|---|---|---|---|
| `/` | 3 Home | ✅ | 9 spec sections already present; polish only |
| `/discover` | 4+5 Discover+Category | 🔧 | add `?category=` subcategory banner view per spec p.5 |
| `/stores` | (store discovery) | ✅ | — |
| `/s/$storeSlug` | 8 Storefront | ✅ | PartnerPicks WIP lands from parallel session |
| `/s/$storeSlug/p/$productSlug` | 6 Product | 🔧 | parallel session: add-to-cart → BUY NOW/ORDER NOW + AI context |
| `/chat`, `/chat/$id` | 21+22 Buyer chat | ✅ | contract-sensitive (BACKEND-CONTRACT §2) |
| `/orders` | 16 My Orders | ✅ | — |
| `/orders/$orderId` | 17 Order Details | ➕ | timeline + status history (`order_events` exists) |
| `/orders/$orderId/tracking` | 18 Delivery Tracking | ➕ | `delivery_requests`/`delivery_events`; no fake GPS, no invented ETA |
| `/favorites` | 19 Favourites | ✅ | — |
| `/following` | 20 Followed Stores | ➕ | `store_followers` table exists |
| `/notifications` | 23 Notifications | ➕ | `notifications` table + payload contract §5 |
| `/account` | 14+15 Buyer Overview/Profile | ✅ | remove Cart tile (parallel session) |
| `/account/addresses` | 24 Saved Addresses | ⛔ BLOCKED | no addresses table — document in integration register |
| `/account/settings` | 25 Account Settings | ➕ | thin: profile fields, password, notification prefs, sessions |
| `/auth` | 81 Sign In | ✅ | — |
| `/auth` (signup/role) | 82+85 | 🔧 | role selection + buyer onboarding context |
| `/auth/recover` | 83 Recovery | ➕ | Supabase reset flow |
| `/auth/verify` | 84 Verification | ➕ | actual Supabase email verify only |
| `/sell/onboarding` | 86 Seller Onboarding | ➕ | existing seller fields only |
| `/pricing` | (plans) | ✅ | — |
| `/cart` | — | 🗑 | parallel session |
| `/checkout` | 7 Direct Order | 🔧 | parallel session: becomes per-product direct order |
| `/dashboard` shell | 26 shell | ✅ | 12-item nav WIP lands |
| `/dashboard` index | 26 Overview | ✅ | — |
| `/dashboard/products` (+create/edit) | 27–29 | ✅ | full CRUD already |
| `/dashboard/inventory` | 30 Inventory | ➕ | stock views from `products`; low/out-of-stock filters |
| `/dashboard/orders` | 31+32 | ✅ | + order details drawer w/ `order_events` timeline |
| `/dashboard/chats`, `/dashboard/chats/$id` | 33+34 Inbox | ✅ | AI/Human control indicator exists via contract §4 |
| `/dashboard/autopilot` | 35–39 | ✅ | new page from parallel session (overview/conversations/settings) — add Activity Log + Pending Approvals tabs using `ai_generations`/engine events if table-backed, else document |
| `/dashboard/channels` | 40 WhatsApp AI Connection | 🔧 | connected state ONLY when real provider link exists; static list stays honest |
| `/dashboard/stories` | 41 | ✅ | profile-ring representation, no Stories tab |
| `/dashboard/shorts` + publish | 42+43 | ✅ | — |
| `/dashboard/storefront` | 44 Storefront Editor | ✅ | + live preview pane |
| `/dashboard/analytics` | 45 Store Performance | ➕ | `computeStoreInsights` + real queries only |
| `/dashboard/settings` | 47 | ✅ | + notification prefs entry |
| `/dashboard/affiliate` | 48–55 Affiliate | 🔧➕ | split into overview / discover / links / campaigns / analytics / earnings — only where `affiliate_listings` + real data reach; earnings = ⛔ until payout backend exists |
| `/rider` shell | 56 shell | 🔧 | Pearl-ify, large controls |
| `/rider` index | 56+57 | ✅🔧 | availability control present; make status explicit |
| `/rider/active` | 59 | 🔧 | + delivery details sheet (58/60 data) |
| `/rider/assignment/$id` | 58+60 | ➕ | pickup/drop-off/instructions from `delivery_requests` |
| `/rider/confirm/$id` | 61 Confirmation | ➕ | ONLY actual backend mechanism (`confirm_order_delivery`) — no invented OTP/signature/photo |
| `/rider/history` | 62 | ➕ | completed/cancelled from `delivery_requests` |
| `/rider/earnings` | 63 | ✅🔧 | real records only |
| `/rider/profile` | 64 | ✅🔧 | no invented verification approval |
| `/quoby` shell+index | 65 | 🔧 | Pearl admin shell (sidebar, tokens) + overview cards |
| `/quoby/users` | 66+67 | 🔧➕ | user detail drawer (roles, history, actions) |
| `/quoby/stores` | 68+69 | 🔧➕ | seller detail drawer (storefront preview link, catalogue count) |
| `/quoby/riders` | 70 | ➕ | `riders` table directory |
| `/quoby/affiliates` | 71 | ➕ | from `affiliate_listings`/profiles, real activity only |
| `/quoby/products` | 72 | ✅🔧 | moderation actions = existing archive/activate only |
| `/quoby/orders` | 74 | ➕ | order oversight list (admin fns if exists, else RLS-safe read + document) |
| `/quoby/transactions` | 75 | ⛔ BLOCKED | no payments/settlement backend — document |
| `/quoby/reports` | 76+77 | ⛔ BLOCKED | no reports/disputes tables — document |
| `/quoby/analytics` | 78 | ➕ | growth/orders from real counts via adminGetStats extensions |
| `/quoby/ai` | 79 | ✅🔧 | model config editor exists; add usage/error view from `ai_usage` |
| `/quoby/settings` | 80 | ➕ | only existing supported controls |

## 4. STAGE EXECUTION ORDER (adapted from spec PART 22)

Parallel-session-aware sequencing — clean areas first:

1. **Stage A (this session): Admin console** — Pearl shell + overview + users/stores detail drawers + riders/affiliates/orders/analytics/ai-usage pages (blocked pages get honest "no backend contract" states). *Biggest clean gap; zero overlap.*
2. **Stage B (this session): Rider workspace Pearl rebuild** + missing routes (assignment detail, confirmation, history).
3. **Stage C (this session, after parallel session commits): buyer gaps** — order details, tracking, notifications, followed stores, settings; verify cart excision checklist §2.
4. **Stage D: affiliate workspace split** (after parallel session's affiliate WIP lands).
5. **Stage E: seller additions** — inventory page, analytics page, channels honesty pass.
6. **Stage F: auth/onboarding completion** (recover, verify, role onboarding).
7. **Stage G: responsive + polish sweep, integration docs, acceptance run.**

Each stage = one commit scope (repo AGENTS.md convention), build+lint+typecheck green
before commit, contract tests (`src/lib/__tests__/backend-contract.test.ts`) stay green.

## 5. HARD RULES (condensed, non-negotiable)

1. No cart anything — see §2 checklist.
2. Backend files untouchable: `ai-gateway.server.ts`, `autopilot.server.ts`,
   `ai.functions.ts`, `models.server.ts`, `admin.functions.ts`, `supabase/*`,
   migrations. AI keys never in client code; all AI via server fns.
3. Never invent backend functionality: no fake stats, no fake payouts, no fake GPS
   tracking, no fake verification success, no invented addresses/payouts/disputes.
   Unsupported = polished empty state + integration register entry.
4. Order creation is server-side only (`place_order` / proposal-confirm flow);
   seller confirmation on proposal cards is mandatory.
5. Query keys + realtime invalidation contracts preserved (`["msgs", id]`,
   `["conversations", …]`, typing-bubble lifecycle, throttle errors are intentional).
6. `routeTree.gen.ts` never hand-edited; `types.ts` never hand-edited.
7. One unified buyer AI concierge (`buyerAssistant`) — storefront orbs/avatars/context
   all open the same surface via `basic:assistant:open`.
8. Mobile five-item nav (AI center), safe-area padding, no content under nav.
9. Pearl tokens only — no raw emerald/blue badge classes in any rebuilt page.
10. Reduced-motion respected; skeleton loading; honest empty states everywhere.

## 6. INTEGRATION REGISTER (backend gaps to document, not fake)

`addresses` (p.24) · affiliate click-tracking/payouts (p.53-54) · admin transactions/
reports/disputes (p.75-77) · autopilot activity-log persistence + pending-approvals
queue (p.37/39) if not table-backed · WhatsApp provider link (p.40) beyond static
`channels` · short comments (p.12) if no table · admin order-oversight fns beyond
RLS reads (p.74). Each entry: what the page shows instead + what contract is needed.

## 7. ACCEPTANCE GATES (final command compliance)

`bun run build && bun run lint && bun run typecheck && bun run test` all exit 0 →
`grep -rniE "add.?to.?cart|shopping.?cart" src/` returns zero product-surface hits →
route inventory in §3 has no 🗑 left and every ➕ implemented or BLOCKED-documented →
contract tests green → both experiences (desktop + mobile) walked per workspace →
integration register + known limitations written → ZIP deliverable assembled.
