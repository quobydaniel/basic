import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, Package, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — BASIC" }] }),
  component: OrdersPage,
});

// Supabase errors surface as plain PostgrestError objects (not Error
// instances) — instanceof-based extraction loses the message.
function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  return (e as any)?.message ?? "";
}

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
    return (
      <p className="mt-3 text-xs font-medium capitalize text-red-500">This order was {status}.</p>
    );
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
            <span
              className={`mt-1.5 text-center text-[10px] leading-tight ${reached ? "text-foreground" : "text-muted-foreground/70"}`}
            >
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
  // Status buckets — 15 pending cards in a row is noise; buyers think in
  // "what's moving" vs "what's done" vs "what died".
  const [bucket, setBucket] = useState<"all" | "active" | "done" | "cancelled">("all");
  const isActiveStatus = (s: string) => ["pending", "paid", "fulfilled", "shipped"].includes(s);

  // Escrow view of an order — derived from payment_term + status + buyer
  // confirmation (display only for now; real funds movement comes later).
  const escrowState = (o: any): { label: string; tone: "sage" | "gold" } | null => {
    const confirmed = !!o.buyer_confirmed_at;
    if (o.status === "delivered" && confirmed) return { label: "Escrow released ✓", tone: "sage" };
    if (
      o.payment_term === "pay_before_delivery" &&
      ["paid", "fulfilled", "shipped"].includes(o.status)
    )
      return { label: "Funds held in escrow — released on delivery", tone: "gold" };
    if (o.payment_term === "escrow")
      return { label: "Escrow — funds held until delivery", tone: "gold" };
    if (o.payment_term === "pay_on_delivery")
      return o.status === "delivered"
        ? { label: "Paid on delivery ✓", tone: "sage" }
        : { label: "Cash due on delivery", tone: "gold" };
    return null;
  };

  const orders = useQuery({
    queryKey: ["buyer-orders", user?.id],
    enabled: !!user,
    refetchInterval: 60_000, // track progress updates even without realtime
    queryFn: async () => {
      // Cast: the generated types are stale (they choke on store_id here and
      // already carry 8 baseline errors elsewhere) — runtime is fine.
      const { data, error } = await (supabase as any)
        .from("orders")
        .select(
          "id, order_number, status, total, currency, created_at, updated_at, buyer_confirmed_at, fulfillment_type, payment_term, store_id, store:stores(slug, name, logo_url), order_items(product_title, quantity)",
        )
        .eq("buyer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Live track progress: when the seller moves an order's status, both the
  // cards and the timelines refresh immediately. Realtime first (works when
  // the tables are in the publication), a 60s poll as the guaranteed floor.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`buyer-orders:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `buyer_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["buyer-orders", user.id] });
          qc.invalidateQueries({ queryKey: ["buyer-order-events"] });
        },
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_events" }, () => {
        qc.invalidateQueries({ queryKey: ["buyer-order-events"] });
        qc.invalidateQueries({ queryKey: ["buyer-orders", user.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  // Product images for the cards: order_items carry only titles (and not
  // always a variant), so match titles → products within the same store.
  // Anything unmatched falls back to the store logo — every card gets a face.
  const imgByStoreTitle = useQuery({
    queryKey: ["buyer-order-imgs", (orders.data ?? []).map((o: any) => o.store_id).join(",")],
    enabled: (orders.data ?? []).length > 0,
    queryFn: async () => {
      const storeIds = [
        ...new Set((orders.data ?? []).map((o: any) => o.store_id).filter(Boolean)),
      ];
      if (storeIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await (supabase as any)
        .from("products")
        .select("title, store_id, product_media(url)")
        .in("store_id", storeIds)
        .eq("status", "active")
        .limit(200);
      if (error) return {} as Record<string, string>;
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        const url = p.product_media?.[0]?.url;
        if (url) map[`${p.store_id}:${p.title.toLowerCase()}`] = url;
      }
      return map;
    },
  });
  const itemImage = (o: any, title: string | null) =>
    (title && imgByStoreTitle.data?.[`${o.store_id}:${title.toLowerCase()}`]) ||
    o.store?.logo_url ||
    null;

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
    onError: (e) => toast.error(errMsg(e) || "Could not confirm"),
  });

  // The buyer's existing conversations, by store — orders link straight
  // back into the chat where the deal was made, and cancellation requests
  // travel through the same thread.
  const convoByStore = useQuery({
    queryKey: ["buyer-convo-map", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("conversations")
        .select("id, store_id")
        .eq("buyer_id", user!.id);
      if (error) return {} as Record<string, string>;
      const map: Record<string, string> = {};
      for (const c of data ?? []) map[c.store_id as string] = c.id as string;
      return map;
    },
  });

  // Cancellation: buyers can't cancel a placed order themselves — only the
  // seller can. The button drops a request INTO the order's chat thread
  // (message trigger already notifies the seller) and marks it locally.
  const [cancelSent, setCancelSent] = useState<Set<string>>(new Set());
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);
  async function requestCancellation(o: any) {
    if (!user || cancelBusy) return;
    const convoId = convoByStore.data?.[o.store_id];
    if (!convoId)
      return toast.error(
        "Open a chat with this seller first, then request the cancellation there.",
      );
    setCancelBusy(o.id);
    try {
      const { error } = await (supabase as any).from("messages").insert({
        conversation_id: convoId,
        sender_id: user.id,
        kind: "system_order",
        body: `Cancellation requested by the buyer for order ${o.order_number} (${o.currency} ${o.total}) — only the seller can cancel a placed order, so please review it in Orders.`,
        metadata: { order_id: o.id, cancel_request: true },
      });
      if (error) throw error;
      setCancelSent((s) => new Set(s).add(o.id));
      toast.success("Cancellation request sent — the seller will review it.");
      qc.invalidateQueries({ queryKey: ["msgs", convoId] });
    } catch (e) {
      toast.error(errMsg(e) || "Could not send the request");
    } finally {
      setCancelBusy(null);
    }
  }

  // Direct cancel — a PENDING order is still fully the buyer's (nothing has
  // been captured), so they can pull it outright via the cancel_order_by_buyer
  // RPC. Paid+ orders keep the request-to-seller flow above. The chat thread
  // gets an informational card (no confirm/decline prompt — it already
  // happened) so the seller sees the cancellation without opening Orders.
  async function cancelOrder(o: any) {
    if (!user || cancelBusy) return;
    setCancelBusy(o.id);
    try {
      const { error } = await (supabase as any).rpc("cancel_order_by_buyer", { p_order_id: o.id });
      if (error) {
        const m = error.message || "";
        toast.error(
          /pending/i.test(m)
            ? m
            : /schema|exist|permission/i.test(m)
              ? "One-time setup needed — run apply-pending-2026-11-14j.sql in Supabase."
              : m || "Could not cancel",
        );
        return;
      }
      const convoId = convoByStore.data?.[o.store_id];
      if (convoId) {
        await (supabase as any).from("messages").insert({
          conversation_id: convoId,
          sender_id: user.id,
          kind: "system_order",
          body: `Order ${o.order_number} was cancelled by the buyer.`,
          metadata: { order_id: o.id, cancelled_by_buyer: true },
        });
        qc.invalidateQueries({ queryKey: ["msgs", convoId] });
      }
      toast.success("Order cancelled — the seller has been notified in chat.");
      qc.invalidateQueries({ queryKey: ["buyer-orders"] });
    } catch (e) {
      toast.error(errMsg(e) || "Could not cancel");
    } finally {
      setCancelBusy(null);
    }
  }

  // Buyer delete — pending or cancelled orders only, enforced by the
  // orders_buyer_delete policy (migration j). Paid/delivered history stays.
  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order removed from your list");
      qc.invalidateQueries({ queryKey: ["buyer-orders"] });
    },
    onError: (e) => {
      const m = errMsg(e);
      toast.error(
        /row-level|policy|42501/i.test(m)
          ? "One-time setup needed — run apply-pending-2026-11-14j.sql in Supabase."
          : m || "Could not delete",
      );
    },
  });

  // Track: cards stay compact (one-line stage) until the buyer opens the
  // full timeline for a specific order.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleTrack = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  const all = orders.data ?? [];
  const counts = {
    all: all.length,
    active: all.filter((o: any) => isActiveStatus(o.status)).length,
    done: all.filter((o: any) => o.status === "delivered").length,
    cancelled: all.filter((o: any) => o.status === "cancelled").length,
  };
  const visible = all.filter((o: any) =>
    bucket === "all"
      ? true
      : bucket === "active"
        ? isActiveStatus(o.status)
        : bucket === "cancelled"
          ? o.status === "cancelled"
          : o.status === "delivered",
  );
  // The Cancelled tab only earns a chip once something actually got cancelled.
  const bucketList: ["all" | "active" | "done" | "cancelled", string][] = [
    ["all", `All · ${counts.all}`],
    ["active", `In progress · ${counts.active}`],
    ["done", `Delivered · ${counts.done}`],
  ];
  if (counts.cancelled > 0) bucketList.push(["cancelled", `Cancelled · ${counts.cancelled}`]);

  return (
    <AppShell>
      <div className="px-4 pt-4 md:px-8 md:pt-8">
        <h1 className="font-display text-3xl">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track everything you've bought on BASIC.
        </p>
        {counts.all > 0 && (
          <div className="mt-3 flex gap-1.5">
            {bucketList.map(([b, label]) => (
              <button
                key={b}
                onClick={() => setBucket(b)}
                className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  bucket === b
                    ? "bg-[var(--gold)] text-[var(--gold-foreground)]"
                    : "border border-border text-muted-foreground hover:border-gold/40 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? null : !user ? (
        <div className="mx-4 mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center md:mx-8">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 font-display text-xl">Sign in to see your orders</p>
          <Link
            to="/auth"
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      ) : (orders.data ?? []).length === 0 ? (
        <div className="mx-4 mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center md:mx-8">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 font-display text-xl">No orders yet</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Your recent purchases will appear here.
          </p>
          <Link
            to="/discover"
            className="mt-5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-2 px-4 md:px-8">
          {visible.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
              Nothing in this bucket right now.
            </p>
          )}
          {visible.map((o: any) => {
            const firstItem = (o.order_items ?? [])[0];
            const img = itemImage(o, firstItem?.product_title ?? null);
            const items = (o.order_items ?? [])
              .map((it: any) => `${it.quantity}× ${it.product_title}`)
              .join(", ");
            const open = expanded.has(o.id);
            const canCancel = isActiveStatus(o.status) && !["shipped"].includes(o.status);
            return (
              <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex gap-3">
                  {/* Product face — matched listing image, store logo fallback */}
                  {img && (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-xl border border-border/60 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium">{o.order_number}</p>
                      <p className="font-display text-lg">
                        {formatGHS(o.total, { currency: o.currency })}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {items || (o.store?.name ?? "")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()} · {o.store?.name}
                      {convoByStore.data?.[o.store_id as string] && (
                        <>
                          {" · "}
                          <Link
                            to="/chat/$conversationId"
                            params={{ conversationId: convoByStore.data![o.store_id as string] }}
                            className="font-semibold text-gold hover:underline"
                          >
                            Open chat
                          </Link>
                        </>
                      )}
                      {" · "}
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="font-semibold text-gold hover:underline"
                      >
                        Full details
                      </Link>
                    </p>
                  </div>
                </div>
                {(o.fulfillment_type || o.payment_term) && (
                  <p className="mt-2 flex flex-wrap gap-1">
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
                    {escrowState(o) && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${escrowState(o)!.tone === "sage" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600" : "border-[var(--gold)]/50 bg-[var(--gold)]/10 text-foreground"}`}
                      >
                        {escrowState(o)!.label}
                      </span>
                    )}
                  </p>
                )}

                {/* Track — compact stage line by default; the full timeline
                  opens per-order so 14 pending cards stop towering. */}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
                  <p className="flex items-center gap-2 text-xs">
                    <span
                      aria-hidden
                      className={`h-2 w-2 rounded-full ${o.status === "delivered" ? "bg-emerald-500" : o.status === "cancelled" ? "bg-destructive" : "bg-[var(--gold)]"}`}
                    />
                    <span className="font-semibold capitalize text-foreground">
                      {o.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-muted-foreground">
                      ·{" "}
                      {new Date(o.updated_at || o.created_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </p>
                  <button
                    onClick={() => toggleTrack(o.id)}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                    aria-expanded={open}
                  >
                    {open ? "Hide" : "Track"}{" "}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {open && (
                  <>
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
                          <span className="font-medium text-foreground">
                            {DELIVERY_LABEL[d.status] ?? "Delivery in progress"}
                          </span>
                          {d.dropoff_address && <span>· {d.dropoff_address}</span>}
                          {d.rider?.vehicle_type && (
                            <span>· {String(d.rider.vehicle_type).replace(/_/g, " ")}</span>
                          )}
                        </p>
                      );
                    })()}
                  </>
                )}

                {/* Actions — pending orders the buyer cancels outright (the
                  seller gets the card in chat); paid+ orders ask the seller
                  via the same thread; cancelled/pending can be deleted. */}
                {(isActiveStatus(o.status) && o.status !== "shipped") ||
                o.status === "cancelled" ? (
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    {o.status === "pending" && (
                      <button
                        onClick={() => cancelOrder(o)}
                        disabled={cancelBusy === o.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-60"
                      >
                        {cancelBusy === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        {cancelBusy === o.id ? "Cancelling…" : "Cancel order"}
                      </button>
                    )}
                    {(o.status === "paid" || o.status === "fulfilled") && (
                      <button
                        onClick={() => requestCancellation(o)}
                        disabled={cancelBusy === o.id || cancelSent.has(o.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                          cancelSent.has(o.id)
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                            : "border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
                        } disabled:opacity-60`}
                      >
                        {cancelBusy === o.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : cancelSent.has(o.id) ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : null}
                        {cancelSent.has(o.id)
                          ? "Request sent"
                          : cancelBusy === o.id
                            ? "Sending…"
                            : "Request cancellation"}
                      </button>
                    )}
                    {(o.status === "pending" || o.status === "cancelled") && (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(`Delete order ${o.order_number}? This can't be undone.`)
                          )
                            deleteOrder.mutate(o.id);
                        }}
                        disabled={deleteOrder.isPending && deleteOrder.variables === o.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-60"
                      >
                        {deleteOrder.isPending && deleteOrder.variables === o.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    )}
                  </div>
                ) : null}

                {o.status === "delivered" &&
                  (o.buyer_confirmed_at ? (
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
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
