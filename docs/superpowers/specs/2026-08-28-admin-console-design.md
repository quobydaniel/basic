# Sellio — Super Admin Console (`/admin`) Design

**Date:** 2026-08-28
**Status:** Approved (Approach A — server-fn guarded console)
**Owner decisions locked:** all four scope areas + plan switching; plans = flag now / billing later; moderation = moderate-after (no approval gate); architecture = server fns + Zod + RLS-as-second-net.

---

## Goal

Give the owner a super-admin console at `/admin` to manage the whole platform: users & roles, store/product moderation, AI model configuration, platform stats, and per-store plan flags (free/pro). Non-admins see nothing; every action re-verifies admin rights server-side.

## Locked scope

| Area | Behavior |
|---|---|
| Users & roles | Browse all users (name, email, roles, joined); add/remove roles (`admin`, `staff`, `rider`, `seller`, `buyer`) |
| Store moderation | Set any store's status: `active` / `paused` / `suspended`. Suspended stores disappear from marketplace + storefront shows "store unavailable" |
| Product moderation | Archive / activate any product |
| Plan flags | Flip any store `free` ↔ `pro`. No payment processing this round |
| AI models manager | Per-function model IDs stored in DB, editable in /admin, effective on next AI call. File registry (`models.server.ts`) remains fallback |
| Platform stats | Users, stores, products, orders, GMV, recent signups, recent orders |

## Explicitly out of scope (this round)

- Approval **gate** on store/product creation (moderate-after was chosen)
- Impersonation, audit logs, feature flags, email blasts
- Real Paystack billing / auto-renewal

---

## 1. Database migration — `supabase/migrations/20260828120000_admin_console.sql`

```sql
-- 1. Store plans
CREATE TYPE public.store_plan AS ENUM ('free', 'pro');
ALTER TABLE public.stores
  ADD COLUMN plan public.store_plan NOT NULL DEFAULT 'free';

-- 2. AI model configuration (runtime-editable registry)
CREATE TABLE public.ai_model_config (
  fn_name    text PRIMARY KEY CHECK (fn_name IN (
    'generateListingFromPhotos','draftChatReplies',
    'generateMarketingPost','computeStoreInsights','assistantChat')),
  model_id   text NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_model_config_select" ON public.ai_model_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_model_config_write" ON public.ai_model_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Admin RLS on existing tables (second net under server fns)
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "stores_admin_update" ON public.stores
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_admin_update" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Email visibility for admin (emails live in auth.users, outside RLS reach)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (user_id uuid, email text, full_name text, roles text[], created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden — admin only';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email, p.full_name,
    COALESCE((SELECT array_agg(r.role) FROM public.user_roles r WHERE r.user_id = u.id), '{}'),
    u.created_at
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
```

Notes:
- `admin_list_users()` is SECURITY DEFINER (reaches into `auth.users`), so the admin check lives **inside** the function body — an authenticated non-admin calling it gets an exception.
- Existing demo stores + Quobu Tech get `plan='free'` by default; no data backfill needed.
- Admin promotion is a one-off SQL the owner pastes (not part of the migration):

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'quobyvidan@gmail.com'
ON CONFLICT DO NOTHING;
```

## 2. Security model

1. **`requireAdmin` middleware** (`src/integrations/supabase/admin-middleware.ts`): composes `requireSupabaseAuth`, then queries the caller's own `user_roles` rows via `context.supabase` (RLS lets users read their own roles) and throws `Error("Forbidden — admin only")` unless `'admin'` present.
2. **Every admin server fn** declares `.middleware([requireAdmin])` + a Zod validator. No exceptions.
3. **Client route guard** (`admin.tsx` layout `beforeLoad`): redirects non-admins to `/`. Convenience only — never trusted.
4. **RLS admin policies** are the second net: even a hypothetical fn bug can't write outside admin policy.
5. `ai_model_config` is readable by any authenticated user (the AI fns read it under the caller's JWT; model IDs are not sensitive) but writable by admins only.
6. `/admin` is unlisted in public navigation — reached by URL.

## 3. Server functions — `src/lib/admin.functions.ts`

All `createServerFn({ method: "POST" }).middleware([requireAdmin])` + Zod:

| Fn | Input | Effect |
|---|---|---|
| `adminGetStats` | — | Counts (users via `admin_list_users`, stores, products, orders) + GMV (sum paid order totals) + recent signups/orders |
| `adminListUsers` | — | Calls `admin_list_users()` |
| `adminSetUserRole` | `{ user_id: uuid, role: app_role, action: 'add'\|'remove' }` | Insert/delete row in `user_roles` (never allow removing own `admin` role) |
| `adminSetStoreStatus` | `{ store_id: uuid, status: 'active'\|'paused'\|'suspended' }` | Update store status |
| `adminSetStorePlan` | `{ store_id: uuid, plan: 'free'\|'pro' }` | Update store plan |
| `adminSetProductStatus` | `{ product_id: uuid, status: 'draft'\|'active'\|'archived' }` | Update product status |
| `adminGetModelConfig` | — | Effective model per fn: DB row ?? file registry fallback |
| `adminSetModelConfig` | `{ fn_name, model_id }` | Upsert row; `model_id` may be `""` to fall back to file registry |

## 4. AI model resolution change — `src/lib/ai.functions.ts`

Replace direct `gateway(AI_MODELS.<fn>)` with a helper:

```ts
async function resolveModel(supabase, fn: AiFnName) {
  const { data } = await supabase
    .from("ai_model_config").select("model_id").eq("fn_name", fn).maybeSingle();
  return gateway(data?.model_id || AI_MODELS[fn]);  // "" or missing row → file fallback
}
```

One extra DB read per AI call (negligible). `computeStoreInsights` stays heuristic (its config row, if any, is ignored).

## 5. Routes — `src/routes/admin.*`

| File | Content |
|---|---|
| `admin.tsx` | Layout: `beforeLoad` admin guard (redirect `/`), sidebar nav (Overview / Users / Stores / Products / AI Models), stat header. Reuses dashboard layout patterns |
| `admin.index.tsx` | Overview: stat cards + recent signups + recent orders |
| `admin.users.tsx` | Users table + role add/remove dropdown per row |
| `admin.stores.tsx` | Stores table: status + plan controls |
| `admin.products.tsx` | Products table (title, store, status, price) + archive/activate |
| `admin.ai.tsx` | Per-fn effective model display + edit + save |

UI: existing shadcn primitives, Midnight Plum tokens, same table/card idioms as the dashboard. Loading/empty/error states per route.

## 6. Storefront behavior for suspended stores

`routes/s.$storeSlug.index.tsx` + product page: if store status ≠ `active`, render a friendly "This store is currently unavailable" page instead of products. Marketplace home/discover already filter `status='active'`.

## 7. Verification bar

1. Migration applies clean in Supabase SQL editor; owner-promotion SQL run.
2. `/admin` loads all 5 pages with real data for the admin; redirects non-admins.
3. Pause a demo store → disappears from marketplace home/discover → storefront URL shows unavailable page → reactivate.
4. Flip Quobu Tech to `pro` → plan visible in stores table.
5. Change `assistantChat` model in /admin → assistant replies using the new model (verify via reply style or effective-model display); clear the override → falls back to file registry.
6. Role add/remove reflected on the Users table.
7. `bunx tsc --noEmit` clean; `bun run build` clean; full route matrix still green.
8. Committed + pushed; vault ROADMAP updated.
