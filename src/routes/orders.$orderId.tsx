import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, MessageCircle, Package, Store } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/orders/$orderId")({
  head: () => ({ meta: [{ title: "Order details — BASIC" }] }),
  component: OrderDetailsPage,
});

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  created_at: string;
  updated_at: string;
  fulfillment_type: string | null;
  payment_term: string | null;
  source: string;
  notes: string | null;
  shipping_address: unknown;
  store: { id: string; name: string; slug: string } | null;
};

type ItemRow = {
  id: string;
  product_title: string;
  variant_title: string | null;
  quantity: number;
  unit_price: number;
  total: number;
};

type EventRow = {
  id: string;
  kind: string;
  message: string | null;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  status: string;
  dropoff_address: string | null;
  rider: { vehicle_type: string } | null;
};

const STATUS_STEP: Record<string, number> = {
  pending: 0,
  paid: 1,
  fulfilled: 2,
  shipped: 3,
  delivered: 4,
};

function OrderDetailsPage() {
  const { user } = useSession();
  const { orderId } = Route.useParams();

  const order = useQuery({
    queryKey: ["buyer-order", orderId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, subtotal, shipping, tax, discount, total, currency, created_at, updated_at, fulfillment_type, payment_term, source, notes, shipping_address, store:stores(id, name, slug)",
        )
        .eq("id", orderId)
        .eq("buyer_id", user!.id)
        .single();
      if (error) throw error;
      return data as unknown as OrderRow;
    },
  });

  const items = useQuery({
    queryKey: ["buyer-order-items", orderId],
    enabled: !!user && !!order.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, product_title, variant_title, quantity, unit_price, total")
        .eq("order_id", orderId);
      if (error) throw error;
      return data as ItemRow[];
    },
  });

  const events = useQuery({
    queryKey: ["buyer-order-events", orderId],
    enabled: !!user && !!order.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events")
        .select("id, kind, message, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error; // missing table on stale DBs → honest error state
      return data as EventRow[];
    },
  });

  const delivery = useQuery({
    queryKey: ["buyer-order-delivery", orderId],
    enabled: !!user && !!order.data,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("delivery_requests")
        .select("id, status, dropoff_address, rider:riders(vehicle_type)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) return null;
      return (data?.[0] ?? null) as DeliveryRow | null;
    },
  });

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
          <Package className="h-8 w-8 text-muted-foreground" />
          <h1 className="font-display text-2xl">Order details</h1>
          <p className="max-w-sm text-sm text-muted-foreground">Sign in to view this order.</p>
          <Link
            to="/auth"
            className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  const o = order.data;
  const step = o ? (STATUS_STEP[o.status] ?? 0) : 0;
  const terminal = o?.status === "cancelled" || o?.status === "refunded";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-16 md:px-8 md:pt-8">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
        >
          <ChevronLeft className="h-4 w-4" /> My orders
        </Link>

        {order.isLoading && (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading order…</p>
        )}
        {order.error && (
          <p className="py-16 text-center text-sm text-destructive">
            Couldn't load this order — it may not exist or may belong to another account.
          </p>
        )}

        {o && (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl md:text-3xl">{o.order_number}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Placed {new Date(o.created_at).toLocaleString()} · via {o.source}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                  terminal
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-gold/40 bg-gold/10 text-gold"
                }`}
              >
                {o.status.replace(/_/g, " ")}
              </span>
            </div>

            {/* Status ladder */}
            {!terminal && (
              <div className="mt-5 rounded-2xl border border-border bg-card p-4 md:p-5">
                <div className="flex justify-between">
                  {["Placed", "Paid", "Packed", "On the way", "Delivered"].map((label, i) => (
                    <div key={label} className="flex min-w-0 flex-1 flex-col items-center">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${i <= step ? "bg-[var(--gold)]" : "border border-border bg-background"}`}
                      />
                      <span
                        className={`mt-1.5 text-[10px] ${i <= step ? "text-foreground" : "text-muted-foreground/70"}`}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
                {delivery.data?.status && (
                  <p className="mt-3 text-xs capitalize text-muted-foreground">
                    Delivery: {delivery.data.status.replace(/_/g, " ")}
                    {delivery.data.rider?.vehicle_type
                      ? ` · ${delivery.data.rider.vehicle_type} rider`
                      : ""}
                  </p>
                )}
              </div>
            )}

            {/* Items */}
            <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
              <h2 className="border-b border-border/70 px-4 py-3 font-display text-lg md:px-5">
                Items
              </h2>
              {items.isLoading && (
                <p className="px-5 py-6 text-sm text-muted-foreground">Loading items…</p>
              )}
              <ul className="divide-y divide-border/60">
                {(items.data ?? []).map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm md:px-5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{it.product_title}</p>
                      {it.variant_title && (
                        <p className="text-xs text-muted-foreground">{it.variant_title}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatGHS(it.unit_price, { currency: o.currency })} × {it.quantity}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium">
                      {formatGHS(it.total, { currency: o.currency })}
                    </span>
                  </li>
                ))}
                {(items.data ?? []).length === 0 && !items.isLoading && (
                  <li className="px-5 py-6 text-sm text-muted-foreground">
                    Item breakdown unavailable for this order.
                  </li>
                )}
              </ul>
              <div className="space-y-1.5 border-t border-border/70 px-4 py-3 text-sm md:px-5">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatGHS(o.subtotal, { currency: o.currency })}</span>
                </div>
                {o.shipping > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span>{formatGHS(o.shipping, { currency: o.currency })}</span>
                  </div>
                )}
                {o.discount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span>−{formatGHS(o.discount, { currency: o.currency })}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 font-semibold">
                  <span>Total</span>
                  <span>{formatGHS(o.total, { currency: o.currency })}</span>
                </div>
              </div>
            </section>

            {/* Status history */}
            <section className="mt-5 rounded-2xl border border-border bg-card p-4 md:p-5">
              <h2 className="font-display text-lg">Status history</h2>
              {events.isLoading && (
                <p className="mt-3 text-sm text-muted-foreground">Loading history…</p>
              )}
              {events.error && (
                <p className="mt-3 text-sm text-muted-foreground">
                  History tracking isn't set up on this database yet — the status badge above is
                  live.
                </p>
              )}
              {events.data && (
                <ol className="mt-3 space-y-0">
                  {events.data.length === 0 && (
                    <li className="text-sm text-muted-foreground">No recorded events yet.</li>
                  )}
                  {events.data.map((e, i) => (
                    <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < events.data!.length - 1 && (
                        <span
                          className="absolute left-[5px] top-4 h-full w-px bg-border"
                          aria-hidden="true"
                        />
                      )}
                      <span className="mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[var(--gold)] bg-background" />
                      <div className="min-w-0">
                        <p className="text-sm capitalize">
                          {e.kind.replace(/_/g, " ")}
                          {e.message ? ` — ${e.message}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Delivery + seller */}
            <section className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
                <h2 className="font-display text-lg">Delivery</h2>
                <p className="mt-2 text-sm capitalize text-muted-foreground">
                  {o.fulfillment_type?.replace(/_/g, " ") ?? "—"} ·{" "}
                  {o.payment_term?.replace(/_/g, " ") ?? "—"}
                </p>
                {o.shipping_address != null && (
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-3 font-mono text-xs">
                    {typeof o.shipping_address === "string"
                      ? o.shipping_address
                      : JSON.stringify(o.shipping_address, null, 2)}
                  </pre>
                )}
                {delivery.data?.dropoff_address && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Drop-off: {delivery.data.dropoff_address}
                  </p>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Live GPS tracking isn't part of the platform — delivery progress comes from rider
                  status updates.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
                <h2 className="font-display text-lg">Seller</h2>
                <p className="mt-2 flex items-center gap-2 text-sm font-medium">
                  <Store className="h-4 w-4 text-gold" /> {o.store?.name ?? "—"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {o.store && (
                    <Link
                      to="/s/$storeSlug"
                      params={{ storeSlug: o.store.slug }}
                      className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium hover:border-gold/50 hover:text-gold"
                    >
                      Visit storefront
                    </Link>
                  )}
                  <Link
                    to="/chat"
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/20"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> Message seller
                  </Link>
                </div>
                {o.notes && (
                  <p className="mt-3 text-xs text-muted-foreground">Order note: {o.notes}</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
