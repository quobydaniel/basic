# BACKEND CONTRACT — read before redesigning any surface

The visual redesign must not change these behaviors. They were built and
live-tested through heavy iteration; every "sucks" bug of 2026-11-17 was
fixed here. If a redesign makes any of this regress, it is a bug.

## 1. Server functions (the only AI endpoints — do not duplicate)

| Fn | Purpose | Contract |
|---|---|---|
| `autoPilotReply` | Seller-authenticated engine run (open thread, heartbeat) | caller = seller; direct insert |
| `autoPilotReplyRemote` | Buyer-triggered engine run (offline coverage) | caller = buyer; insert via `basic_autopilot_send` RPC |
| `buyerAssistant` | THE one buyer concierge (comparison, GO-routes) | in: messages + product_id/store_slug/page_context/page_path/page_product; out: reply, products[], goRoute |
| `orderAssistant` | Seller orders page AI (STRICT JSON actions) | page renders + executes; AI never writes |
| `summarizeConversation` | Seller chat recap (JSON) | seller-only |
| `generateListingFromPhotos`, marketing posts, insight | Seller tools | unchanged |

Engine throttles live in `runAutoPilot` (3 concurrent runs/caller, 10s
per-thread AI cooldown) — client refactors must not try to "fix" their
error messages away; they are intentional.

## 2. Client trigger contract (chat.$conversationId.tsx)

- BUYER side: fires `autoPilotReplyRemote` immediately when the newest
  message is the buyer's own and the store is Pro + auto_pilot on
  (module-scope `fired` map = one trigger per message; StrictMode-safe).
- SELLER side: fires `autoPilotReply` on buyer messages when the thread is
  open and autopilot is on; skips null-sender system cards (self-loop guard).
- Typing bubble: `pilotPendingRef` counts in-flight engine calls; the bubble
  lives exactly as long as a run is in flight (3-min ceiling), closes on a
  message from the other side, +6s settle grace with 2.5s polling while up.
- Both effects invalidate `["msgs", id]` in `.finally` — a refused run must
  still refetch (replies can be delivered by another surface).

## 3. Message kinds & rendering

- `text` — ordinary bubbles. AI messages carry `metadata.ai = true`.
- `image` — no body text; render the photo.
- `system_order` — NULL sender, centered gold card. Two flavors:
  - `metadata.proposal === "order"` → proposal card (payload has product,
    qty, unit_price, total, delivery, payment). Confirm button = seller's
    existing confirm flow (server creates the order — NEVER client-side).
  - order confirmations / cancellations — read-only status cards.
- Proposal cards must NOT auto-execute on render. Seller confirmation is
  mandatory (engine + RLS enforce it server-side too).

## 4. AI pause & control

- Store master: `stores.auto_pilot` (Pro only) — thread header toggle.
- Per-chat pause: `conversations.ai_enabled` (false = AI silent in that
  thread regardless of the master). Both write via `toggleAutoPilot` server fn.
- The engine itself re-checks every rule; UI state must not pretend the AI
  is on when the server says otherwise.

## 5. Notifications

`notifications.payload` = `{ conversation_id?, wa_link?, order_id? }`.
`conversation_id` routes to the thread; `wa_link` renders the WhatsApp
button (seller recap push). Keep both actions on order notifications.

## 6. Realtime & data

- Realtime channel on `messages` (ws-polyfill.server import in
  auth-middleware is intentional — do not remove).
- Query keys: `["msgs", id]`, `["conversations", ...]` — keep invalidation
  contracts intact.
- `ai_usage` per-user daily ration (40/day) is enforced in `buyerAssistant`;
  it degrades silently if the table is missing. Do not remove the upsert.

## 7. Latency UX (why it looks like this)

NVIDIA free-tier NIM takes 20-90s under load. The gateway races two keys and
OpenRouter; the bubble + polling are what make that acceptable. If a redesign
changes reply UX, keep: immediate bubble on trigger → live until settle →
6s settle grace → close. Never reintroduce fixed short timeouts.

## 8. File ownership

Backend (gateway, autopilot, ai.functions, models.server, supabase/*) —
backend session. Frontend surfaces/components/routes/styles — design
session. Generated `src/integrations/supabase/types.ts` may lag new tables
(ai_usage, shorts); the backend uses `as any` casts until a regen — a regen
is welcome, but do not hand-edit cast sites.
