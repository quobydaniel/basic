// Orders service — the frontend's single doorway into server-side ordering.
// Every path that creates an order (buyer checkout, AI proposal confirm,
// seller recap) goes through the authoritative `place_order` RPC: the server
// prices the order itself (seller floor checked), locks variant stock, and
// dedupes by idempotency key. The client can never invent a price or oversell.
//
// Contract: supabase/apply-pending-2026-11-21-order-hardening.sql — granted to
// `authenticated`; buyers pass their own identity (omit buyer_id), store
// members may act on behalf of a buyer (AI proposal confirmation).

import { supabase } from "@/integrations/supabase/client";

export type PlaceOrderInput = {
  store_id: string;
  product_id: string;
  /** 1–99 — rejected server-side outside this range. */
  quantity: number;
  /** Optional in principle; the cart path always sends the listed price —
      the server recomputes and floor-checks regardless. */
  unit_price?: number | null;
  variant_title?: string | null;
  /** Non-null ⇒ fulfillment_type 'delivery'; null ⇒ 'meet_in_person'. */
  delivery?: string | null;
  /** Free-text payment term ('on_delivery' | 'escrow' | 'before_delivery'). */
  payment?: string | null;
  notes?: string | null;
  /** Origin tag recorded on the order — 'cart', 'chat', … */
  source?: string;
  /** Dedupes repeated submissions into the original order. */
  idempotency_key?: string | null;
  /** Store members only — the buyer on whose behalf the order is placed. */
  buyer_id?: string | null;
};

export type PlaceOrderResult = {
  order_id: string;
  order_number: string;
  total: number;
  quantity: number;
  duplicate: boolean;
};

export class OrderPlacementError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_authenticated"
      | "invalid_quantity"
      | "store_not_available"
      | "product_not_available"
      | "below_floor"
      | "insufficient_stock"
      | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "OrderPlacementError";
  }
}

function classify(message: string): OrderPlacementError["code"] {
  const m = message.toLowerCase();
  if (m.includes("not authenticated")) return "not_authenticated";
  if (m.includes("invalid quantity")) return "invalid_quantity";
  if (m.includes("store not available")) return "store_not_available";
  if (m.includes("product not available")) return "product_not_available";
  if (m.includes("below the seller floor")) return "below_floor";
  if (m.includes("insufficient stock")) return "insufficient_stock";
  return "unknown";
}

/** Place one order through the server-authoritative RPC. */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  // place_order ships in the pending order-hardening SQL — until the
  // generated types regen, the RPC rides the documented `as any` cast
  // pattern (BACKEND-CONTRACT §8).
  const { data, error } = await (supabase as any).rpc("place_order", {
    p_store_id: input.store_id,
    p_product_id: input.product_id,
    p_quantity: input.quantity,
    p_unit_price: input.unit_price ?? null,
    p_variant_title: input.variant_title ?? null,
    p_delivery: input.delivery ?? null,
    p_payment: input.payment ?? null,
    p_notes: input.notes ?? null,
    p_source: input.source ?? "chat",
    p_idempotency_key: input.idempotency_key ?? null,
    p_buyer_id: input.buyer_id ?? null,
  });
  if (error) {
    throw new OrderPlacementError(error.message, classify(error.message));
  }
  const res = (data ?? {}) as Partial<PlaceOrderResult> & { order_id?: string };
  if (!res.order_id) {
    throw new OrderPlacementError("Server returned no order", "unknown");
  }
  return {
    order_id: res.order_id,
    order_number: res.order_number ?? "",
    total: Number(res.total ?? 0),
    quantity: Number(res.quantity ?? input.quantity),
    duplicate: res.duplicate === true,
  };
}
