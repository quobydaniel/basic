// Split-view chat shell shared by the buyer inbox (/chat), the marketplace
// seller inbox (/sell/chat) and the seller dashboard (/dashboard/chats).
// The marketplace chat owns the whole viewport — AppShell drops the BASIC
// masthead for it — so the conversation pane carries a slim app bar: brand
// chip home, Messages title, bell, account. On mobile one pane shows at a
// time, full-screen; on desktop the list sits beside the thread. The
// dashboard variant keeps the dashboard's own chrome (sidebar + bars).
import { Outlet, useRouterState, Link } from "@tanstack/react-router";
import { MessageCircle, User } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { AppShell } from "@/components/AppShell";
import { ChatList, type ChatScope } from "@/components/ChatList";

export function ChatShell({ scope, surface = "marketplace" }: { scope: ChatScope; surface?: "marketplace" | "dashboard" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inThread = /^\/(dashboard\/chats|sell\/chat|chat)\/.+/.test(pathname);
  const activeId = inThread ? pathname.split("/").pop() : undefined;

  // Marketplace chat owns the full viewport. Dashboard variant sits inside
  // the seller dashboard's mobile bar + bottom nav (desktop is sidebar-only).
  const height =
    surface === "dashboard"
      ? "h-[calc(100dvh-2.75rem-3.5rem)] md:h-screen"
      : "h-[100dvh] md:h-screen";

  const content = (
    <div className={`flex flex-col md:grid md:grid-cols-[minmax(320px,380px)_1fr] ${height}`}>
      {/* ── Conversation pane (hidden on mobile while a thread is open) ── */}
      <aside className={`min-h-0 flex-col border-border/60 md:border-r ${inThread ? "hidden md:flex" : "flex flex-1"}`}>
        {/* App bar — chat has no masthead above it, so it carries its own
            chrome: brand chip (home / dashboard), title, bell, account. */}
        {surface === "marketplace" && (
          <div className="flex items-center gap-2 border-b border-border/60 bg-background px-3 py-2.5">
            <Link
              to={scope === "selling" ? "/dashboard" : "/"}
              aria-label={scope === "selling" ? "Back to dashboard" : "Home"}
              title={scope === "selling" ? "Back to dashboard" : "Home"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--gold)]/12 font-display text-sm font-bold text-[var(--gold)] ring-1 ring-gold/30"
            >
              B
            </Link>
            <p className="flex-1 font-display text-xl leading-none">Messages</p>
            <NotificationBell />
            <Link
              to="/account"
              aria-label="Account"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
            >
              <User className="h-4 w-4" strokeWidth={1.8} />
            </Link>
          </div>
        )}
        <ChatList scope={scope} activeId={activeId} chrome={surface === "dashboard"} />
      </aside>

      {/* ── Thread / empty state ── */}
      <section
        className={`relative min-h-0 overflow-hidden ${
          inThread ? "flex flex-1 flex-col" : "hidden items-center justify-center md:flex"
        }`}
      >
        {inThread ? (
          <Outlet />
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="candle absolute left-1/2 top-1/3 h-80 w-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,var(--gold)_0%,transparent_60%)] glow-gold-main opacity-[0.06] blur-3xl" />
            </div>
            <div className="relative max-w-sm text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-gold/30 bg-card/60">
                <MessageCircle className="h-8 w-8 text-[var(--gold)]" strokeWidth={1.4} />
              </div>
              <p className="mt-6 font-display text-2xl">
                {scope === "selling" ? "Your buyers live here" : "Your conversations live here"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {scope === "selling"
                  ? "Pick a conversation to reply. Switch on auto-pilot and the AI answers buyers, takes orders and alerts you — even while you're away."
                  : "Pick a chat on the left. Ask about a piece, agree a price, and close the deal — sellers reply fast on BASIC."}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );

  if (surface === "dashboard") return content;
  return <AppShell>{content}</AppShell>;
}
