# Sellio — Full Rebuild Design

**Date:** 2026-08-06
**Spec author:** ported from a Lovable Cloud export dated 2026-08-05.
**Status:** Approved; implementation in progress.

## Origin

Sellio was built in Lovable Cloud as a mobile-first, multi-store social-commerce and
dropshipping PWA for Ghana. The source was exported as a single text blob with all
files concatenated under `FILE:` headers. This rebuild moves it to a self-managed
repo at `~/Projects/Web Development/sellio/`, swaps the Lovable-specific pieces for
open alternatives, and treats the original as a spec rather than a frozen artefact
(architecture may improve during the port).

## Locked decisions

| Concern | Decision |
|---|---|
| Backend / DB / auth / storage | Supabase.com free project — same 8 migrations + RLS policies; no Docker |
| AI provider | NVIDIA NIM API at `https://integrate.api.nvidia.com/v1`, OpenAI-compatible |
| AI models | One model id per server function (see `models.server.ts`) — fast models for chat drafts, reasoning models for marketing copy, a vision model for listing-from-photo |
| Scope | Full rebuild + redesign. Export is the spec; architecture improves as we go |
| Visuals this build | Skeleton-first — functional, minimal styling. Real polish in a later vision-model session |
| Secrets | `.env.example` + README; user pastes their own keys |
| Repo location | `~/Projects/Web Development/sellio/` (per `~/AGENTS.md`) |
| Git strategy | Per-phase commits with `feat:` / `chore:` prefixes |

## What's changing off Lovable Cloud

1. **`vite.config.ts`** — original wrapped everything in `@lovable.dev/vite-tanstack-config`'s meta-config. Replace with an explicit plugin chain: `@tanstack/react-start/plugin`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-tsconfig-paths`, and `nitro` (build-only, `node-server` preset for dev/null for prod).
2. **`package.json`** — drop `@lovable.dev/cloud-auth-js`, `@lovable.dev/vite-tanstack-config`, `@lovable.dev/mcp-js`, and the four `@lovable.dev/*` `bunfig.toml` `minimumReleaseAgeExcludes`. Keep everything else (React 19, TanStack Start, Tailwind v4, `ai` + `@ai-sdk/openai-compatible`).
3. **`src/integrations/lovable/index.ts`** — original wrapped `@lovable.dev/cloud-auth-js` for Google/Apple OAuth. Replace with Supabase direct `supabase.auth.signInWithOAuth()` (Google provider configured on the Supabase project). Same external API shape so `auth.tsx` barely changes.
4. **`src/lib/ai-gateway.server.ts`** — new provider factory pointing at NVIDIA NIM with the `NVIDIA_API_KEY` Bearer header (drop the `X-Lovable-AIG-SDK` header).
5. **`src/lib/models.server.ts`** (NEW) — a per-function model registry: each of the five AI server fns declares the model id it wants; out-of-scope `computeStoreInsights` stays a server-side heuristic with no model. You can swap any model id by editing one constant.
6. **`src/lib/lovable-error-reporting.ts`** — original forwarded errors to Lovable's in-browser `window.__lovableEvents`. Replace with a console-only no-op logger that keeps the `reportLovableError` name so a real tracker (Sentry) can drop in later.

## What's NOT changing

- The 8 SQL migrations (verbatim).
- All RLS policies, GRANTs, triggers, seed data.
- The auth middleware pair: `attachSupabaseAuth` (client) ↔ `requireSupabaseAuth` (server).
- All 28 route files and their loaders/queries/realtime subscriptions.
- `cart-store.ts` (localStorage `sellio.cart.v1`).
- The Midnight Plum design tokens in `styles.css`.
- All 41 shadcn new-york primitives in `src/components/ui/*`.

## Repo layout

```
sellio/
├── docs/superpowers/specs/2026-08-06-sellio-rebuild-design.md   (this file)
├── supabase/migrations/
│   └── 8 migrations copied verbatim with slug-suffix names
├── public/  (favicon.ico, manifest.webmanifest, robots.txt)
├── src/
│   ├── components/
│   │   ├── ui/                (41 shadcn primitives)
│   │   ├── AppShell.tsx
│   │   └── FloatingAIAssistant.tsx
│   ├── hooks/use-mobile.tsx
│   ├── integrations/
│   │   ├── lovable/index.ts
│   │   └── supabase/
│   │       ├── auth-attacher.ts
│   │       ├── auth-middleware.ts   (requireSupabaseAuth)
│   │       ├── client.ts
│   │       ├── client.server.ts
│   │       └── types.ts
│   ├── lib/
│   │   ├── ai-gateway.server.ts   (NVIDIA NIM)
│   │   ├── ai.functions.ts        (5 server fns)
│   │   ├── models.server.ts       (per-function model registry)
│   │   ├── cart-store.ts, chat.ts, format.ts, session.ts, utils.ts
│   │   ├── error-capture.ts, error-page.ts, lovable-error-reporting.ts
│   ├── routes/   (28 files: __root, public, _authenticated/*, rider.*, s.$storeSlug*)
│   ├── router.tsx, start.ts, server.ts, styles.css
├── .env.example, README.md, AGENTS.md
├── package.json, tsconfig.json, vite.config.ts
├── components.json, eslint.config.js, .prettierrc, .prettierignore, .gitignore, bunfig.toml
```

## Auth boundary (the bit most likely to break in the port)

```
Browser session (localStorage, persisted by client.ts)
   │  attachSupabaseAuth (functionMiddleware in start.ts)
   ▼
Server fn RPC carries: Authorization: Bearer <supabase access_token>
   │  requireSupabaseAuth (.middleware([requireSupabaseAuth]) on the 5 AI fns)
   ▼  builds an ephemeral, no-persistence Supabase client with anon key + user JWT
   │  validates via supabase.auth.getClaims(token)
   ▼
Handler gets context.supabase (RLS-scoped) + context.userId (claims.sub)
```

- The dashboard subtree is gated by `_authenticated/route.tsx`'s `beforeLoad` (`supabase.auth.getUser()` → redirect to `/auth?mode=shop`). `ssr:false` because Supabase session lives in localStorage.
- Public routes have no route-level gate; queries filter by `auth.uid()` and rely on RLS.
- `rider.*`'s gate is per-page (`if (!user)`), not via a pathless layout.

## Phased implementation

**Phase 0 — Scaffold**
Create folder, init git, write this spec, project `AGENTS.md`, `README.md`, `.env.example`,
all config files (`bunfig.toml`, `.prettierrc`, `.prettierignore`, `.gitignore`,
`eslint.config.js`, `tsconfig.json`, `components.json`, `vite.config.ts`,
`package.json`). Stage + first commit. `bun install`.

**Phase 1 — Foundation**
8 migrations copied verbatim. `integrations/supabase/*` ported verbatim.
`lib/*` ported (with `lovable-error-reporting` gutted to console). `start.ts`,
`server.ts`, `router.tsx`, `styles.css`, hooks, `__root.tsx`, `_authenticated/route.tsx`,
all 41 `ui/*` primitives. Verify `bun run build` + `bun run dev` boot clean.

**Phase 2 — Server functions + AI**
`ai-gateway.server.ts` → NVIDIA NIM. `models.server.ts` (new registry). All 5
`ai.functions.ts` fns ported; each reads its model id from the registry. `computeStoreInsights`
stays heuristic. `FloatingAIAssistant.tsx` + `integrations/lovable/index.ts`
(rewired to `supabase.auth.signInWithOAuth`).

**Phase 3 — Public routes (skeleton UI)**
`index`, `discover`, `cart`, `auth`, `account`, `orders`, `chat`, `chat.$conversationId`,
`s.$storeSlug*` (3 files), `AppShell`. Loaders/queries/realtime survive intact.
Styling is functional, not polished. Each route keeps loading / empty / error states.

**Phase 4 — Rider routes**
`rider.tsx` + `rider.index`, `rider.active`, `rider.earnings`, `rider.profile`.
Auth stays per-page; realtime channels intact.

**Phase 5 — Seller dashboard**
`_authenticated/dashboard.tsx` layout + 10 children.
**Architecture improvement:** the two routes that did raw `fetch` to
`ai.gateway.lovable.dev` (`dashboard.ai.tsx` quick-writers + `dashboard.products.tsx`
"Write with AI") get re-wired through proper server fns — no AI key ever ships to
the browser, auth goes through `requireSupabaseAuth`.

**Phase 6 — Verify + checkpoints**
After each phase: `bun run lint`, `bun run build`, fix, commit. End-to-end smoke
test once the user provides live Supabase keys + NVIDIA key.

## Out of scope (same as the Lovable export)

- Checkout / cart persistence / supplier dropship (Phase 3 of `MASTER_BUILD_PROMPT.md`).
  The schema already has `carts`, `cart_items`, `orders`, `payments`, `discounts`,
  `shipping_*`, `abandoned_carts` empty and ready.
- Real Meta/TikTok/WhatsApp OAuth (stays as "disconnected/setup" state).
- Real Paystack / live money.
- App-store native wrapper.

## Verification bar

- `bun install` resolves clean.
- `bun run build` succeeds with no TS errors.
- `bun run dev` boots and serves `/`, `/discover`, `/auth` without a runtime crash,
  even with no env vars (original code throws friendly "missing env" errors; we keep that).
- With real envs in `.env`: buyer signs up, sees seeded stores + 8 products, adds to
  cart, hits `/account`. Seller signs in, hits `/dashboard`, creates a store, hits
  the floating AI assistant.
- Every ported route typechecks against `types.ts`.
- Git log shows clean per-phase commits.

## What I'll ask the user for during implementation

- Before Phase 6: paste Supabase project `URL`, `anon/publishable key`, `project id`,
  and `NVIDIA_API_KEY`. Without these I stop at "boots with friendly missing-env errors".
- Vision-model pass (later session): switch to vision and redesign the UI surface on
  top of these working skeletons.
