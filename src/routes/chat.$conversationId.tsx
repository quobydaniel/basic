import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Send, Sparkles, Image as ImageIcon, CheckCheck, Tag, X, Phone, ChevronRight, ClipboardList, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { draftChatReplies, autoPilotReply, autoPilotReplyRemote, summarizeConversation } from "@/lib/ai.functions";
import { formatGHS } from "@/lib/format";
import { toast } from "sonner";

// WhatsApp brand glyph — lucide dropped brand icons, so inline it.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 002.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export const Route = createFileRoute("/chat/$conversationId")({
  component: ThreadPageRoute,
});

function ThreadPageRoute() {
  const { conversationId } = Route.useParams();
  return <ThreadPage conversationId={conversationId} />;
}

type Msg = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: string;
  body: string | null;
  attachments: any;
  metadata: any;
  created_at: string;
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

// Exported so the seller inbox (/dashboard/chats/$conversationId) can render
// the same thread — role-aware UI keys off conversation.seller_id === user.id.
export function ThreadPage({ conversationId }: { conversationId: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const draft = useServerFn(draftChatReplies);
  const summarize = useServerFn(summarizeConversation);

  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  // Seller's AI recap: a one-glance summary of what the buyer wants, ready
  // to confirm — with a one-tap "create the order" handoff.
  const [recap, setRecap] = useState<any>(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  // True while the store's AI (auto-pilot) is composing its reply — renders
  // the WhatsApp-style typing bubble so the buyer knows the seller got it.
  const [aiTyping, setAiTyping] = useState(false);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderTotal, setOrderTotal] = useState("");
  const [fulfillment, setFulfillment] = useState("meet_in_person");
  const [paymentTerm, setPaymentTerm] = useState("pay_on_delivery");
  const [orderBusy, setOrderBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const convo = useQuery({
    queryKey: ["convo", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations" as any)
        .select("id, buyer_id, seller_id, store_id, product_id, store:stores(id, name, logo_url, slug, plan, auto_pilot, whatsapp_number), product:products(id, slug, title, base_price, currency, product_media(url))")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const msgs = useQuery({
    queryKey: ["msgs", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages" as any)
        .select("id, conversation_id, sender_id, kind, body, attachments, metadata, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any as Msg[];
    },
  });

  // Realtime. removeChannel is async — if a fast effect re-run finds the
  // old channel still subscribed, reuse it rather than re-attaching
  // callbacks (supabase-js throws on that).
  useEffect(() => {
    const topic = `realtime:conv:${conversationId}`;
    if (supabase.getChannels().some((c) => c.topic === topic)) return;
    const ch = supabase
      .channel(`conv:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["msgs", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  // Mark read
  useEffect(() => {
    if (!user || !convo.data) return;
    const isSellerSide = convo.data.seller_id === user.id;
    const patch = isSellerSide ? { unread_seller: 0 } : { unread_buyer: 0 };
    supabase.from("conversations" as any).update(patch).eq("id", conversationId).then(() => {});
  }, [user, convo.data, conversationId, msgs.data?.length]);

  // While this thread is open, every notification pointing at it counts as
  // seen — messages arriving mid-conversation create notifications that would
  // otherwise keep the bell badge lit after you've read everything.
  useEffect(() => {
    if (!user || !convo.data) return;
    supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("payload->>conversation_id", conversationId)
      .is("read_at", null)
      .then(() => {});
  }, [user, convo.data, conversationId, msgs.data?.length]);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs.data?.length, aiTyping]);

  const isSeller = !!(convo.data && user && convo.data.seller_id === user.id);
  const store: any = convo.data?.store ?? null;
  const autoPilotOn = !!(user && isSeller && store?.plan === "pro" && store?.auto_pilot);

  // ── SELLER side: AI drafts / auto-pilot while the seller is online ──
  const lastMsg = msgs.data?.[msgs.data.length - 1];
  const autoRef = useRef<string | null>(null);
  const autoPilot = useServerFn(autoPilotReply);
  useEffect(() => {
    if (!user || !convo.data || !lastMsg) return;
    if (convo.data.seller_id !== user.id) return;
    if (store?.plan !== "pro") return;
    if (lastMsg.sender_id === user.id) return;
    if (autoRef.current === lastMsg.id) return;
    autoRef.current = lastMsg.id;
    if (autoPilotOn) {
      setAiBusy(true);
      autoPilot({ data: { conversation_id: conversationId } })
        .then(() => qc.invalidateQueries({ queryKey: ["msgs", conversationId] }))
        .catch(() => {})
        .finally(() => setAiBusy(false));
    } else {
      setAiBusy(true);
      draft({ data: { conversation_id: conversationId } })
        .then((arr) => setDrafts(arr as string[]))
        .catch(() => {})
        .finally(() => setAiBusy(false));
    }
  }, [user, convo.data, lastMsg, conversationId, draft, autoPilot, autoPilotOn]);

  // ── BUYER side: the offline-seller auto-reply ──
  // When the store runs Pro auto-pilot, the buyer's send pings the server and
  // the store answers as the seller — even if the seller's browser is closed.
  // Fires when the newest message is the buyer's (new sends AND a backlog
  // left unanswered), at most once per message, ~1s in so it feels human.
  const remoteReply = useServerFn(autoPilotReplyRemote);
  const pilotFiredRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user || !convo.data || !lastMsg || isSeller) return;
    if (store?.plan !== "pro" || !store?.auto_pilot) return;
    if (lastMsg.sender_id !== user.id) return;
    if (pilotFiredRef.current.has(lastMsg.id)) return;
    pilotFiredRef.current.add(lastMsg.id);
    const t = setTimeout(() => {
      setAiTyping(true);
      remoteReply({ data: { conversation_id: conversationId } })
        .then(() => qc.invalidateQueries({ queryKey: ["msgs", conversationId] }))
        .catch(() => {}) // silent by design — the seller's AI failing must never look like the buyer's fault
        .finally(() => setAiTyping(false));
    }, 1000);
    return () => clearTimeout(t);
  }, [user, convo.data, lastMsg, isSeller, conversationId, remoteReply, qc]);

  // Toggle: seller flips the store's auto-pilot from the thread header.
  const pilotBusy = useRef(false);
  async function toggleAutoPilot() {
    if (!user || !convo.data || pilotBusy.current) return;
    const storeId = store?.id;
    const next = !store?.auto_pilot;
    if (!storeId) return;
    pilotBusy.current = true;
    try {
      const { error } = await supabase.from("stores" as any).update({ auto_pilot: next }).eq("id", storeId);
      if (error) throw error;
      toast.success(next ? "AI auto-pilot is ON — it will reply, take orders and alert you." : "AI auto-pilot is OFF — back to drafts.");
      qc.invalidateQueries({ queryKey: ["convo", conversationId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change auto-pilot");
    } finally {
      pilotBusy.current = false;
    }
  }

  async function send(body: string) {
    if (!body.trim() || !user) return;
    setText("");
    setDrafts([]);
    const { error } = await supabase
      .from("messages" as any)
      .insert({ conversation_id: conversationId, sender_id: user.id, kind: "text", body: body.trim() });
    if (error) {
      toast.error(error.message);
      setText(body); // restore the typed message so it isn't lost
    } else qc.invalidateQueries({ queryKey: ["msgs", conversationId] });
  }

  async function suggestReplies() {
    setAiBusy(true);
    try {
      const arr = await draft({ data: { conversation_id: conversationId } });
      setDrafts(arr as string[]);
    } catch {
      toast.error("AI unavailable");
    } finally {
      setAiBusy(false);
    }
  }

  // SELLER: AI recap of the whole conversation — what was agreed, what's
  // open, and the recommended next move. One tap to create the order with
  // the agreed details prefilled.
  async function loadRecap() {
    if (recapBusy) return;
    setRecapBusy(true);
    setShowRecap(true);
    try {
      const r = await summarize({ data: { conversation_id: conversationId } });
      setRecap(r);
      if (r.qty > 0 && r.price > 0 && !orderTotal) setOrderTotal(String(r.qty * r.price));
    } catch (e) {
      setShowRecap(false);
      toast.error(e instanceof Error ? e.message : "AI recap unavailable");
    } finally {
      setRecapBusy(false);
    }
  }

  // SELLER: create an order from the conversation
  async function createOrder() {
    if (!user || !convo.data) return;
    const total = Number(orderTotal.replace(/[^0-9.]/g, ""));
    if (!total || total <= 0) return toast.error("Enter the agreed total");
    setOrderBusy(true);
    try {
      const { data: order, error: oErr } = await supabase
        .from("orders" as any)
        .insert({
          store_id: convo.data.store_id,
          buyer_id: convo.data.buyer_id,
          status: "pending",
          total,
          currency: convo.data.product?.currency ?? "GHS",
          source: "chat",
          fulfillment_type: fulfillment,
          payment_term: paymentTerm,
        })
        .select("id, order_number")
        .single() as any;
      if (oErr) throw oErr;
      await supabase.from("messages" as any).insert({
        conversation_id: conversationId,
        sender_id: user.id,
        kind: "system_order",
        body: `Order ${order.order_number} created — GH₵${total.toFixed(2)} · ${fulfillment.replace(/_/g, " ")} · ${paymentTerm.replace(/_/g, " ")}`,
        metadata: { order_id: order.id },
      });
      if (!convo.data.order_id) {
        await supabase.from("conversations" as any).update({ order_id: order.id }).eq("id", conversationId);
      }
      setShowOrderPanel(false);
      toast.success(`Order ${order.order_number} created`);
      qc.invalidateQueries({ queryKey: ["msgs", conversationId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create order");
    } finally {
      setOrderBusy(false);
    }
  }

  async function uploadImage(file: File) {
    if (!user) return;
    const path = `${conversationId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { data: signed } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!signed?.signedUrl) return toast.error("Could not attach image — try again");
    const { error: insErr } = await supabase.from("messages" as any).insert({
      conversation_id: conversationId,
      sender_id: user.id,
      kind: "image",
      body: null,
      attachments: [{ url: signed.signedUrl, path }],
    });
    if (insErr) return toast.error(insErr.message);
    qc.invalidateQueries({ queryKey: ["msgs", conversationId] });
  }

  const product = convo.data?.product;
  const productImage = product?.product_media?.[0]?.url;

  // Seller contacts — whatever the seller saved in their storefront settings
  // (WhatsApp number) powers both Call and WhatsApp for the buyer. No number
  // saved → the buttons simply don't show.
  const rawWa = store?.whatsapp_number as string | null | undefined;
  const waDigits = rawWa ? rawWa.replace(/\D/g, "").replace(/^0/, "233") : null;
  const waText = encodeURIComponent(
    `Hi ${convo.data?.store?.name ?? ""}, I'm messaging about "${product?.title ?? "your listing"}" on BASIC.`,
  );

  // Group messages with day separators
  const items: Array<{ type: "day"; label: string } | { type: "msg"; m: Msg }> = [];
  let lastDay = "";
  for (const m of msgs.data ?? []) {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) {
      items.push({ type: "day", label: day });
      lastDay = day;
    }
    items.push({ type: "msg", m });
  }

  // Buyer icebreakers (Jiji-style) — only while the conversation is fresh.
  // msgs.isLoading is gated too: while loading, length reads 0 and the chips
  // would flash on threads that aren't actually fresh.
  const showIcebreakers = !isSeller && !msgs.isLoading && (msgs.data?.length ?? 0) <= 1 && !aiTyping;
  const icebreakers = ["Is this still available?", "Do you deliver? Where to?", "What's your best price?"];

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header — Jiji-style: who you're talking to, presence, one-tap call/WhatsApp */}
      <header className="z-10 flex items-center gap-2.5 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
        {/* History-aware back: a thread opened from a product page returns
            there; one opened from the inbox returns to the inbox. Fallback
            is the role's inbox (mobile has no other way out of the thread). */}
        <button
          onClick={() => {
            const idx = (window.history.state as any)?.idx ?? 0;
            if (idx > 0) window.history.back();
            else navigate({ to: isSeller ? "/dashboard/chats" : "/chat" });
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-accent"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-gold/30">
          {convo.data?.store?.logo_url && <img src={convo.data.store.logo_url} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 font-semibold leading-tight">{convo.data?.store?.name ?? "…"}</p>
          <p className={`text-[11px] leading-tight ${aiTyping ? "font-medium text-gold" : "text-muted-foreground"}`}>
            {aiTyping
              ? "typing…"
              : isSeller
                ? "Buyer conversation"
                : store?.plan === "pro" && store?.auto_pilot
                  ? "AI assistant on duty — replies fast"
                  : "Usually replies within minutes"}
          </p>
        </div>
        {/* Buyer: direct contact actions from the header (Jiji's ad-chat pattern) */}
        {!isSeller && waDigits && (
          <div className="flex shrink-0 items-center gap-0.5">
            <a
              href={`tel:+${waDigits}`}
              aria-label="Call the seller"
              title="Call"
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Phone className="h-[18px] w-[18px]" />
            </a>
            <a
              href={`https://wa.me/${waDigits}?text=${waText}`}
              target="_blank"
              rel="noreferrer"
              aria-label="WhatsApp the seller"
              title="WhatsApp"
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-[#25D366]"
            >
              <WhatsAppIcon className="h-[18px] w-[18px]" />
            </a>
          </div>
        )}
        {/* Seller: AI auto-pilot switch — Pro stores only */}
        {isSeller && store?.plan === "pro" && (
          <button
            type="button"
            onClick={toggleAutoPilot}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              store?.auto_pilot
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title="When ON, the AI replies to buyers, takes orders and alerts you — even while you're away."
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Auto-pilot</span> {store?.auto_pilot ? "ON" : "OFF"}
          </button>
        )}
      </header>

      {/* Product context card — tap anywhere to open the listing */}
      {product && (
        <Link
          to="/s/$storeSlug/p/$productSlug"
          params={{ storeSlug: convo.data.store.slug, productSlug: product.slug }}
          className="z-10 flex items-center gap-3 border-b border-border bg-card px-3 py-2.5 transition-colors hover:bg-accent/60"
        >
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-muted">
            {productImage && <img src={productImage} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-sm font-medium">{product.title}</p>
            <p className="text-xs font-semibold text-gold">{formatGHS(product.base_price, { currency: product.currency })}</p>
          </div>
          <span className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
            View <ChevronRight className="mb-0.5 inline h-3 w-3" />
          </span>
        </Link>
      )}

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto bg-[color-mix(in_oklab,var(--background)_92%,var(--primary)_8%)] px-3 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
          {msgs.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>}
          {!msgs.isLoading && (msgs.data ?? []).length === 0 && (
            <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-card/90 p-5 text-center shadow-sm">
              <p className="font-display text-lg">Say hello 👋</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask about availability, price, or delivery — sellers reply fast here.
              </p>
            </div>
          )}
          {items.map((it, idx) => {
            if (it.type === "day") {
              return (
                <div key={`day-${idx}`} className="my-3 flex justify-center">
                  <span className="rounded-full bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                    {it.label}
                  </span>
                </div>
              );
            }
            const m = it.m;
            const mine = m.sender_id === user?.id;
            if (m.kind === "system_order" || m.kind === "system_delivery") {
              return (
                <div key={m.id} className="mx-auto my-1 max-w-sm rounded-2xl border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-4 py-2.5 text-center">
                  <p className="text-xs font-medium">{m.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  {isSeller && (m as any).metadata?.order_id && (
                    <Link to="/dashboard/orders" className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--gold)] px-3 py-1 text-[11px] font-bold text-[var(--gold-foreground)] hover:opacity-90">
                      Confirm / update order →
                    </Link>
                  )}
                </div>
              );
            }
            // Consecutive messages from the same sender stack tighter, with
            // the tail only on the last bubble of the run (WhatsApp pattern).
            const nextMsg = items[idx + 1];
            const lastOfRun = !(nextMsg && nextMsg.type === "msg" && nextMsg.m.sender_id === m.sender_id && nextMsg.m.kind !== "system_order" && nextMsg.m.kind !== "system_delivery");
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2 text-[15px] leading-snug shadow-sm ${
                    mine
                      ? `bg-[var(--gold)] text-[var(--gold-foreground)] ${lastOfRun ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-br-md rounded-tr-md"}`
                      : `border border-border/60 bg-card text-foreground ${lastOfRun ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-bl-md rounded-tl-md"}`
                  }`}
                >
                  {m.kind === "image" && Array.isArray(m.attachments) && m.attachments[0]?.url && (
                    <img src={m.attachments[0].url} alt="" className="mb-1 max-h-64 rounded-xl" />
                  )}
                  {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                  <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-[var(--gold-foreground)]/70" : "text-muted-foreground"}`}>
                    {/* Seller visibility: mark the messages the AI wrote on
                        the seller's behalf (metadata.ai set by the engine). */}
                    {isSeller && mine && (m as any).metadata?.ai && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-black/10 px-1.5 py-px font-semibold" title="Sent by your AI auto-pilot">
                        <Sparkles className="h-2.5 w-2.5" /> AI
                      </span>
                    )}
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {mine && <CheckCheck className="h-3 w-3" aria-label="Delivered" />}
                  </span>
                </div>
              </div>
            );
          })}
          {/* Store AI is typing — WhatsApp-style bubble */}
          {aiTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3 shadow-sm" aria-label="Seller is typing">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SELLER: AI recap — what the buyer wants, ready to confirm.
          Hidden while the thread is empty (nothing to summarize). */}
      {isSeller && !showRecap && (msgs.data?.length ?? 0) > 0 && (
        <div className="border-t border-border bg-card/60 px-3 py-1.5 backdrop-blur">
          <button
            onClick={loadRecap}
            disabled={recapBusy}
            className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold text-[var(--gold)] hover:bg-accent disabled:opacity-50"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {recapBusy ? "Summarizing…" : "AI recap of this chat"}
          </button>
        </div>
      )}
      {isSeller && showRecap && (
        <div className="border-t border-border bg-card px-3 py-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5 text-[var(--gold)]" /> AI recap
            </p>
            <button onClick={() => setShowRecap(false)} aria-label="Close recap" className="grid h-6 w-6 place-items-center rounded-full hover:bg-accent">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {recapBusy && !recap && (
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the conversation…
            </p>
          )}
          {recap && (
            <div className="mt-2 space-y-2.5">
              <p className="text-sm leading-relaxed">{recap.summary}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-background/60 p-3 text-xs sm:grid-cols-3">
                <p><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Item</span>{recap.item || "-"}</p>
                <p><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Qty</span>{recap.qty > 0 ? recap.qty : "-"}</p>
                <p><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Agreed price</span>{recap.price > 0 ? formatGHS(recap.price, { currency: product?.currency ?? "GHS" }) : "-"}</p>
                <p><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Delivery</span>{recap.delivery || "-"}</p>
                <p><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Payment</span>{recap.payment || "-"}</p>
                <p><span className="block text-[10px] uppercase tracking-wide text-muted-foreground">Status</span>{recap.status || "-"}</p>
              </div>
              {recap.open_questions?.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                  {recap.open_questions.map((q: string, i: number) => <li key={i}>{q}</li>)}
                </ul>
              )}
              {recap.next_action && (
                <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Next:</span> {recap.next_action}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  onClick={() => {
                    if (recap.price > 0) setOrderTotal(String(recap.qty > 1 ? recap.qty * recap.price : recap.price));
                    setShowOrderPanel(true);
                    setShowRecap(false);
                  }}
                  className="rounded-full bg-[var(--gold)] px-4 py-1.5 text-xs font-bold text-[var(--gold-foreground)] hover:opacity-90"
                >
                  Create order with these details
                </button>
                <button
                  onClick={() => {
                    setShowRecap(false);
                    void suggestReplies();
                  }}
                  className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted-foreground hover:border-gold/50 hover:text-gold"
                >
                  Draft a reply instead
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Draft chips — seller-side AI only. Buyers have no AI in their chat. */}
      {isSeller && drafts.length > 0 && (
        <div className="border-t border-border bg-card/60 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3 text-gold" /> AI reply drafts
            </p>
            <button onClick={() => setDrafts([])} aria-label="Clear drafts" className="grid h-6 w-6 place-items-center rounded-full hover:bg-accent">
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="mt-1 flex gap-2 overflow-x-auto">
            {drafts.map((d, i) => (
              <button
                key={i}
                onClick={() => {
                  send(d);
                  setDrafts([]);
                }}
                className="max-w-xs whitespace-normal rounded-2xl border border-border bg-background px-3 py-2 text-left text-xs hover:border-primary"
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Seller: create order panel */}
      {showOrderPanel && (
        <div className="border-t border-border bg-card px-3 py-3">
          <div className="mx-auto max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Create order</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={orderTotal}
                onChange={(e) => setOrderTotal(e.target.value)}
                inputMode="decimal"
                placeholder={`Total (${convo.data?.product?.currency ?? "GHS"})`}
                className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              />
              <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value)} className="rounded-xl border border-input bg-background px-3 py-2.5 text-sm" aria-label="Fulfillment">
                <option value="meet_in_person">🤝 Meet in person</option>
                <option value="visit_shop">🏪 Visit shop</option>
                <option value="delivery">🛵 Delivery</option>
              </select>
              <select value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} className="col-span-2 rounded-xl border border-input bg-background px-3 py-2.5 text-sm" aria-label="Payment terms">
                <option value="pay_on_delivery">Pay on delivery</option>
                <option value="pay_before_delivery">Pay before delivery</option>
                <option value="escrow">Escrow</option>
              </select>
              <div className="col-span-2 flex gap-2">
                <button onClick={createOrder} disabled={orderBusy} className="flex-1 rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {orderBusy ? "Creating…" : "Create order"}
                </button>
                <button onClick={() => setShowOrderPanel(false)} className="rounded-full border border-border px-5 py-2.5 text-sm hover:bg-accent">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BUYER: icebreaker chips (Jiji) while the conversation is fresh */}
      {showIcebreakers && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-border bg-card/60 px-3 py-2 backdrop-blur">
          {icebreakers.map((chip) => (
            <button
              key={chip}
              onClick={() => send(chip)}
              className="shrink-0 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs text-foreground transition-colors hover:border-gold/60 hover:text-gold"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Buyer: make offer panel — removed. No AI in the buyer chat; offers
          come from the product-page quick chips as plain prefilled text. */}

      {/* Composer */}
      <div className="border-t border-border bg-background px-3 pb-2 pt-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-2xl items-end gap-1.5">
          <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-accent" aria-label="Attach image">
            <ImageIcon className="h-5 w-5" />
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
          </label>
          {isSeller && (
            <>
              <button
                onClick={suggestReplies}
                disabled={aiBusy}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--gold)] hover:bg-accent disabled:opacity-50"
                aria-label="AI suggest replies"
                title="AI reply drafts"
              >
                <Sparkles className="h-5 w-5" />
              </button>
              <button
                onClick={() => {
                  setShowOrderPanel((v) => !v);
                  if (!orderTotal && product?.base_price) setOrderTotal(String(product.base_price));
                }}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-accent ${showOrderPanel ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                aria-label="Create order"
                title="Create order"
              >
                <Tag className="h-5 w-5" />
              </button>
            </>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            rows={1}
            placeholder="Message…"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-3xl border border-input bg-card px-4 py-2.5 text-[15px] outline-none focus:border-ring"
          />
          <button
            onClick={() => send(text)}
            disabled={!text.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] transition hover:brightness-110 disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
