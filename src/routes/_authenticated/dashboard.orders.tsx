import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, ShoppingCart, Trash2, Sparkles, Check, User } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { orderAssistant, confirmProposal } from "@/lib/ai.functions";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  component: OrdersPage,
});

// Supabase errors surface as plain PostgrestError objects (not Error
// instances) — instanceof-based extraction loses the message.
function errMsg(e: unknown): string {
  if (typeof e === "string") return e;
  return (e as any)?.message ?? "";
}

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
  const runOrdersAi = useServerFn(orderAssistant);
  const confirmProposalFn = useServerFn(confirmProposal);

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
      return (data ?? []) as any[];
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
    onError: (e) => toast.error(errMsg(e) || "Failed"),
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
      const m = errMsg(e);
      toast.error(/row-level|policy|42501/i.test(m) ? "One-time setup needed — run apply-pending-2026-11-14e.sql in Supabase." : m || "Could not delete");
    },
  });

  // Store plan — gates the inline AI bar (Pro only).
  const storeMeta = useQuery({
    queryKey: ["dashboard-orders-store", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("stores")
        .select("id, plan, currency")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as { id: string; plan: string | null; currency: string | null } | null;
    },
  });
  const isProStore = storeMeta.data?.plan === "pro";

  // Buyer chat links — one conversation per (buyer, store); names resolve
  // once the participant-profile policy is applied (apply-pending-11-14d).
  const convoLinks = useQuery({
    queryKey: ["seller-convo-links", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: convos } = await supabase
        .from("conversations")
        .select("id, buyer_id, store_id")
        .eq("seller_id", user!.id);
      const list = (convos ?? []) as any[];
      const buyerIds = [...new Set(list.map((c) => c.buyer_id))];
      let namesById: Record<string, string | null> = {};
      let avatarsById: Record<string, string | null> = {};
      if (buyerIds.length) {
        const { data: names } = await (supabase as any).from("profiles").select("id, full_name, avatar_url").in("id", buyerIds);
        namesById = Object.fromEntries((names ?? []).map((p: any) => [p.id, p.full_name]));
        avatarsById = Object.fromEntries((names ?? []).map((p: any) => [p.id, p.avatar_url]));
      }
      const map: Record<string, string> = {};
      const byId: Record<string, { buyer_id: string; store_id: string }> = {};
      for (const c of list) {
        map[`${c.buyer_id}|${c.store_id}`] = c.id;
        byId[c.id] = { buyer_id: c.buyer_id, store_id: c.store_id };
      }
      return { map, byId, ids: list.map((c) => c.id), namesById, avatarsById };
    },
  });

  // Unresolved AI/buyer proposals from chat — surfaced here so the seller
  // never has to hunt through conversations to action them.
  const proposals = useQuery({
    queryKey: ["order-proposals", user?.id, (convoLinks.data?.ids.length ?? 0)],
    enabled: !!user && (convoLinks.data?.ids.length ?? 0) > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("messages")
        .select("id, conversation_id, body, metadata, created_at")
        .in("conversation_id", convoLinks.data!.ids)
        .or("metadata->>proposal.eq.order,metadata->>proposal.eq.cancel,metadata->>cancel_request.eq.true")
        .is("metadata->>resolved", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Resolve a proposal right from this page — same sequence as the chat-side
  // confirm (write the outcome card + mark the proposal resolved), so both
  // surfaces stay in sync.
  const proposalBusy = useRef(false);
  async function resolveProposal(m: any, decision: "confirmed" | "declined") {
    if (!user || proposalBusy.current) return;
    const md = (m as any).metadata ?? {};
    if (md.resolved) return;
    proposalBusy.current = true;
    try {
      // Shared server fn: place_order (server-priced, floor/stock-checked,
      // idempotent) + status matrix + resolution cards — same path as chat.
      const res: any = await confirmProposalFn({ data: { message_id: m.id, decision } });
      if (res?.order_number && !res?.duplicate) toast.success(`Order #${res.order_number} confirmed`);
      else if (decision === "declined") toast.success("Declined");
      qc.invalidateQueries({ queryKey: ["dashboard-orders"] });
      qc.invalidateQueries({ queryKey: ["order-proposals"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not process the proposal");
    } finally {
      proposalBusy.current = false;
    }
  }

  // ── Inline AI orders bar — no floating orb: the assistant lives in the
  // page header and acts on the seller's orders (Pro only). ──
  const [aiInput, setAiInput] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiActions, setAiActions] = useState<any[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  async function askAi() {
    if (!storeMeta.data?.id || !aiInput.trim() || aiBusy) return;
    setAiBusy(true);
    try {
      const res = (await runOrdersAi({
        data: {
          store_id: storeMeta.data.id,
          instruction: aiInput.trim(),
          orders: (orders.data ?? []).map((o: any) => ({ id: o.id, order_number: o.order_number, status: o.status, total: Number(o.total) })),
        },
      })) as any;
      setAiReply(res.reply ?? "");
      setAiActions(res.actions ?? []);
      setAiInput("");
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(/Pro/.test(m) ? m : "AI assistant unavailable");
    } finally {
      setAiBusy(false);
    }
  }

  async function applyAiAction(a: any) {
    const orderId = String(a.order_id);
    if (a.type === "delete") {
      remove.mutate(orderId);
    } else {
      const o = (orders.data ?? []).find((x: any) => x.id === orderId);
      setStatus.mutate({ id: orderId, status: String(a.status), order: o });
    }
    setAiActions((acts) => acts.filter((x) => !(x.type === a.type && x.order_id === a.order_id)));
  }

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage every order from every channel.</p>

      {/* Inline AI orders bar — no floating button; the assistant lives in
          the page so the seller types, reviews and confirms in one place. */}
      <div className="mt-4 rounded-2xl border border-[var(--gild)]/40 bg-card p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-4 w-4 text-[var(--gild)]" /> AI orders assistant
          {isProStore ? (
            <span className="rounded-full border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gild)]">Pro</span>
          ) : (
            <Link to="/pricing" className="rounded-full border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--gild)] hover:opacity-80">
              ✦ Premium
            </Link>
          )}
        </div>
        {isProStore ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askAi();
              }}
              className="mt-3 flex items-center gap-2"
            >
              <input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder='e.g. "cancel all pending" · "delete the duplicates" · "mark SL-123 shipped"'
                className="w-full rounded-full border border-input bg-background px-4 py-2.5 text-sm outline-none focus:border-ring"
                aria-label="Ask the AI to manage your orders"
              />
              <button type="submit" disabled={aiBusy || !aiInput.trim()} className="shrink-0 rounded-full bg-[var(--gold)] px-4 py-2.5 text-sm font-semibold text-[var(--gold-foreground)] hover:brightness-110 disabled:opacity-50">
                {aiBusy ? "Thinking…" : "Ask AI"}
              </button>
            </form>
            {aiReply && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{aiReply}</p>}
            {aiActions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {aiActions.map((a, i) => (
                  <span key={`${a.type}-${a.order_id}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-3 py-1 text-xs font-medium text-foreground">
                    {a.type === "delete" ? `Delete #${a.order_number}` : `Set #${a.order_number} → ${a.status}`}
                    <button onClick={() => void applyAiAction(a)} className="inline-flex items-center gap-0.5 rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-bold text-[var(--gold-foreground)]">
                      <Check className="h-3 w-3" /> Confirm
                    </button>
                    <button onClick={() => setAiActions((acts) => acts.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground" aria-label="Skip action">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Upgrade to Pro and the AI manages this page for you — "cancel all pending", "delete the duplicates", "mark SL-123 shipped" — every action confirmed before it runs.
          </p>
        )}
      </div>

      {/* AI/buyer proposals from chat — actionable here, no chat-hunting. */}
      {(proposals.data ?? []).length > 0 && (
        <div className="mt-4 space-y-2">
          {(proposals.data ?? []).map((m: any) => {
            const md = m.metadata ?? {};
            const kind: "order" | "cancel" = md.proposal === "cancel" || md.cancel_request ? "cancel" : "order";
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-xs text-foreground">
                  <Sparkles className="mr-1 inline h-3 w-3 text-[var(--gild)]" />
                  {m.body}
                </p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => void resolveProposal(m, "confirmed")} className="inline-flex items-center gap-1 rounded-full bg-[var(--gold)] px-3 py-1 text-[11px] font-bold text-[var(--gold-foreground)] hover:opacity-90">
                    <Check className="h-3 w-3" /> {kind === "cancel" ? "Confirm cancellation" : "Confirm order"}
                  </button>
                  <button onClick={() => void resolveProposal(m, "declined")} className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive">
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
          const convoId = o.buyer_id ? convoLinks.data?.map[`${o.buyer_id}|${o.store_id}`] ?? null : null;
          const buyerName = o.buyer_id ? convoLinks.data?.namesById[o.buyer_id] ?? null : null;
          const buyerAvatar = o.buyer_id ? convoLinks.data?.avatarsById[o.buyer_id] ?? null : null;
          const buyerLabel = buyerName ?? o.contact_email ?? "guest";
          const buyerInitials = buyerName ? buyerName.slice(0, 2).toUpperCase() : null;
          // Cancellation proposals that target THIS order get an action
          // banner right on the card.
          const cardProposals = (proposals.data ?? []).filter((m: any) => m.metadata?.order_id === o.id);
          return (
            <article key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex gap-3">
                {firstOrderImage(o) ? (
                  <img
                    src={firstOrderImage(o)!}
                    alt=""
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
                  />
                ) : (
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-border bg-muted">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">#{o.order_number}</p>
                    <p className="shrink-0 font-display text-lg">{formatGHS(o.total, { currency: o.currency })}</p>
                  </div>
                  {/* Buyer at a glance — avatar + name, chat one tap away. */}
                  <div className="mt-1.5 flex items-center gap-2">
                    {buyerAvatar ? (
                      <img src={buyerAvatar} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border/60" />
                    ) : buyerInitials ? (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--gold)]/15 text-[10px] font-bold uppercase text-[var(--gold)] ring-1 ring-[var(--gold)]/30">
                        {buyerInitials}
                      </span>
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-muted text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <p className="truncate text-sm font-semibold">{buyerLabel}</p>
                    {convoId && (
                      <Link
                        to="/dashboard/chats/$conversationId"
                        params={{ conversationId: convoId }}
                        className="ml-auto shrink-0 rounded-full border border-[var(--gold)]/50 bg-[var(--gold)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--gold)] transition-colors hover:bg-[var(--gold)]/20"
                      >
                        Open chat
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()} · {(o.order_items ?? []).map((it: any) => `${it.quantity}× ${it.product_title}`).join(", ") || "—"}
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
                  {cardProposals.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {cardProposals.map((m: any) => (
                        <div key={m.id} className="flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-2.5 py-1.5">
                          <p className="min-w-0 flex-1 truncate text-[11px] text-foreground">
                            <Sparkles className="mr-1 inline h-3 w-3 text-[var(--gild)]" />
                            {m.metadata?.cancel_request ? "Buyer asked to cancel" : "AI proposed cancellation"}
                          </p>
                          <div className="flex shrink-0 items-center gap-1">
                            <button onClick={() => void resolveProposal(m, "confirmed")} className="inline-flex items-center gap-0.5 rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-bold text-[var(--gold-foreground)]">
                              <Check className="h-2.5 w-2.5" /> Confirm
                            </button>
                            <button onClick={() => void resolveProposal(m, "declined")} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive">
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
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
