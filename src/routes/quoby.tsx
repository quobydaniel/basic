import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Store as StoreIcon,
  Package,
  Sparkles,
  ShieldCheck,
  ReceiptText,
  Bike,
  HandCoins,
  Banknote,
  Flag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  mobile?: boolean;
};
const items: NavItem[] = [
  { to: "/quoby", label: "Overview", icon: LayoutDashboard, exact: true, mobile: true },
  { to: "/quoby/orders", label: "Orders", icon: ReceiptText, mobile: true },
  { to: "/quoby/users", label: "Users", icon: Users, mobile: true },
  { to: "/quoby/stores", label: "Stores", icon: StoreIcon, mobile: true },
  { to: "/quoby/products", label: "Products", icon: Package, mobile: true },
  { to: "/quoby/riders", label: "Riders", icon: Bike },
  { to: "/quoby/affiliates", label: "Affiliates", icon: HandCoins },
  { to: "/quoby/ai", label: "AI Models", icon: Sparkles },
  { to: "/quoby/transactions", label: "Transactions", icon: Banknote },
  { to: "/quoby/reports", label: "Reports", icon: Flag },
];

// Convenience guard — every admin server fn re-verifies server-side.
export const Route = createFileRoute("/quoby")({
  // Client-only auth gate, same as _authenticated: the Supabase session lives
  // in the browser's localStorage, so SSR would always see "signed out" and
  // 307-redirect /quoby to /auth before the client ever boots.
  ssr: false,
  beforeLoad: async () => {
    // Session-restore race: on a cold load, supabase-js restores the session
    // from localStorage asynchronously — getUser() can run before it lands and
    // wrongly report "signed out". Poll briefly for the session before judging.
    let session: { user: { id: string } } | null = null;
    for (let i = 0; i < 20; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        session = data.session as unknown as { user: { id: string } };
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!session) throw redirect({ to: "/auth" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <Link to="/quoby" className="flex items-center gap-2">
      <span
        className={`grid place-items-center rounded-full bg-foreground font-display text-background ${small ? "h-7 w-7 text-sm" : "h-8 w-8"}`}
      >
        B
      </span>
      <span className={`font-display ${small ? "text-base" : "text-lg"}`}>
        BASIC <span className="text-gold">Admin</span>
      </span>
    </Link>
  );
}

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const mobileItems = items.filter((i) => i.mobile);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-7xl md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-border md:block">
          <div className="sticky top-0 flex h-screen flex-col p-5">
            <BrandMark />
            <div className="gold-rule mt-4" />
            <nav className="mt-4 flex flex-col gap-1">
              {items.map(({ to, label, icon: Icon, exact }) => {
                const active = exact ? pathname === to : pathname.startsWith(to);
                return (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-gild/10 hover:text-foreground data-[active=true]:bg-gild/15 data-[active=true]:font-semibold data-[active=true]:text-gold"
                    data-active={active}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-1 border-t border-border/70 pt-4">
              <Link
                to="/dashboard"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-gild/10"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Seller dashboard
              </Link>
              <Link
                to="/"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-gild/10"
              >
                ← Marketplace
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
            <BrandMark small />
          </div>
          <Outlet />

          {/* Mobile bottom nav — first five sections only; the sidebar holds the rest */}
          <nav
            className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur md:hidden"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {mobileItems.map(({ to, label, icon: Icon, exact }) => {
              const active = exact ? pathname === to : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground data-[active=true]:text-gold"
                  data-active={active}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="pb-20 md:pb-0" />
        </div>
      </div>
    </div>
  );
}
