import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Package, Truck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — BASIC" }] }),
  component: OrdersPage,
});

const STEPS = [
  { key: "pending", label: "Placed" },
  { key: "paid", label: "Paid" },
  { key: "fulfilled", label: "Packed" },
  { key: "shipped", label: "On the way" },
  { key: "delivered", label: "Delivered" },
] as const;

/**
 * Horizontal tracker for the normal order flow. Timestamps come from
 * order_events (trigger-maintained); if the table isn't migrated yet the
 * tracker still renders using the order's own status as the reached step.
 */
function OrderTimeline({
  status,
  events,
  placedAt,
  updatedAt,
}: {
  status: string;
  events: Record<string, string> | undefined;
  placedAt: string;
  updatedAt: string;
}) {
  if (status === "cancelled" || status === "refunded") {
    return <p className="mt-3 text-xs font-medium capitalize text-red-500">This order was {status}.</p>;
  }
  const idx = STEPS.findIndex((s) => s.key === status);
  const activeIdx = idx < 0 ? 0 : idx;
  return (
    <div className="relative mt-3.5 flex justify-between pt-0.5">
      <div className="absolute left-[9%] right-[9%] top-[10px] h-px bg-border" />
      <div
        className="absolute left-[9%] top-[10px] h-px bg-[var(--gold)]"
        style={{ width: `${(activeIdx / (STEPS.length - 1)) * 82}%` }}
      />
      {STEPS.map((s, i) => {
        const reached = i <= activeIdx;
        const current = i === activeIdx;
        const ts = events?.[s.key] ?? (s.key === "pending" ? placedAt : current ? updatedAt : null);
        return (
          <div key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center">
            <span
              className={`h-[11px] w-[11px] rounded-full border-2 ${
                reached ? "border-[var(--gold)] bg-[var(--gold)]" : "border-border bg-background"
              }`}
            />
            <span className={`mt-1.5 text-center text-[10px] leading-tight ${reached ? "text-foreground" : "text-muted-foreground/70"}`}>
              {s.label}
            </span>
            {current && ts && (
              <span className="text-[9px] leading-tight text-muted-foreground">
                {new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrdersPage() {
  const { user, loading } = useSession();
  const qc = useQueryClient();

  const orders = useQuery({
    queryKey: ["buyer-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, total, currency, created_at, updated_at, buyer_confirmed_at, fulfillment_type, payment_term, store:stores(slug, name), order_items(product_title, quantity)")
        .eq("buyer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Status history per order. Graceful to a missing table (migration not yet
  // run): the timeline falls back to the order's current status alone.
  const eventsByOrder = useQuery({
    queryKey: ["buyer-order-events", (orders.data ?? []).map((o: any) => o.id).join(",")],
    enabled: (orders.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (orders.data ?? []).map((o: any) => o.id);
      const { data, error } = await (supabase as any)
        .from("order_events")
        .select("order_id, status, created_at")
        .in("order_id", ids)
        .order("created_at", { ascending: true });
      if (error) return {} as Record<string, Record<string, string>>;
      const map: Record<string, Record<string, string>> = {};
      for (const e of data ?? []) {
        const m = (map[e.order_id] ??= {});
        if (!m[e.status]) m[e.status] = e.created_at;
      }
      return map;
    },
  });

  const confirm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("confirm_order_delivery", { p_order_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Thanks — the seller has been notified.");
      qc.invalidateQueries({ queryKey: ["buyer-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not confirm"),
  });

  // Rider leg: delivery_requests created when the seller ships (or files one
  // manually). Missing table / no rows just means "no rider assigned yet".
  const deliveryByOrder = useQuery({
    queryKey: ["buyer-order-deliveries", (orders.data ?? []).map((o: any) => o.id).join(",")],
    enabled: (orders.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (orders.data ?? []).map((o: any) => o.id);
      const { data, error } = await (supabase as any)
        .from("delivery_requests")
        .select("order_id, status, dropoff_address, rider:riders(vehicle_type)")
        .in("order_id", ids)
        .order("created_at", { ascending: false });
      if (error) return {} as Record<string, any>;
      const map: Record<string, any> = {};
      for (const d of data ?? []) {
        if (d.order_id && !map[d.order_id]) map[d.order_id] = d;
      }
      return map;
    },
  });
  const DELIVERY_LABEL: Record<string, string> = {
    open: "Waiting for a rider",
    assigned: "Rider assigned",
    picked_up: "Picked up — on the way",
    delivered: "Delivered by rider",
    cancelled: "Delivery cancelled",
  };

  return (
    <AppShell noFooter>
      <div className="px-4 pt-4 md:px-8 md:pt-8">
        <h1 className="font-display text-3xl">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track everything you've bought on BASIC.</p>
      </div>

      {loading ? null : !user ? (
        <div className="mx-4 mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center md:mx-8">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><Package className="h-6 w-6 text-muted-foreground" /></div>
          <p className="mt-4 font-display text-xl">Sign in to see your orders</p>
          <Link to="/auth" className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">Sign in</Link>
        </div>
      ) : (orders.data ?? []).length === 0 ? (
        <div className="mx-4 mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center md:mx-8">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><Package className="h-6 w-6 text-muted-foreground" /></div>
          <p className="mt-4 font-display text-xl">No orders yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">Your recent purchases will appear here.</p>
          <Link to="/discover" className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">Start shopping</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-2 px-4 md:px-8">
          {orders.data!.map((o: any) => (
            <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-medium">#{o.order_number}</p>
                <p className="font-display text-lg">{formatGHS(o.total, { currency: o.currency })}</p>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleDateString()} · {o.store?.name}
              </p>
              {(o.fulfillment_type || o.payment_term) && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {o.fulfillment_type && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] capitalize">
                      {o.fulfillment_type.replace(/_/g, " ")}
                    </span>
                  )}
                  {o.payment_term && (
                    <span className="rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-2 py-0.5 text-[10px] capitalize">
                      {o.payment_term.replace(/_/g, " ")}
                    </span>
                  )}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {(o.order_items ?? []).map((it: any) => `${it.quantity}× ${it.product_title}`).join(", ")}
              </p>

              <OrderTimeline
                status={o.status}
                events={eventsByOrder.data?.[o.id]}
                placedAt={o.created_at}
                updatedAt={o.updated_at}
              />

              {/* Rider leg — shows once the seller ships and a delivery exists */}
              {(() => {
                const d = deliveryByOrder.data?.[o.id];
                if (!d || o.status === "cancelled" || o.status === "refunded") return null;
                return (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Truck className="h-3.5 w-3.5 shrink-0 text-[var(--gold)]" />
                    <span className="font-medium text-foreground">{DELIVERY_LABEL[d.status] ?? "Delivery in progress"}</span>
                    {d.dropoff_address && <span>· {d.dropoff_address}</span>}
                    {d.rider?.vehicle_type && <span>· {String(d.rider.vehicle_type).replace(/_/g, " ")}</span>}
                  </p>
                );
              })()}

              {o.status === "delivered" && (
                o.buyer_confirmed_at ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Received — confirmed {new Date(o.buyer_confirmed_at).toLocaleDateString()}
                  </p>
                ) : (
                  <button
                    onClick={() => confirm.mutate(o.id)}
                    disabled={confirm.isPending && confirm.variables === o.id}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)] px-4 py-2 text-xs font-semibold text-[var(--gold-foreground)] hover:opacity-90 disabled:opacity-60"
                  >
                    {confirm.isPending && confirm.variables === o.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Confirm receipt
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
