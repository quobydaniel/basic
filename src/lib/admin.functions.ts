// Admin server functions — every fn runs behind requireAdmin (JWT verify +
// server-side admin role check) and validates input with Zod. The /admin
// pages call these; RLS admin policies are the second safety net.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { AI_MODELS, type AiFnName } from "@/lib/models.server";

const APP_ROLES = ["buyer", "seller", "staff", "admin", "rider"] as const;

// ---------------- Platform stats ----------------
export const adminGetStats = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const [usersRes, storesRes, productsRes, ordersRes, paidRes, recentOrdersRes] =
      await Promise.all([
        context.supabase.rpc("admin_list_users"),
        context.supabase.from("stores").select("id", { count: "exact" }),
        context.supabase.from("products").select("id", { count: "exact" }),
        context.supabase.from("orders").select("id", { count: "exact" }),
        context.supabase.from("orders").select("total").eq("status", "paid"),
        context.supabase
          .from("orders")
          .select("id, status, total, currency, created_at, store:stores(name)")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

    if (usersRes.error) throw new Error(usersRes.error.message);
    const users = (usersRes.data ?? []) as {
      user_id: string;
      email: string;
      full_name: string | null;
      created_at: string;
    }[];
    const gmv = (paidRes.data ?? []).reduce(
      (s: number, o: { total: number | null }) => s + Number(o.total ?? 0),
      0,
    );

    return {
      totalUsers: users.length,
      totalStores: storesRes.count ?? 0,
      totalProducts: productsRes.count ?? 0,
      totalOrders: ordersRes.count ?? 0,
      gmv,
      recentUsers: users.slice(0, 6),
      recentOrders: recentOrdersRes.data ?? [],
    };
  });

// ---------------- Users & roles ----------------
export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("admin_list_users");
    if (error) {
        console.error("[admin] db error:", error.message);
        throw new Error("Operation failed — check server logs");
      }
    return data as { user_id: string; email: string; full_name: string | null; roles: string[]; created_at: string }[];
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(APP_ROLES),
        action: z.enum(["add", "remove"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "remove" && data.role === "admin" && data.user_id === context.userId) {
      throw new Error("You cannot remove your own admin role");
    }
    if (data.action === "add") {
      const { error } = await context.supabase
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role });
      // Unique constraint violation = role already present; tolerate it
      if (error && error.code !== "23505") console.error("[admin] db error:", error.message);
      throw new Error("Operation failed — check server logs");
      return { ok: true };
    }
    const { error } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) {
        console.error("[admin] db error:", error.message);
        throw new Error("Operation failed — check server logs");
      }
    return { ok: true };
  });

// ---------------- Stores: status + plan ----------------
export const adminSetStoreStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) =>
    z
      .object({
        store_id: z.string().uuid(),
        status: z.enum(["active", "paused", "suspended"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stores")
      .update({ status: data.status })
      .eq("id", data.store_id);
    if (error) {
        console.error("[admin] db error:", error.message);
        throw new Error("Operation failed — check server logs");
      }
    return { ok: true };
  });

export const adminSetStorePlan = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) =>
    z
      .object({
        store_id: z.string().uuid(),
        plan: z.enum(["free", "pro"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("stores")
      .update({ plan: data.plan })
      .eq("id", data.store_id);
    if (error) {
        console.error("[admin] db error:", error.message);
        throw new Error("Operation failed — check server logs");
      }
    return { ok: true };
  });

// ---------------- Products: archive / activate ----------------
export const adminSetProductStatus = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) =>
    z
      .object({
        product_id: z.string().uuid(),
        status: z.enum(["draft", "active", "archived"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("products")
      .update({ status: data.status })
      .eq("id", data.product_id);
    if (error) {
        console.error("[admin] db error:", error.message);
        throw new Error("Operation failed — check server logs");
      }
    return { ok: true };
  });

// ---------------- AI model config ----------------
export const adminGetModelConfig = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_model_config")
      .select("fn_name, model_id, updated_at");
    if (error) {
        console.error("[admin] db error:", error.message);
        throw new Error("Operation failed — check server logs");
      }
    const rows = (data ?? []) as { fn_name: string; model_id: string; updated_at: string }[];
    return (Object.keys(AI_MODELS) as AiFnName[]).map((fn) => {
      const row = rows.find((r) => r.fn_name === fn);
      return {
        fnName: fn,
        dbModel: row?.model_id ?? null, // "" means "cleared → file fallback"
        updatedAt: row?.updated_at ?? null,
        fileModel: AI_MODELS[fn],
        effective: row && row.model_id !== "" ? row.model_id : AI_MODELS[fn],
      };
    });
  });

export const adminSetModelConfig = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) =>
    z
      .object({
        fn_name: z.enum([
          "generateListingFromPhotos",
          "draftChatReplies",
          "generateMarketingPost",
          "computeStoreInsights",
          "assistantChat",
        ]),
        // "" clears the override → falls back to the file registry
        model_id: z.string().max(160),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("ai_model_config")
      .upsert({
        fn_name: data.fn_name,
        model_id: data.model_id,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) {
        console.error("[admin] db error:", error.message);
        throw new Error("Operation failed — check server logs");
      }
    return { ok: true };
  });
