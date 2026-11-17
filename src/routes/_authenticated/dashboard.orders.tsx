import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  component: OrdersPage,
});

const STATUSES = ["pending", "paid", "fulfilled", "shipped", "delivered", "cancelled", "refunded"] as const;

/* First ordered item that carries product media (order_items → variant →
   product → media). Legacy/manual orders with no variant fall through to
   the placeholder tile. */
function firstOrderImage(o: any): string | null {
  for (const it of o.order_items ?? []) {
    const media = it.product_variants?.products?.product_media;
    if (media?.[0]?.url) return media[0].url;
  }
  return null;
}

/* Escrow view of an order — derived from payment_term + status + buyer
   confirmation (display only for now; real funds movement comes later). */
function escrowState(o: any): { label: string; tone: "sage" | "gold" } | null {
  const confirmed = !!o.buyer_confirmed_at;
  if (o.status === "delivered" && confirmed) return { label: "Escrow released ✓", tone: "sage" };
  if (o.payment_term === "pay_before_delivery" && ["paid", "fulfilled", "shipped"].includes(o.status)) return { label: "Funds held in escrow — released on delivery", tone: "gold" };
  if (o.payment_term === "escrow") return { label: "Escrow — funds held until delivery", tone: "gold" };
  if (o.payment_term === "pay_on_delivery") return o.status === "delivered" ? { label: "Paid on delivery ✓", tone: "sage" } : { label: "Cash due on delivery", tone: "gold" };
  return null;
}

function OrdersPage() {
  const { user } = useSession();
  const qc = useQueryClient();

  const orders = useQuery({
    queryKey: ["dashboard-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: stores } = await supabase.from("stores").select("id").eq("owner_id", user!.id);
      const ids = (stores ?? []).map((s) => s.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, total, currency, contact_email, created_at, buyer_confirmed_at, payment_term, fulfillment_type, buyer_id, store_id, order_items(product_title, quantity, product_variants(products(product_media(url))))")
        .in("store_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, order }: { id: string; status: string; order?: any }) => {
      const { error } = await supabase.from("orders").update({ status: status as any }).eq("id", id);
      if (error) throw error;
      // A seller-side cancellation lands in the buyer's chat thread as an
      // informational card — the buyer shouldn't have to discover it in Orders.
      if (status === "cancelled" && order) {
        try {
          const { data: convo } = await (supabase as any)
            .from("conversations")
            .select("id")
            .eq("buyer_id", order.buyer_id)
            .eq("store_id", order.store_id)
            .maybeSingle();
          if (convo) {
            await (supabase as any).from("messages").insert({
              conversation_id: convo.id,
              sender_id: user!.id,
              kind: "system_order",
              body: `Order ${order.order_number} was cancelled by the seller.`,
              metadata: { order_id: order.id, cancelled_by_seller: true },
            });
          }
        } catch (e) {
          console.error("[dashboard-orders] cancel card failed:", e);
        }
      }
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["dashboard-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Hard delete — destructive, so the UI only offers it for pending/cancelled
  // orders and confirms first. Needs the orders_store_delete RLS policy
  // (apply-pending-2026-11-14e.sql); without it this fails with an RLS error.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order deleted");
      qc.invalidateQueries({ queryKey: ["dashboard-orders"] });
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "";
      toast.error(/row-level|policy|42501/i.test(m) ? "One-time setup needed — run apply-pending-2026-11-14e.sql in Supabase." : m || "Could not delete");
    },
  });

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage every order from every channel.</p>

      {/* Orders as a grid of cards — one card per order, with quick cancel
          (pre-fulfilment) and hard delete (pending/cancelled only, confirmed)
          beside the full status select. */}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {orders.isLoading && <div className="p-6 text-sm text-muted-foreground md:col-span-2">Loading…</div>}
        {(orders.data ?? []).length === 0 && !orders.isLoading && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center md:col-span-2">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
            <p className="font-display text-lg">No orders yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Once a customer checks out, their order lands here.
            </p>
          </div>
        )}
        {(orders.data ?? []).map((o: any) => {
          const cancellable = o.status === "pending" || o.status === "paid";
          const deletable = o.status === "pending" || o.status === "cancelled";
          return (
            <article key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex gap-3">
                {firstOrderImage(o) ? (
                  <img
                    src={firstOrderImage(o)!}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
                  />
                ) : (
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">#{o.order_number}</p>
                    <p className="shrink-0 font-display text-lg">{formatGHS(o.total, { currency: o.currency })}</p>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()} · {o.contact_email ?? "guest"}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {(o.order_items ?? []).map((it: any) => `${it.quantity}× ${it.product_title}`).join(", ") || "—"}
                  </p>
                  {escrowState(o) && (
                    <p className="mt-1">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${escrowState(o)!.tone === "sage" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-[var(--gold)]/50 bg-[var(--gold)]/10 text-foreground"}`}>
                        {escrowState(o)!.label}
                      </span>
                    </p>
                  )}
                  {o.buyer_confirmed_at && (
                    <p className="mt-1">
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                        Buyer confirmed receipt ✓
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
                <select
                  value={o.status}
                  onChange={(e) => setStatus.mutate({ id: o.id, status: e.target.value, order: o })}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
                  aria-label={`Status for order ${o.order_number}`}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
                <div className="flex shrink-0 items-center gap-1.5">
                  {cancellable && (
                    <button
                      onClick={() => setStatus.mutate({ id: o.id, status: "cancelled", order: o })}
                      disabled={setStatus.isPending}
                      className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                    >
                      Cancel order
                    </button>
                  )}
                  {deletable && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete order #${o.order_number}? This can't be undone.`)) remove.mutate(o.id);
                      }}
                      disabled={remove.isPending}
                      aria-label={`Delete order ${o.order_number}`}
                      title="Delete order"
                      className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
