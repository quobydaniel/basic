import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Home, Search, MessageCircle, Package, User, Bike, ShieldCheck, ArrowUpRight, Store } from "lucide-react";
import { useSession } from "@/lib/session";
import { FloatingBuyerAssistant } from "@/components/FloatingBuyerAssistant";
import { PearlHeader } from "@/components/PearlHeader";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { ReactNode } from "react";

// Obsidian — buyer tabs. Same IA as the original shell; presentation is
// after-dark luxury: icons hush to ivory, the active tab wears a gold pin.
const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Search },
  { to: "/chat", label: "Chats", icon: MessageCircle },
  { to: "/orders", label: "Orders", icon: Package },
  { to: "/account", label: "Account", icon: User },
] as const;

export function AppShell({
  children,
  productId,
}: {
  children: ReactNode;
  productId?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Chat is an app-like surface: the shell owns the whole viewport — no
  // masthead, no footer, no bottom tab bar. The conversation list carries
  // its own slim app bar (brand chip, bell, account). Covers the buyer
  // inbox and the marketplace seller inbox.
  const isChat = pathname.startsWith("/chat") || pathname.startsWith("/sell/chat");
  // Tab-bar scope: the buyer chat INBOX rides with the marketplace tabs;
  // the thread stays focused (no tab-taps mid-conversation), the seller
  // inbox keeps its full viewport (buyer tabs would be wrong there).
  const isSellerChat = pathname.startsWith("/sell/chat");
  const isBuyerChatThread = /^\/chat\/.+/.test(pathname);
  // Product detail is the same kind of surface on mobile: the sticky buy bar
  // replaces the tab bar (Temu-style) and the back arrow replaces breadcrumbs.
  const isProductDetail = /^\/s\/[^/]+\/p\/.+/.test(pathname);
  const appSurface = isChat || isProductDetail;
  const showAssistant =
    !pathname.startsWith("/chat") && !pathname.startsWith("/account");
  const context: "home" | "discover" | "product" | "orders" | "favorites" | "stores" =
    pathname.startsWith("/discover") ? "discover"
    : pathname.startsWith("/s/") ? "product"
    : pathname.startsWith("/orders") ? "orders"
    : pathname.startsWith("/favorites") ? "favorites"
    : pathname.startsWith("/stores") ? "stores"
    : "home";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isChat && <PearlHeader />}
      <main className={isChat ? "" : "mx-auto max-w-2xl md:max-w-6xl pb-28 md:pb-16"}>{children}</main>
      {/* Footer lives ONLY on the Account page now — every other surface
          stays content-first (Jiji/Temu pattern). */}
      {!isProductDetail && !isSellerChat && !isBuyerChatThread && <BottomTabBar />}
      {showAssistant && <FloatingBuyerAssistant productId={productId} context={context} />}
    </div>
  );
}

/* Tab-bar badge: total unread across the buyer's conversations. One small
   query plus a realtime nudge whenever any message lands (RLS delivers only
   rows this user may see), and a refetch on every route change so leaving a
   thread updates the pill immediately. */
let tabFeedChannel: RealtimeChannel | null = null;
let tabFeedUserId: string | null = null;

function useUnreadChats(userId?: string) {
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = useQuery({
    queryKey: ["unread-chats", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("unread_buyer")
        .eq("buyer_id", userId!);
      if (error) throw error;
      return (data as { unread_buyer: number }[]).reduce((s, c) => s + c.unread_buyer, 0);
    },
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["unread-chats"] });
  }, [pathname, qc]);

  useEffect(() => {
    if (!userId) return;
    if (tabFeedUserId === userId) return;
    if (tabFeedChannel) supabase.removeChannel(tabFeedChannel);
    tabFeedChannel = supabase
      .channel(`tabbar-feed:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        qc.invalidateQueries({ queryKey: ["unread-chats"] });
      })
      .subscribe();
    tabFeedUserId = userId;
  }, [userId, qc]);

  return unread.data ?? 0;
}

function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const unread = useUnreadChats(user?.id);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-lg md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className="relative flex flex-col items-center gap-1 py-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[active=true]:text-foreground"
                data-active={active}
              >
                {/* Active tab = the lemon working accent on the icon; the
                    label stays ivory. The gilded top pin completes the state. */}
                <span className="relative">
                  <Icon
                    className={`h-[18px] w-[18px] transition-colors ${active ? "text-[var(--gold)]" : ""}`}
                    strokeWidth={active ? 2.1 : 1.6}
                  />
                  {to === "/chat" && unread > 0 && (
                    <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--gold)] px-1 text-[9px] font-bold text-[var(--gold-foreground)] ring-2 ring-background">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                {label}
                {active && (
                  <span className="absolute top-0 h-[2px] w-8 rounded-full bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* Obsidian footer — a quiet colophon on charcoal, gold hairlines.
   Exported for the Account page — the one place a footer belongs. */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
        <div>
          <Link to="/" className="inline-block">
            <span className="font-display text-xl leading-none tracking-[0.32em] text-foreground">B A S I C</span>
            <span className="mt-1.5 block h-px w-14 bg-gradient-to-r from-transparent via-gold to-transparent" />
          </Link>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Objects of consequence from Ghana's independent makers. Presented
            properly, delivered with care.
          </p>
        </div>
        <FooterCol title="House" links={[["/discover", "Discover"], ["/stores", "Stores"], ["/chat", "Chats"], ["/orders", "Orders"], ["/favorites", "Favorites"]]} />
        <FooterCol title="Company" links={[["/pricing", "BASIC Premium"], ["/chat", "Message us"]]} />
        <FooterCol
          title="Professionals"
          links={[["/auth?mode=sell", "Consign with us", Store], ["/rider", "Deliver with BASIC", Bike], ["/quoby", "Admin console", ShieldCheck]]}
        />
      </div>
      <div className="border-t border-border/40">
        <p className="mx-auto max-w-6xl px-4 py-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 md:px-8">
          © 2026 BASIC — Accra
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string, any?][] }) {
  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {links.map(([to, label, Icon]) => (
          <li key={to}>
            <Link to={to} className="group inline-flex items-center gap-1.5 text-[13px] text-foreground/80 transition-colors hover:text-gold">
              {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold" />}
              {label}
              <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
