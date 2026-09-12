// Split-view chat shell shared by the buyer inbox (/chat) and the seller
// inbox (/dashboard/chats, inside the seller dashboard). The left pane is the
// scoped conversation list; the right pane shows the empty state or the
// selected thread (<Outlet />) — where the AI drafts replies to buyers on
// the seller's behalf. On mobile one pane shows at a time, full-screen.
import { Outlet, useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ChatList, type ChatScope } from "@/components/ChatList";

export function ChatShell({ scope, surface = "marketplace" }: { scope: ChatScope; surface?: "marketplace" | "dashboard" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inThread = /^\/(dashboard\/chats|chat)\/.+/.test(pathname);
  const activeId = inThread ? pathname.split("/").pop() : undefined;

  // Marketplace: clear the masthead. Dashboard: clear the mobile seller bar
  // and the dashboard bottom nav (desktop is sidebar-only, so full height).
  const height =
    surface === "dashboard"
      ? "h-[calc(100dvh-2.75rem-3.5rem)] md:h-screen"
      : "h-[calc(100dvh-4.6rem)] md:h-[calc(100dvh-7.4rem)]";

  const content = (
    <div className={`flex flex-col md:grid md:grid-cols-[minmax(330px,400px)_1fr] ${height}`}>
      {/* ── Conversation pane (hidden on mobile while a thread is open) ── */}
      <aside className={`min-h-0 flex-col border-border/60 md:border-r ${inThread ? "hidden md:flex" : "flex flex-1"}`}>
        <ChatList scope={scope} activeId={activeId} />
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
                  ? "Pick a conversation to reply. The sparkle inside a chat drafts replies to the buyer for you — describing the product, tracking their order, closing the deal."
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
