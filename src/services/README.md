# BASIC frontend — service layer

The frontend talks to the backend through **one doorway per domain**. Components
never hand-roll SQL strings against core business operations; services own the
table/RPC contracts, the `as any` casts for tables the generated types don't
know yet, and the honest error classification.

```
src/services/
├── README.md      ← this file: the pattern + backend contract map
├── types.ts       ← domain interfaces (Product, Store, Order, CartItem…)
└── orders.ts      ← place_order — THE server-authoritative ordering RPC
```

## The rules

1. **Backend operations have exactly one service entry point.** `placeOrder()`
   is the only frontend path that creates an order — the product page's
   BUY NOW direct-order flow, the AI concierge's proposal confirmation and the
   seller's recap creation all land in the same server-priced, stock-locked,
   idempotent RPC. **BASIC has no shopping cart** (explicit product decision,
   `docs/FRONTEND-MASTER-SPEC.md` Part 2): ordering starts from a single
   product and goes straight to `place_order`.
2. **Never silently substitute mock data for a failed backend call.** Services
   throw typed errors (`OrderPlacementError` + code); surfaces render loading,
   empty, error and success states explicitly.
3. **`as any` casts live at the service boundary** (or in legacy route code
   awaiting a regen) — never in new components. See `BACKEND-CONTRACT.md §8`.
4. **No invented backend functionality.** If a table/RPC doesn't exist, the
   service doesn't pretend: click-tracking and payouts have no backend, so no
   service claims them.

## Backend contract map

| Service fn | Backend | Notes |
|---|---|---|
| `orders.placeOrder` | `place_order(p_store_id, p_product_id, …)` RPC | SECURITY DEFINER; server re-prices (seller floor), locks variant stock (`FOR UPDATE`), dedupes via `idempotency_key`, enforces qty 1–99. Granted to `authenticated`; buyers omit `buyer_id`, store members may act for a buyer. |
| AI concierge (`buyerAssistant`, `autoPilotReply`, `orderAssistant`…) | server fns in `src/lib/ai.functions.ts` | Backend-owned — do not duplicate from here. |
| Autopilot switches | `stores.auto_pilot`, `conversations.ai_enabled` | RLS-protected columns; UI state must never claim the AI is on when the server says otherwise. |

## Pending backend work (documented, not faked)

- `affiliate_listings` render as storefront **Partner picks**; click tracking,
  conversion attribution and payout statuses have no tables — no service
  invents earnings.
- Saved buyer addresses live in `localStorage` (`basic:checkout:address`)
  until an addresses table exists.
- There is no cart to persist — the direct-order flow carries its one item
  from the product page to `place_order` in a single pass.
