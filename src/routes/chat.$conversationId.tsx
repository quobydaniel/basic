import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowDown, Send, Sparkles, Image as ImageIcon, CheckCheck, Tag, X, Phone, ClipboardList, Loader2, MoreVertical, RotateCcw, Package, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { autoPilotReply, autoPilotReplyRemote, summarizeConversation } from "@/lib/ai.functions";
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

// Presence badge — the tiny dot pinned to the avatar's corner (WhatsApp
// pattern). Champagne for the AI, emerald for a live human. Rendered
// OUTSIDE the avatar's overflow-hidden wrapper so it isn't clipped.
function PresenceBadge({ kind }: { kind: "ai" | "online" }) {
  return (
    <span
      aria-hidden
      title={kind === "ai" ? "AI assistant on duty" : "Online now"}
      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background ${
        kind === "ai" ? "bg-gild" : "bg-emerald-500"
      }`}
    />
  );
}

// Human "last seen" — granular where it matters, honest where it doesn't.
function lastSeenLabel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `today at ${new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

export const Route = createFileRoute("/chat/$conversationId")({
  component: ThreadPageRoute,
});

function ThreadPageRoute() {
  const { conversationId } = Route.useParams();
  // Key by conversation: switching chats must reset per-thread UI state
  // (AI recap panel, tools menu, order panel, composer draft) — without
  // the key, chat A's recap card follows you into chat B.
  return <ThreadPage key={conversationId} conversationId={conversationId} />;
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
  const summarize = useServerFn(summarizeConversation);

  const [text, setText] = useState("");
  // Seller's AI recap: a one-glance summary of what the buyer wants, ready
  // to confirm — with a one-tap "create the order" handoff.
  const [recap, setRecap] = useState<any>(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // True while the store's AI (auto-pilot) is composing its reply — the
  // buyer sees the WhatsApp-style typing bubble; the watching seller sees
  // "AI is replying…" in the header. Cleared only when the reply message
  // actually lands (below), never on request-settle.
  const [aiTyping, setAiTyping] = useState(false);
  // The message the AI is currently answering — the bubble holds until a
  // NEWER message than this one arrives.
  const replyAwaitRef = useRef<string | null>(null);
  // Count of engine calls genuinely in flight — the bubble lives exactly as
  // long as the AI is actually working, not a fixed guess at its latency.
  const pilotPendingRef = useRef(0);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderTotal, setOrderTotal] = useState("");
  const [fulfillment, setFulfillment] = useState("meet_in_person");
  const [paymentTerm, setPaymentTerm] = useState("pay_on_delivery");
  const [orderBusy, setOrderBusy] = useState(false);
  // Optimistic sends: bubble appears instantly, flips to a retry state if
  // the insert fails — no more messages lost to a dead connection.
  const [outbox, setOutbox] = useState<{ id: string; body: string; failed?: boolean }[]>([]);
  // Staged image attachment: preview + remove BEFORE it uploads (send button
  // commits it). null = nothing staged.
  const [attach, setAttach] = useState<{ file: File; url: string } | null>(null);
  // Full-screen image viewer (tap an image message to open).
  const [lightbox, setLightbox] = useState<string | null>(null);
  // Reader is at (or near) the bottom — gates auto-scroll and the
  // jump-to-latest pill so reading history is never yanked away.
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const convo = useQuery({
    queryKey: ["convo", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations" as any)
        .select("id, buyer_id, seller_id, store_id, product_id, order_id, store:stores(id, name, logo_url, slug, plan, auto_pilot, whatsapp_number), product:products(id, slug, title, base_price, currency, product_media(url))")
        .eq("id", conversationId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const isSeller = !!(convo.data && user && convo.data.seller_id === user.id);

  // The party on the other side — the seller header shows the buyer's name
  // and avatar, and BOTH headers read the other party's last_seen_at for
  // the online / last-seen presence line. Fetched separately from profiles
  // (same best-effort pattern as ChatList); degrades silently when the
  // last_seen_at column hasn't been migrated yet.
  const otherId: string | null = convo.data ? (isSeller ? convo.data.buyer_id : convo.data.seller_id) : null;
  const otherProfile = useQuery({
    queryKey: ["convo-other", otherId],
    enabled: !!otherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles" as any)
        .select("full_name, avatar_url, last_seen_at")
        .eq("id", otherId)
        .maybeSingle();
      if (error) return null;
      return (data ?? null) as any;
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

  // Auto-scroll — only when the reader is already at the bottom; otherwise
  // the jump-to-latest pill takes over (scrolling someone away from history
  // they're reading is hostile).
  useEffect(() => {
    if (listRef.current && atBottom) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs.data?.length, aiTyping, outbox.length, atBottom]);

  // Esc closes the image viewer.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const store: any = convo.data?.store ?? null;
  const autoPilotOn = !!(user && isSeller && store?.plan === "pro" && store?.auto_pilot);

  // ── Presence: is the other party online right now? ──
  // last_seen_at is heartbeated by every signed-in client (session.ts); a
  // beat within the last 90 seconds counts as online. The clock ticks every
  // 30s so the "Last seen" label ages correctly while you watch.
  const [, setPresenceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPresenceTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const otherSeenAt = otherProfile.data?.last_seen_at as string | null | undefined;
  const otherOnline = !!otherSeenAt && Date.now() - new Date(otherSeenAt).getTime() < 90_000;
  const aiOnDuty = !isSeller && store?.plan === "pro" && store?.auto_pilot === true;

  // ── SELLER side: auto-pilot runs while the seller watches the thread ──
  // (Offline coverage is the buyer-triggered remote path below.) When
  // auto-pilot is OFF the seller simply replies by typing — no AI drafts.
  const lastMsg = msgs.data?.[msgs.data.length - 1];
  const autoRef = useRef<string | null>(null);
  const autoPilot = useServerFn(autoPilotReply);
  useEffect(() => {
    if (!user || !convo.data || !lastMsg) return;
    if (convo.data.seller_id !== user.id) return;
    if (!autoPilotOn) return;
    if (lastMsg.sender_id === user.id) return;
    // Null sender = system card (the AI's own proposal/cancel notice) —
    // answering our own output would self-loop and show a phantom
    // "AI is replying…" bubble.
    if (!lastMsg.sender_id) return;
    if (autoRef.current === lastMsg.id) return;
    autoRef.current = lastMsg.id;
    setAiTyping(true);
    replyAwaitRef.current = lastMsg.id;
    pilotPendingRef.current++;
    autoPilot({ data: { conversation_id: conversationId } })
      .catch(() => {}) // the bubble-clear effect below owns turning it off
      .finally(() => {
        pilotPendingRef.current--;
        qc.invalidateQueries({ queryKey: ["msgs", conversationId] });
      });
  }, [user, convo.data, lastMsg, conversationId, autoPilot, autoPilotOn]);

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
    setAiTyping(true);
    replyAwaitRef.current = lastMsg.id;
    // Fire immediately — the 1s "feels human" delay read as broken lag, and
    // a refetch inside that window cancelled the timer entirely (the reply
    // only showed up after a page refresh). Invalidate in .finally: even a
    // refused run (heartbeat/seller answered first) must refetch the thread.
    pilotPendingRef.current++;
    remoteReply({ data: { conversation_id: conversationId } })
      .catch(() => {}) // silent by design — the seller's AI failing must never look like the buyer's fault
      .finally(() => {
        pilotPendingRef.current--;
        qc.invalidateQueries({ queryKey: ["msgs", conversationId] });
      });
  }, [user, convo.data, lastMsg, isSeller, conversationId, remoteReply, qc, meta]);

  // The typing bubble must OUTLIVE the request: the reply message only
  // renders after a refetch round-trip (and a dedupe response can return
  // while the other path's reply is still in flight). Hold the bubble
  // until a message NEWER than the trigger actually lands — with a 30s
  // cap so a dead AI never leaves it spinning forever.
  useEffect(() => {
    if (!aiTyping || !replyAwaitRef.current || !lastMsg) return;
    if (lastMsg.id === replyAwaitRef.current) return;
    // A newer message from THIS user while the AI is still drafting just
    // extends the wait (rapid-fire "hi hi hi" must not kill the bubble) —
    // only a message from the other side means the reply has landed.
    if (lastMsg.sender_id === user?.id) {
      replyAwaitRef.current = lastMsg.id;
      return;
    }
    replyAwaitRef.current = null;
    setAiTyping(false);
  }, [aiTyping, lastMsg, user]);

  // ── SELLER side: automatic recap on AI deals ──
  // When the AI proposes an order (system_order proposal card), the recap
  // panel opens by itself — the seller confirms the deal without hunting
  // through the ⋮ menu.
  const recapAutoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isSeller || !lastMsg) return;
    if (lastMsg.kind !== "system_order") return;
    if ((lastMsg.metadata as Record<string, unknown> | null)?.proposal !== "order") return;
    if (recapAutoRef.current === lastMsg.id) return;
    recapAutoRef.current = lastMsg.id;
    loadRecap();
  }, [isSeller, lastMsg]);
  // Hard-stops the bubble when the engine is NOT working: while a run is
  // actually in flight the bubble stays (NVIDIA can take 40s + OpenRouter
  // fallback after it); once settled with no reply, give the 2.5s polling
  // above a moment to surface a reply delivered by another surface, then
  // retire it. 3-minute ceiling kills a truly wedged engine.
  useEffect(() => {
    if (!aiTyping) return;
    const started = Date.now();
    let settledAt = 0;
    const iv = setInterval(() => {
      if (pilotPendingRef.current > 0) {
        settledAt = 0;
        if (Date.now() - started > 180_000) {
          replyAwaitRef.current = null;
          setAiTyping(false);
        }
        return;
      }
      if (!settledAt) settledAt = Date.now();
      if (Date.now() - settledAt > 6000) {
        replyAwaitRef.current = null;
        setAiTyping(false);
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [aiTyping]);

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
      toast.success(next ? "AI auto-pilot is ON — it will reply, take orders and alert you." : "AI auto-pilot is OFF — you reply yourself.");
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
    const tmpId = crypto.randomUUID();
    setOutbox((o) => [...o, { id: tmpId, body: body.trim() }]);
    const { error } = await supabase
      .from("messages" as any)
      .insert({ conversation_id: conversationId, sender_id: user.id, kind: "text", body: body.trim() });
    if (error) {
      // Keep the bubble on screen, marked failed — retry or discard there.
      setOutbox((o) => o.map((m) => (m.id === tmpId ? { ...m, failed: true } : m)));
      toast.error(error.message);
    } else {
      setOutbox((o) => o.filter((m) => m.id !== tmpId));
      qc.invalidateQueries({ queryKey: ["msgs", conversationId] });
    }
  }

  function retrySend(m: { id: string; body: string }) {
    setOutbox((o) => o.filter((x) => x.id !== m.id));
    void send(m.body);
  }

  function discardFailed(id: string) {
    setOutbox((o) => o.filter((x) => x.id !== id));
  }

  // Composer commit: a staged image goes first, then any typed text — the
  // two arrive as separate messages, WhatsApp-style.
  async function commitComposer() {
    const staged = attach;
    const body = text;
    if (staged) {
      URL.revokeObjectURL(staged.url);
      setAttach(null);
      await sendAttachment(staged.file);
    }
    if (body.trim()) void send(body);
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

  // Commit the staged attachment: upload → signed URL → image message.
  async function sendAttachment(file: File) {
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
  // Chips only while the buyer hasn't spoken yet — counting messages was
  // wrong: right after the first send the thread has 1 message and the
  // chips would stick around under the sent bubble.
  const buyerSpoke = !!(msgs.data ?? []).some((m: { sender_id: string | null }) => m.sender_id === user?.id);
  const showIcebreakers = !isSeller && !msgs.isLoading && !buyerSpoke && !aiTyping;

  // ── Smart preset questions (buyer favs + history) ──
  // Chips grounded in this buyer's REAL data for this store — a pending
  // order becomes "Where is my order #…", a past order becomes "Reorder…",
  // a favorited product becomes "Is X still available?" — with the Jiji-
  // style generic three filling the rest. New buyers just see the generic.
  const iceQ = useQuery({
    queryKey: ["chat-icebreakers", convo.data?.buyer_id, convo.data?.store_id],
    enabled: !isSeller && !!convo.data?.buyer_id && !!convo.data?.store_id,
    queryFn: async () => {
      const buyerId = convo.data!.buyer_id;
      const storeId = convo.data!.store_id;
      const [ordersQ, favsQ] = await Promise.all([
        supabase
          .from("orders")
          .select("order_number, status")
          .eq("buyer_id", buyerId)
          .eq("store_id", storeId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("favorites")
          .select("product:products!inner(id, title, store_id)")
          .eq("user_id", buyerId)
          .eq("product.store_id", storeId)
          .limit(5),
      ]);
      const orders = (ordersQ.data as { order_number: string | number; status: string }[] | null) ?? [];
      const favs = (favsQ.data as unknown as { product: { title: string } }[] | null) ?? [];
      return {
        pending: orders.find((o) => o.status === "pending")?.order_number ?? null,
        lastOrder: orders[0]?.order_number ?? null,
        favTitle: favs[0]?.product?.title ?? null,
      };
    },
  });
  const icebreakers = [
    iceQ.data?.pending ? `Where is my order #${iceQ.data.pending}?` : null,
    iceQ.data?.lastOrder && !iceQ.data.pending ? `Reorder my last order — #${iceQ.data.lastOrder}` : null,
    iceQ.data?.favTitle ? `Is ${iceQ.data.favTitle} still available?` : null,
    "Is this still available?",
    "Do you deliver? Where to?",
    "What's your best price?",
  ].filter(Boolean).slice(0, 4) as string[];

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header — who you're talking to, presence, one-tap contact.
          Buyer sees the store; seller sees the buyer (never their own
          storefront staring back at them). */}
      <header className="z-20 flex items-center gap-2.5 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
        {/* History-aware back: a thread opened from a product page returns
            there; one opened from the inbox returns to the inbox. Fallback
            is the role's inbox (mobile has no other way out of the thread). */}
        <button
          onClick={() => {
            const idx = (window.history.state as any)?.idx ?? 0;
            if (idx > 0) window.history.back();
            else navigate({ to: isSeller ? "/dashboard/chats" : "/chat" });
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-accent md:hidden"
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {isSeller ? (
          <div className="relative shrink-0">
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[var(--gold)]/15 text-sm font-bold text-[var(--gold)] ring-1 ring-gold/30">
              {otherProfile.data?.avatar_url ? (
                <img src={otherProfile.data.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                ((otherProfile.data?.full_name ?? "B").trim().charAt(0).toUpperCase() || "B")
              )}
            </div>
            {otherOnline && <PresenceBadge kind="online" />}
          </div>
        ) : (
          <div className="relative shrink-0">
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-[var(--gold)]/15 font-display text-sm font-bold text-[var(--gold)] ring-1 ring-gold/30">
              {convo.data?.store?.logo_url ? (
                <img src={convo.data.store.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                ((convo.data?.store?.name ?? "S").trim().charAt(0).toUpperCase() || "S")
              )}
            </div>
            {aiOnDuty && <PresenceBadge kind="ai" />}
            {!aiOnDuty && otherOnline && <PresenceBadge kind="online" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 font-semibold leading-tight">
            {isSeller ? otherProfile.data?.full_name || "Buyer" : convo.data?.store?.name ?? "…"}
          </p>
          <p className={`flex items-center gap-1.5 text-[11px] leading-tight ${aiTyping ? "font-medium text-gild" : "text-muted-foreground"}`}>
            {/* Presence line — four honest states: typing, AI on duty,
                online now, last seen. The dot carries the state: gold pulse
                while typing, champagne for the AI, emerald for a live
                human, muted grey when away. */}
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                aiTyping
                  ? "animate-pulse bg-gild"
                  : aiOnDuty
                    ? "bg-gild"
                    : otherOnline
                      ? "bg-emerald-500"
                      : otherSeenAt
                        ? "bg-muted-foreground/50"
                        : "bg-gold/60"
              }`}
            />
            {aiTyping
              ? isSeller ? "AI is replying…" : "typing…"
              : aiOnDuty
                ? otherOnline
                  ? "✦ AI on duty — the seller is online too"
                  : "✦ AI on duty — replies in seconds"
                : otherOnline
                  ? "Online now"
                  : otherSeenAt
                    ? `Last seen ${lastSeenLabel(otherSeenAt)}`
                    : isSeller
                      ? "Buyer conversation"
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
                ? "border-gold/50 bg-gold/10 text-gold"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title="When ON, the AI replies to buyers, takes orders and alerts you — even while you're away."
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Auto-pilot</span> {store?.auto_pilot ? "ON" : "OFF"}
          </button>
        )}
        {/* Chat tools — ⋮ for BOTH roles. Sellers get AI recap + create order;
            buyers get the order/listing shortcuts the header can't fit. The
            composer row carries nothing but chat. */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent"
            aria-label="Chat actions"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <button
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                tabIndex={-1}
              />
              <div className="absolute right-0 top-10 z-40 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                {isSeller && (msgs.data?.length ?? 0) > 0 && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      loadRecap();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-accent"
                  >
                    <ClipboardList className="h-4 w-4 shrink-0 text-[var(--gild)]" /> AI recap of this chat
                  </button>
                )}
                {isSeller && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      if (!orderTotal && product?.base_price) setOrderTotal(String(product.base_price));
                      setShowOrderPanel(true);
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-accent"
                  >
                    <Tag className="h-4 w-4 shrink-0 text-[var(--gold)]" /> Create order
                  </button>
                )}
                {!isSeller && convo.data?.order_id && (
                  <Link
                    to="/orders"
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-accent"
                  >
                    <Package className="h-4 w-4 shrink-0 text-[var(--gold)]" /> View your order
                  </Link>
                )}
                {!isSeller && product && (
                  <Link
                    to="/s/$storeSlug/p/$productSlug"
                    params={{ storeSlug: convo.data.store.slug, productSlug: product.slug }}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm hover:bg-accent"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0 text-[var(--gold)]" /> Open the listing
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Product context — a floating card on the thread tint (no full-bleed
          strip). Sits pinned above the messages; tap to open the listing. */}
      {product && (
        <div className="z-10 bg-[color-mix(in_oklab,var(--background)_92%,var(--primary)_8%)] px-2.5 pb-1 pt-2">
          <Link
            to="/s/$storeSlug/p/$productSlug"
            params={{ storeSlug: convo.data.store.slug, productSlug: product.slug }}
            className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card/95 py-1.5 pl-1.5 pr-3 shadow-sm transition-colors hover:bg-accent/60"
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-muted">
              {productImage && <img src={productImage} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="line-clamp-1 text-[12px] font-semibold">{product.title}</p>
              <p className="text-[11px] font-bold text-gold">{formatGHS(product.base_price, { currency: product.currency })}</p>
            </div>
            <span className="shrink-0 rounded-full bg-[var(--gold)]/12 px-2.5 py-1 text-[10px] font-semibold text-gold">
              View
            </span>
          </Link>
        </div>
      )}

      {/* Messages — same tint as the product card, so the card floats */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}
          className="h-full overflow-y-auto bg-[color-mix(in_oklab,var(--background)_92%,var(--primary)_8%)] px-3 pb-2 pt-2"
        >
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
          {msgs.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>}
          {!msgs.isLoading && (msgs.data ?? []).length === 0 && (
            <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-card/90 p-5 text-center shadow-sm">
              <p className="font-display text-lg">Say hello</p>
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
                <div key={m.id} className="mx-auto my-1 max-w-sm rounded-2xl border border-[var(--gild)]/40 bg-[var(--gild)]/10 px-4 py-2.5 text-center">
                  <p className="text-xs font-medium">{m.body}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  {(m as any).metadata?.order_id && (
                    <Link
                      to={isSeller ? "/dashboard/orders" : "/orders"}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--gold)] px-3 py-1 text-[11px] font-bold text-[var(--gold-foreground)] hover:opacity-90"
                    >
                      {isSeller ? "Confirm / update order" : "View your order"}
                    </Link>
                  )}
                </div>
              );
            }
            // Consecutive messages from the same sender stack tighter (WhatsApp
            // pattern): the tail corner sits only on the last bubble of a run,
            // middle bubbles square BOTH corners on their side.
            const nextMsg = items[idx + 1];
            const lastOfRun = !(nextMsg && nextMsg.type === "msg" && nextMsg.m.sender_id === m.sender_id && nextMsg.m.kind !== "system_order" && nextMsg.m.kind !== "system_delivery");
            const tail = mine
              ? lastOfRun ? "rounded-br-sm" : "rounded-br-sm rounded-tr-sm"
              : lastOfRun ? "rounded-bl-sm" : "rounded-bl-sm rounded-tl-sm";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-sm ${tail} ${
                    mine
                      ? "bg-[var(--gold)] text-[var(--gold-foreground)]"
                      : "border border-border/60 bg-card text-foreground"
                  }`}
                >
                  {m.kind === "image" && Array.isArray(m.attachments) && m.attachments[0]?.url && (
                    <button
                      type="button"
                      onClick={() => setLightbox(m.attachments[0].url)}
                      className="mb-1 block max-w-full cursor-zoom-in"
                      aria-label="View image full size"
                    >
                      <img src={m.attachments[0].url} alt="" className="max-h-64 rounded-xl" />
                    </button>
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
          {/* Store AI is typing — WhatsApp-style bubble. Buyer view only:
              the watching seller gets the header hint instead, since on
              that side the AI speaks AS the seller. */}
          {aiTyping && !isSeller && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3 shadow-sm" aria-label="Seller is typing">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:300ms]" />
              </div>
            </div>
          )}
          {/* Optimistic sends — gold while in flight; a failed send stays as
              a card with Retry / Discard instead of vanishing. */}
          {outbox.map((o) => (
            <div key={o.id} className="flex justify-end">
              <div
                className={`max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2 text-[15px] leading-snug shadow-sm ${
                  o.failed ? "border border-destructive/60 bg-card text-foreground" : "bg-[var(--gold)] text-[var(--gold-foreground)]"
                }`}
              >
                <p className="whitespace-pre-wrap">{o.body}</p>
                {o.failed ? (
                  <span className="mt-0.5 flex items-center justify-end gap-2 text-[10px]">
                    <span className="font-semibold uppercase tracking-[0.08em] text-destructive">Not sent</span>
                    <button
                      onClick={() => retrySend(o)}
                      className="inline-flex items-center gap-0.5 rounded-full bg-destructive/15 px-2 py-0.5 font-semibold text-destructive transition-colors hover:bg-destructive/25"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Retry
                    </button>
                    <button
                      onClick={() => discardFailed(o.id)}
                      aria-label="Discard message"
                      className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ) : (
                  <span className="mt-0.5 flex items-center justify-end text-[10px] text-[var(--gold-foreground)]/70">Sending…</span>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
        {/* Jump to latest — appears only when the reader scrolled up, so new
            traffic never drags them away from history. */}
        {!atBottom && (
          <button
            onClick={() => {
              const el = listRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
              setAtBottom(true);
            }}
            className="absolute bottom-4 right-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-gold/40 bg-card text-gold shadow-lift transition-colors hover:bg-accent"
            aria-label="Jump to latest messages"
            title="Jump to latest"
          >
            <ArrowDown className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* SELLER: AI recap panel — opened from the header ⋮ menu. The gold
          top rule marks every AI-authored surface in the thread. */}
      {isSeller && showRecap && (
        <div className="border-t-2 border-[var(--gild)]/50 bg-card px-3 py-3 backdrop-blur">
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seller: create order panel */}
      {showOrderPanel && (
        <div className="border-t-2 border-[var(--gold)]/50 bg-card px-3 py-3">
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
                <option value="meet_in_person">Meet in person</option>
                <option value="visit_shop">Visit shop</option>
                <option value="delivery">Delivery</option>
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

      {/* Composer — WhatsApp anatomy: attach sits inside the field, the send
          button rides the right edge. Picking an image stages a preview above
          the field (removable); the send button commits it. */}
      <div className="border-t border-border bg-background px-3 pt-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto max-w-2xl">
          {attach && (
            <div className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-2">
              <img src={attach.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1 text-xs leading-tight">
                <p className="line-clamp-1 font-medium">{attach.file.name}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {Math.max(1, Math.round(attach.file.size / 1024))} KB · sends with your next message
                </p>
              </div>
              <button
                onClick={() => {
                  URL.revokeObjectURL(attach.url);
                  setAttach(null);
                }}
                aria-label="Remove attachment"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1 rounded-[26px] border border-input bg-card py-1.5 pl-2 pr-1.5 transition-colors focus-within:border-ring">
            <label
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Attach image"
              title="Attach an image"
            >
              <ImageIcon className="h-5 w-5" strokeWidth={1.7} />
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAttach({ file: f, url: URL.createObjectURL(f) });
                  e.target.value = "";
                }}
              />
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitComposer();
                }
              }}
              rows={1}
              placeholder="Message…"
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={commitComposer}
              disabled={!text.trim() && !attach}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] transition hover:brightness-110 disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Full-screen image viewer — tap any image message to inspect it. */}
      {lightbox && (
        <div
          role="dialog"
          aria-label="Image viewer"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-6"
        >
          <img src={lightbox} alt="" className="max-h-[82vh] max-w-full rounded-xl object-contain shadow-lift" />
          <button
            onClick={() => setLightbox(null)}
            aria-label="Close image viewer"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
