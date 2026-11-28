// Admin read queries — ADDITIVE to admin.functions.ts (backend-owned, untouched).
// Every fn runs behind requireAdmin (same guard as admin.functions.ts); the RLS
// admin read policies (orders_admin_read, stores_admin_read, products_admin_read,
// profiles_admin_select) are the second safety net. riders is public-read; the
// affiliate_listings public SELECT grant backs storefront Partner Picks.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/admin-middleware";

const ORDER_STATUSES = [
  "all",
  "pending",
  "paid",
  "fulfilled",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

// ---------------- Orders oversight (spec p.74) ----------------
export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) =>
    z
      .object({
        status: z.enum(ORDER_STATUSES).optional(),
        search: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("orders")
      .select(
        "id, order_number, status, total, subtotal, currency, created_at, fulfillment_type, payment_term, source, buyer_id, shipping_address, store:stores(id, name, slug)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.ilike("order_number", `%${data.search.trim()}%`);
    const { data: rows, error } = await q;
    if (error) {
      console.error("[admin] orders:", error.message);
      throw new Error("Operation failed — check server logs");
    }
    return rows;
  });

// ---------------- Riders directory (spec p.70) ----------------
// riders has no declared FK to profiles, so no embed join — fetch riders, then
// resolve names via profiles_admin_select.
export const adminListRiders = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data: riders, error } = await context.supabase
      .from("riders")
      .select(
        "id, user_id, vehicle_type, license_plate, phone, is_online, is_approved, rating, completed_deliveries, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[admin] riders:", error.message);
      throw new Error("Operation failed — check server logs");
    }
    const rows = (riders ?? []) as {
      id: string;
      user_id: string;
      vehicle_type: string;
      license_plate: string | null;
      phone: string | null;
      is_online: boolean;
      is_approved: boolean;
      rating: number;
      completed_deliveries: number;
      created_at: string;
    }[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    let profiles: { id: string; full_name: string | null; avatar_url: string | null }[] = [];
    if (ids.length > 0) {
      const { data: prof, error: profErr } = await context.supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      if (!profErr) profiles = (prof ?? []) as typeof profiles;
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      full_name: byId.get(r.user_id)?.full_name ?? null,
      avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
    }));
  });

// ---------------- Affiliate listings (spec p.71) ----------------
export const adminListAffiliates = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data: listings, error } = await context.supabase
      .from("affiliate_listings")
      .select(
        "id, affiliate_user_id, commission_pct, custom_price, custom_title, status, created_at, product:products(id, title, currency, base_price), store:stores(id, name, slug)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[admin] affiliates:", error.message);
      throw new Error("Operation failed — check server logs");
    }
    const rows = (listings ?? []) as {
      id: string;
      affiliate_user_id: string;
      commission_pct: number;
      custom_price: number | null;
      custom_title: string | null;
      status: string;
      created_at: string;
      product: { id: string; title: string; currency: string; base_price: number } | null;
      store: { id: string; name: string; slug: string } | null;
    }[];
    const ids = [...new Set(rows.map((r) => r.affiliate_user_id))];
    let profiles: { id: string; full_name: string | null }[] = [];
    if (ids.length > 0) {
      const { data: prof, error: profErr } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (!profErr) profiles = (prof ?? []) as typeof profiles;
    }
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      affiliate_name: byId.get(r.affiliate_user_id)?.full_name ?? null,
    }));
  });
