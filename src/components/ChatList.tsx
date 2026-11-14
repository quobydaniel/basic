// Conversation list pane — rendered by the chat split-view shell. Scope is
// hard: "buying" shows ONLY conversations where the user is the buyer;
// "selling" ONLY where they are the seller. The role switcher moves between
// the two inboxes (/chat and /sell/chat) so sellers never mix the two.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircle, Search, ChevronRight } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export type ChatScope = "buying" | "selling";

type Convo = {
  id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  unread_buyer: number;
  unread_seller: number;
  store: { name: string; logo_url: string | null; slug: string } | null;
  product: { title: string } | null;
  buyer: { full_name: string; avatar_url: string | null } | null;
};

type LastMsg = { conversation_id: string; body: string | null; kind: string; sender_id: string; created_at: string };

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

type Tab = "all" | "unread";

export function ChatList({
  scope,
  activeId,
}: {
  scope: ChatScope;
  activeId?: string;
}) {
  const { user, loading } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const inbox = useQuery({
    queryKey: ["inbox", scope, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations" as any)
        .select("id, buyer_id, seller_id, last_message_at, unread_buyer, unread_seller, store:stores(name, logo_url, slug), product:products(title)")
        .or(`buyer_id.eq.${user!.id},seller_id.eq.${user!.id}`)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const all = data as unknown as Convo[];
      // Hard scope — a seller never sees their purchases here, a buyer never
      // sees their store's sales.
      const scoped = all.filter((c) => (scope === "selling" ? c.seller_id === user!.id : c.buyer_id === user!.id));
      if (scope !== "selling" || scoped.length === 0) return scoped;
      // Seller rows show the BUYER's name/photo. No FK from conversations to
      // profiles, so fetch the profile rows separately (best-effort: RLS may
      // limit visibility — rows then fall back to "Buyer").
      const buyerIds = [...new Set(scoped.map((c) => c.buyer_id))];
      try {
        const { data: ppl } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", buyerIds);
        const byId = new Map((ppl ?? []).map((p: any) => [p.id, p]));
        return scoped.map((c) => ({
          ...c,
          buyer: byId.get(c.buyer_id) ? { full_name: byId.get(c.buyer_id)!.full_name, avatar_url: byId.get(c.buyer_id)!.avatar_url } : null,
        }));
      } catch {
        return scoped;
      }
    },
  });

  // Latest message per conversation, for the preview line
  const previews = useQuery({
    queryKey: ["inbox", "previews", scope, user?.id],
    enabled: !!user && (inbox.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (inbox.data ?? []).map((c) => c.id);
      const { data, error } = await supabase
        .from("messages" as any)
        .select("conversation_id, body, kind, sender_id, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const latest = new Map<string, LastMsg>();
      for (const m of (data ?? []) as unknown as LastMsg[]) {
        if (!latest.has(m.conversation_id)) latest.set(m.conversation_id, m);
      }
      return latest;
    },
  });

  // Realtime: refresh inbox when messages land anywhere
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("inbox-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["inbox"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const totalUnread = (inbox.data ?? []).reduce((s: number, c) => s + (scope === "selling" ? c.unread_seller : c.unread_buyer), 0);

  const convos = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (inbox.data ?? []).filter((c) => {
      if (tab === "unread" && (scope === "selling" ? c.unread_seller : c.unread_buyer) === 0) return false;
      if (needle) {
        const last = previews.data?.get(c.id);
        const hay = `${c.store?.name ?? ""} ${c.buyer?.full_name ?? ""} ${c.product?.title ?? ""} ${last?.body ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [inbox.data, q, tab, scope, previews.data]);

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-4 md:px-5">
        <h1 className="font-display text-3xl">{scope === "selling" ? "Seller chats" : "Chats"}</h1>
        {/* Page bell serves mobile — the masthead cluster has one on desktop */}
        <span className="md:hidden"><NotificationBell /></span>
        {totalUnread > 0 && (
          <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[11px] font-bold text-[var(--gold-foreground)]">
            {totalUnread} new
          </span>
        )}
      </div>

      {/* Personas stay separate: the buyer inbox shows nothing about selling,
          the seller inbox (in the dashboard) knows nothing of shopping. */}
      {user && (
        <>
          <div className="px-4 pt-3 md:px-5">
            <div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 focus-within:border-gold/60">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search chats…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="flex gap-1.5 px-4 pt-3 md:px-5">
            {(["all", "unread"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  tab === t
                    ? "bg-[var(--gold)] text-[var(--gold-foreground)]"
                    : "border border-border text-muted-foreground hover:border-gold/40 hover:text-foreground"
                }`}
              >
                {t === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4 md:px-3">
        {loading && <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>}
        {!loading && !user && (
          <div className="mx-2 mt-6 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><MessageCircle className="h-6 w-6 text-muted-foreground" /></div>
            <p className="mt-4 font-display text-xl">Sign in to see your chats</p>
            <p className="mt-1 text-sm text-muted-foreground">Negotiate, ask, and close deals with sellers.</p>
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="mt-5 rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-semibold text-[var(--gold-foreground)] hover:brightness-110"
            >
              Sign in
            </button>
          </div>
        )}
        {user && inbox.isError && (
          <p className="px-4 py-8 text-center text-sm text-destructive">Couldn't load your chats — pull to refresh or try again.</p>
        )}
        {user && inbox.data?.length === 0 && (
          <div className="mx-2 mt-6 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><MessageCircle className="h-6 w-6 text-muted-foreground" /></div>
            <p className="mt-4 font-display text-xl">{scope === "selling" ? "No buyer chats yet" : "No chats yet"}</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {scope === "selling"
                ? "When buyers message you about your products, their chats land here — the AI assistant can help you answer."
                : <>Find something you love, then tap <span className="font-medium text-[var(--gold)]">Message seller</span> on the product page.</>}
            </p>
            <button
              onClick={() => navigate({ to: scope === "selling" ? "/dashboard" : "/discover" })}
              className="mt-5 rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-semibold text-[var(--gold-foreground)] hover:brightness-110"
            >
              {scope === "selling" ? "Go to dashboard" : "Browse products"}
            </button>
          </div>
        )}
        {user && (inbox.data?.length ?? 0) > 0 && convos.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing matches “{q || tab}”.</p>
        )}

        {convos.map((c) => {
          const unread = scope === "selling" ? c.unread_seller : c.unread_buyer;
          const last = previews.data?.get(c.id);
          const mine = last?.sender_id === user?.id;
          const preview =
            last == null
              ? c.product?.title ?? "Say hello 👋"
              : last.kind === "image"
                ? (mine ? "You: " : "") + "📷 Photo"
                : last.kind.startsWith("system")
                  ? (last.body ?? "")
                  : `${mine ? "You: " : ""}${last.body ?? ""}`;
          return (
            <button
              key={c.id}
              data-active={c.id === activeId}
              onClick={() => {
                navigate({
                  to: scope === "selling" ? "/dashboard/chats/$conversationId" : "/chat/$conversationId",
                  params: { conversationId: c.id },
                });
              }}
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-accent/60 data-[active=true]:bg-accent/70"
            >
              <div className={`h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ${unread > 0 || c.id === activeId ? "ring-[var(--gold)]/70" : "ring-border"}`}>
                {(scope === "selling" ? c.buyer?.avatar_url : c.store?.logo_url) && (
                  <img src={(scope === "selling" ? c.buyer!.avatar_url : c.store!.logo_url)!} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1 border-b border-border/40 pb-3 pt-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`line-clamp-1 text-[15px] ${unread > 0 ? "font-semibold text-foreground" : "font-medium"}`}>
                    {scope === "selling" ? c.buyer?.full_name || "Buyer" : c.store?.name ?? "Store"}
                  </p>
                  <span className={`shrink-0 text-[11px] ${unread > 0 ? "font-semibold text-[var(--gold)]" : "text-muted-foreground"}`}>
                    {c.last_message_at && timeLabel(c.last_message_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className={`line-clamp-1 text-[13px] ${unread > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {preview}
                    {c.product?.title && last == null && <span className="text-muted-foreground"> · {c.product.title}</span>}
                  </p>
                  {unread > 0 ? (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--gold)] px-1.5 text-[10px] font-bold text-[var(--gold-foreground)]">{unread}</span>
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
