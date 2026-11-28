import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Palette,
  Settings,
  Home,
  MessageCircle,
  CirclePlay,
  Clapperboard,
  Bot,
  Sparkles,
  Bike,
  Users,
} from "lucide-react";
import { FloatingAIAssistant } from "@/components/FloatingAIAssistant";
import { supabase } from "@/integrations/supabase/client";
import { autoPilotReply } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/session";
import { acquireAutoPilot, releaseAutoPilot } from "@/lib/autopilot-lock";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const items: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/products", label: "Products", icon: Package },
  { to: "/dashboard/orders", label: "Orders", icon: ShoppingCart },
  { to: "/dashboard/chats", label: "Chats", icon: MessageCircle },
  { to: "/dashboard/autopilot", label: "Autopilot", icon: Bot },
  { to: "/dashboard/ai", label: "AI Studio", icon: Sparkles },
  { to: "/dashboard/stories", label: "Stories", icon: CirclePlay },
  { to: "/dashboard/shorts", label: "Shorts", icon: Clapperboard },
  { to: "/dashboard/storefront", label: "Storefront", icon: Palette },
  { to: "/dashboard/affiliate", label: "Affiliate", icon: Users },
  { to: "/dashboard/deliveries", label: "Deliveries", icon: Bike },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

/**
 * Auto-pilot heartbeat: while ANY seller dashboard surface is open, poll the
 * store's conversations every 20s and let the AI answer new buyer messages —
 * even when no chat thread is open. The server fn refuses when the last
 * message is already the seller's, and the shared lock prevents double-fire
 * against the open-thread effect.
 */
function SellerAutoPilot() {
  const { user } = useSession();
  const qc = useQueryClient();
  const reply = useServerFn(autoPilotReply);

  useEffect(() => {
    if (!user) return;
    let stopped = false;

    async function tick() {
      if (stopped) return;
      try {
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("owner_id", user!.id);
        const ids = (stores ?? []).map((st: any) => st.id);
        if (!ids.length) return;
        const { data: convos } = await supabase
          .from("conversations")
          .select("id, store_id, ai_enabled, store:stores(auto_pilot, plan)")
          .in("store_id", ids)
          // unread_seller = messages the seller hasn't read (fresh buyer
          // pings). The old condition polled unread_buyer — conversations
          // where the SELLER had replied and the buyer hadn't opened yet,
          // exactly when the AI has nothing to answer — so the heartbeat
          // never fired in the moment it exists for.
          .gt("unread_seller", 0)
          .limit(5);
        for (const c of (convos ?? []) as any[]) {
          if (stopped) return;
          const st = c.store ?? {};
          if (!st.auto_pilot || st.plan !== "pro") continue;
          if (c.ai_enabled === false) continue; // seller paused this chat
          if (!acquireAutoPilot(c.id)) continue;
          reply({ data: { conversation_id: c.id } })
            .then(() => qc.invalidateQueries({ queryKey: ["msgs", c.id] }))
            .catch(() => {}) // server refuses when nothing to reply to — fine
            .finally(() => releaseAutoPilot(c.id));
        }
      } catch {
        // silent — poller must never disturb the seller
      }
    }

    tick();
    const iv = setInterval(tick, 20000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [user, qc, reply]);

  return null;
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  // Seller persona gate: only store owners get past the dashboard shell.
  // Signed-in buyers land on /dashboard itself, which shows storefront
  // onboarding (CreateStore). Session-restore poll as everywhere else.
  beforeLoad: async ({ location }) => {
    let session: { user: { id: string } } | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        session = data.session as unknown as { user: { id: string } };
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!session) throw redirect({ to: "/auth", search: { mode: "sell" as const } });
    if (location.pathname === "/dashboard") return; // onboarding lives here
    const { data: stores } = await supabase
      .from("stores")
      .select("id")
      .eq("owner_id", session.user.id)
      .limit(1);
    if (!stores || stores.length === 0) throw redirect({ to: "/dashboard" });
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-7xl md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-border md:block">
          <div className="sticky top-0 flex h-screen flex-col p-5">
            <Link to="/" className="mb-8 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground font-display">
                S
              </span>
              <span className="font-display text-lg">BASIC</span>
            </Link>
            <nav className="flex flex-col gap-1">
              {items.map(({ to, label, icon: Icon, exact }) => {
                const active = exact ? pathname === to : pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                    data-active={active}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto">
              <Link
                to="/"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
              >
                <Home className="h-3.5 w-3.5" /> Back to marketplace
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
            <Link to="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground font-display text-sm">
                B
              </span>
              <span className="font-display text-base">Seller</span>
            </Link>
          </div>
          <Outlet />

          {/* Full nav incl. Settings — a phone-only seller must still reach
              Paystack keys, AI persona and WhatsApp number; Stories + Shorts
              stay thumb-reachable for posting on the go. Twelve destinations
              don't fit a fixed grid — the bar scrolls horizontally instead. */}
          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="no-scrollbar flex overflow-x-auto">
              {items.map(({ to, label, icon: Icon, exact }) => {
                const active = exact ? pathname === to : pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className="flex min-w-[72px] flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground data-[active=true]:text-foreground"
                    data-active={active}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
      {/* The seller inbox has its own AI drafts in-thread — no floating
          assistant hovering over the chat surface. */}
      {!pathname.startsWith("/dashboard/chats") && <FloatingAIAssistant />}
    </div>
  );
}
