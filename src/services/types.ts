// BASIC frontend — domain types shared by services and UI.
// These mirror the live Supabase schema (see supabase/migrations/ and
// BACKEND-CONTRACT.md). Where the generated types
// (src/integrations/supabase/types.ts) lag new tables, the services cast
// through `as any` at the boundary — the cast lives HERE, never in components.

export type OrderStatus =
  "pending" | "paid" | "fulfilled" | "shipped" | "delivered" | "cancelled" | "refunded";

/** products.payment_type — per-product seller terms. */
export type PaymentTerm = "on_delivery" | "escrow" | "before_delivery";

export type Product = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  base_price: number;
  compare_at_price: number | null;
  currency: string;
  /** products.delivery_available / payment_type (seller terms migration). */
  delivery_available: boolean | null;
  payment_type: PaymentTerm | null;
  negotiable?: boolean;
  status: "draft" | "active" | "archived";
  store_id: string;
  product_media: { url: string; alt?: string | null; position?: number | null }[];
  product_variants: ProductVariant[];
};

export type ProductVariant = {
  id: string;
  title: string;
  price: number | null;
  inventory_qty: number | null;
};

export type Store = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  currency: string;
  status: "active" | "paused" | "suspended";
  plan: "free" | "pro";
  area: string | null;
  city: string | null;
  region: string | null;
  /** Autopilot master — Pro only; the engine re-checks server-side. */
  auto_pilot: boolean | null;
  ai_name: string | null;
  ai_greeting: string | null;
  ai_persona: string | null;
};

export type Order = {
  id: string;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  total: number;
  currency: string;
  source: string | null;
  /** 'delivery' | 'meet_in_person' — set by place_order from p_delivery. */
  fulfillment_type: string;
  payment_term: string | null;
  store_id: string;
  buyer_id: string;
};

/** Cart line — a frontend intent; the server re-prices and stock-checks it
    at place_order time. See src/lib/cart.ts. */
export type CartItem = {
  key: string;
  product_id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  product_slug: string;
  title: string;
  image: string | null;
  unit_price: number;
  currency: string;
  qty: number;
  variant_title: string | null;
  delivery_available: boolean | null;
  payment_type: PaymentTerm | null;
};
