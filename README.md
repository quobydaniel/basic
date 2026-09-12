# Sellio

Mobile-first, multi-store social-commerce + dropshipping PWA for Ghana. Independent
sellers get Shopify-level operational power without Shopify-level complexity. Built
with TanStack Start, React 19, Tailwind v4, Supabase, and NVIDIA NIM for the AI
features.

This is a rebuild of the project originally built in Lovable Cloud. The Lovable
export is treated as a spec; the original stack is preserved where it serves the
product and replaced where it tied us to Lovable's managed services.

See [`docs/superpowers/specs/2026-08-06-sellio-rebuild-design.md`](docs/superpowers/specs/2026-08-06-sellio-rebuild-design.md) for the full design and porting notes.

## Quick start

```bash
bun install                       # or: npm install
cp .env.example .env              # then fill in your Supabase + NVIDIA keys
bun run dev                       # http://localhost:3000
```

Other scripts:

```bash
bun run build                     # production build
bun run lint                      # eslint
bun run typecheck                  # tsc --noEmit
bun run format                    # prettier --write .
```

## Required environment variables

See [`.env.example`](.env.example). You need:

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Supabase project → Settings → API → Project API keys → `anon` `public` |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref (the slug in the URL) |
| `NVIDIA_API_KEY` | https://build.nvidia.com (free credits available) |
| `SUPABASE_SERVICE_ROLE_KEY` (optional) | Only if you write privileged server code; the AI fns don't need it |

## Database setup

The 8 migrations in `supabase/migrations/` are the source of truth for the schema,
RLS, GRANTs, triggers, and seed data. Push them to your Supabase project from the
project root:

```bash
# Install the Supabase CLI first: https://supabase.com/docs/guides/cli
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

After the schema is in place, regenerate the TypeScript types the routes import:

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

(If you don't have the CLI handy, the committed `src/integrations/supabase/types.ts`
already matches the 8 migrations — re-run the `gen types` command above if you add
more migrations later.)

## Stack

- **Framework**: TanStack Start v1 (React 19, Vite 8, TanStack Router, TanStack Query)
- **Styling**: Tailwind CSS v4, shadcn/ui new-york primitives, Midnight Plum design tokens
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime, RLS)
- **AI**: NVIDIA NIM API (`https://integrate.api.nvidia.com/v1`) — one model per server function, see `src/lib/models.server.ts`
- **Charts**: Recharts
- **Fonts**: Lora (display) + Nunito Sans (UI) via `@fontsource`

## What's done and what's stubbed

Faithful to the original Lovable export:

- ✅ Public marketplace: home, discover, storefront, product detail, multi-store cart
- ✅ Buyer: account, orders, chat (realtime), sign-in/sign-up
- ✅ Seller: dashboard, products CRUD, orders, deliveries, affiliate catalog, AI Studio, channels, storefront editor, settings
- ✅ Rider: onboarding, available deliveries, active deliveries, earnings, profile
- ✅ AI: floating assistant, chat reply drafts, marketing post generator, listing-from-photos (wired through NVIDIA NIM)
- 🚧 Checkout: cart shows a "coming soon" toast — payment + order placement is the next planned phase (schema already in place)
- 🚧 Dropshipping: external supplier import / supplier fulfilment — planned, not built
- 🚧 Real social OAuth (Meta, TikTok, WhatsApp): show a "disconnected" state, no live connection
- 🚧 Real Paystack money movement

## License

Proprietary.
