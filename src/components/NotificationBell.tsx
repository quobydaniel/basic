// Header notification bell — unread count (realtime), dropdown list with
// mark-all-read. Message notifications deep-link into the chat thread.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, MessageCircle } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

// App-scoped singleton: the bell lives on every page (twice on /chat), so one
// channel per session is enough. Auth events hand `useSession` a new user
// OBJECT each time (same id) — re-running the effect must not re-attach
// callbacks to a subscribed channel (supabase-js throws "cannot add
// postgres_changes callbacks ... after subscribe()"), which the root error
// boundary used to swallow into "This page didn't load".
let bellChannel: RealtimeChannel | null = null;
let bellUserId: string | null = null;

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: { conversation_id?: string; wa_link?: string } | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationBell({ variant = "default" }: { variant?: "default" | "aurum" } = {}) {
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const notifs = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, payload, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as Notif[];
    },
  });

  // Realtime badge + list refresh — singleton per session, never re-attached
  // on auth-event identity churn.
  useEffect(() => {
    if (!user) {
      if (bellChannel) {
        supabase.removeChannel(bellChannel);
        bellChannel = null;
        bellUserId = null;
      }
      return;
    }
    if (bellUserId === user.id) return;
    if (bellChannel) supabase.removeChannel(bellChannel);
    bellChannel = supabase
      .channel(`notifs:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    bellUserId = user.id;
  }, [user, qc]);

  // Sweep: notifications a day past being opened (read_at) are deleted.
  // Needs the notifications_own_delete policy (20260901120000). Silent no-op
  // until that policy exists.
  useEffect(() => {
    if (!user) return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("notifications")
      .delete()
      .eq("user_id", user.id)
      .lt("read_at", cutoff)
      .then(({ error }) => {
        if (!error) qc.invalidateQueries({ queryKey: ["notifications"] });
      });
  }, [user, qc]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (!user) return null;
  const unread = (notifs.data ?? []).filter((n) => !n.read_at).length;

  async function openNotification(n: Notif) {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.payload?.conversation_id) {
      setOpen(false);
      navigate({ to: "/chat/$conversationId", params: { conversationId: n.payload.conversation_id } });
    }
  }

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user!.id)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className={`relative grid h-9 w-9 place-items-center rounded-full transition-colors ${
          variant === "aurum"
            ? "aurum-icon-btn h-11 w-11 text-foreground/90 hover:text-gold"
            : "text-foreground/80 hover:bg-accent hover:text-gold"
        }`}
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.6} />
        {unread > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-white ${
              variant === "aurum"
                ? "bg-[#E5484D] ring-2 ring-background"
                : "bg-[var(--gold)] text-[var(--gold-foreground)]"
            }`}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl shadow-2xl ${
            variant === "aurum"
              ? "border border-gold/25 bg-popover/95 backdrop-blur-xl"
              : "border border-border bg-card"
          }`}
        >
          <div className={`flex items-center justify-between px-4 py-2.5 ${variant === "aurum" ? "border-b border-[var(--pearl-border)]" : "border-b border-border/60"}`}>
            <p className={`font-display text-sm ${variant === "aurum" ? "text-[var(--pearl-text)]" : ""}`}>Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className={`text-xs hover:underline ${variant === "aurum" ? "text-[var(--pearl-accent)]" : "text-primary"}`}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(notifs.data ?? []).length === 0 && (
              <p className={`px-4 py-8 text-center text-sm ${variant === "aurum" ? "text-[var(--pearl-muted)]" : "text-muted-foreground"}`}>Nothing yet.</p>
            )}
            {(notifs.data ?? []).map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-b-0 ${
                  variant === "aurum"
                    ? `border-[var(--pearl-border)] hover:bg-[var(--pearl-hover)] ${n.read_at ? "" : "bg-[var(--pearl-accent-soft)]/40"}`
                    : `border-border/40 hover:bg-accent ${n.read_at ? "" : "bg-primary/5"}`
                }`}
              >
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${variant === "aurum" ? "bg-[var(--pearl-accent-soft)] text-[var(--pearl-text)]" : "bg-muted text-muted-foreground"}`}>
                  {n.kind === "message" ? <MessageCircle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`line-clamp-1 text-sm ${variant === "aurum" ? "text-[var(--pearl-text)]" : ""} ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                    <span className={`shrink-0 text-[10px] ${variant === "aurum" ? "text-[var(--pearl-muted)]" : "text-muted-foreground"}`}>{timeAgo(n.created_at)}</span>
                  </span>
                  {n.body && <span className={`line-clamp-2 block text-xs ${variant === "aurum" ? "text-[var(--pearl-muted)]" : "text-muted-foreground"}`}>{n.body}</span>}
                  {n.kind === "order" && typeof n.payload?.wa_link === "string" && (
                    <a
                      href={n.payload.wa_link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-500 hover:bg-emerald-500/25"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      Alert me on WhatsApp
                    </a>
                  )}
                </span>
                {!n.read_at && <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${variant === "aurum" ? "bg-[var(--pearl-accent)]" : "bg-primary"}`} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
