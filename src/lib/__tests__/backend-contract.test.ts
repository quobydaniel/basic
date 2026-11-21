import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Static contract tests — the invariants the audit pinned. These grep the
 * source so a future edit that reintroduces a banned pattern fails CI.
 */
const root = join(__dirname, "..", "..", "..");

describe("Phase-1 hardening invariants", () => {
  it("no browser-side calls to external AI providers", () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      const fs = require("node:fs") as typeof import("node:fs");
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === "__tests__") continue;
          scan(p);
        } else if (/\.(tsx?|ts)$/.test(e.name)) {
          const s = readFileSync(p, "utf8");
          if (s.includes("ai.gateway.lovable.dev")) offenders.push(p);
        }
      }
    };
    scan(join(root, "src", "routes"));
    scan(join(root, "src", "components"));
    expect(offenders, `browser-side AI bypass found in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("hardening migration exists with the transition trigger, stock trigger and place_order", () => {
    const sql = readFileSync(join(root, "supabase", "apply-pending-2026-11-21-order-hardening.sql"), "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.place_order(");
    expect(sql).toContain("enforce_order_status_transition");
    expect(sql).toContain("enforce_stock_before_item_insert");
    expect(sql).toContain("DROP POLICY IF EXISTS \"orders_buyer_create\"");
    expect(sql).toContain("orders_idempotency_key_idx");
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.deduct_stock_on_purchase\(\) FROM PUBLIC, anon/);
  });

  it("order creation server fns exist in ai.functions.ts", () => {
    const s = readFileSync(join(root, "src", "lib", "ai.functions.ts"), "utf8");
    expect(s).toContain("export const generateStudioCopy");
    expect(s).toContain("export const confirmProposal");
    expect(s).toContain("export const createSellerOrder");
    expect(s).toContain('generateViaOpenRouter("google/gemini-2.5-flash"');
  });
});
