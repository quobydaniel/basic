// requireAdmin — server-side admin guard for /admin server functions.
// Composes requireSupabaseAuth (JWT verification, injects context.supabase +
// context.userId) then checks the caller's own user_roles rows for 'admin'.
// RLS lets a user read only their own roles, which is all this check needs.
// The /admin page guard is convenience only; every mutation re-verifies here.
import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "./auth-middleware";

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (error) throw new Error("Failed to verify admin role");
    const roles = (data ?? []).map((r: { role: string }) => r.role);
    if (!roles.includes("admin")) {
      throw new Error("Forbidden — admin only");
    }
    return next({ context: { ...context, adminRoles: roles } });
  });
