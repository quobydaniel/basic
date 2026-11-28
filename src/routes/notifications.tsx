import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, MessageCircle, Package, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — BASIC" }] }),
  component: NotificationsPage,
});

// Same shape as NotificationBell — and the same queryKey, so the bell's
// realtime channel (mounted in the header) keeps this page live for free.
type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: { conversation_id?: string; wa_link?: string; order_id?: string } | null;
  read_at: string | null;
  created_at: string;
};

function KindIcon({ kind }: { kind: string }) {
  const cls = "h-4 w-4";
  if (kind === "message") return <MessageCircle className={cls} />;
  if (kind === "order") return <Package className={cls} />;
  return <Bell className={cls} />;
}

function NotificationsPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [bucket, setBucket] = useState<"all" | "unread">("all");

  const notifs = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, payload, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as Notif[];
    },
  });

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
          <Bell className="h-8 w-8 text-muted-foreground" />
          <h1 className="font-display text-2xl">Notifications</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Sign in to see order updates, seller replies and delivery alerts.
          </p>
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

  const all = notifs.data ?? [];
  const unread = all.filter((n) => !n.read_at);
  const visible = bucket === "unread" ? unread : all;

  async function openNotification(n: Notif) {
    if (!n.read_at) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.payload?.conversation_id) {
      navigate({
        to: "/chat/$conversationId",
        params: { conversationId: n.payload.conversation_id },
      });
    } else if (n.payload?.order_id) {
      navigate({ to: "/orders/$orderId", params: { orderId: n.payload.order_id } });
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

  async function remove(n: Notif) {
    await supabase.from("notifications").delete().eq("id", n.id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <AppShell>
      <div className="px-4 pt-4 md:px-8 md:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl">Notifications</h1>
          {unread.length > 0 && (
            <button onClick={markAllRead} className="text-sm font-medium text-gold hover:underline">
              Mark all read ({unread.length})
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Order updates, seller replies and delivery alerts. Opened notifications clear after a day.
        </p>

        <div className="mt-4 flex gap-1.5">
          {(["all", "unread"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBucket(b)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                bucket === b
                  ? "border-gold/40 bg-gold/10 text-gold"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {b === "unread" ? `Unread · ${unread.length}` : "All"}
            </button>
          ))}
        </div>

        <div className="mt-4 pb-16">
          {notifs.isLoading && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading notifications…
            </p>
          )}
          {notifs.error && (
            <p className="py-12 text-center text-sm text-destructive">
              Failed to load: {(notifs.error as Error).message}
            </p>
          )}
          {visible.length === 0 && !notifs.isLoading && (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-6 py-16 text-center">
              <Bell className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">
                {bucket === "unread" ? "You're all caught up." : "No notifications yet."}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {bucket === "unread"
                  ? "Unread alerts land here the moment something happens on your orders or chats."
                  : "Place an order or start a conversation — updates will appear here."}
              </p>
              <Link to="/discover" className="mt-2 text-sm font-medium text-gold hover:underline">
                Discover products →
              </Link>
            </div>
          )}

          <ul className="overflow-hidden rounded-2xl border border-border bg-card">
            {visible.map((n) => (
              <li
                key={n.id}
                className={`group flex items-start gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-5 ${
                  n.read_at ? "" : "bg-gold/5"
                }`}
              >
                <button
                  onClick={() => openNotification(n)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <KindIcon kind={n.kind} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`line-clamp-1 text-sm ${n.read_at ? "" : "font-semibold"}`}>
                        {n.title}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    {n.body && (
                      <span className="line-clamp-2 mt-0.5 block text-xs text-muted-foreground">
                        {n.body}
                      </span>
                    )}
                    {n.kind === "order" && typeof n.payload?.wa_link === "string" && (
                      <a
                        href={n.payload.wa_link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold hover:bg-gold/20"
                      >
                        Alert me on WhatsApp
                      </a>
                    )}
                  </span>
                  {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" />}
                </button>
                <button
                  aria-label="Delete notification"
                  onClick={() => remove(n)}
                  className="mt-1 shrink-0 rounded-full p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
