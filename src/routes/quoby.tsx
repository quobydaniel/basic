import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, Store as StoreIcon, Package, Sparkles, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const items: NavItem[] = [
  { to: "/quoby", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/quoby/users", label: "Users", icon: Users },
  { to: "/quoby/stores", label: "Stores", icon: StoreIcon },
  { to: "/quoby/products", label: "Products", icon: Package },
  { to: "/quoby/ai", label: "AI Models", icon: Sparkles },
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

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-7xl md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-border md:block">
          <div className="sticky top-0 flex h-screen flex-col p-5">
            <Link to="/quoby" className="mb-6 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground font-display">S</span>
              <span className="font-display text-lg">BASIC Admin</span>
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
            <div className="mt-auto flex flex-col gap-1">
              <Link to="/dashboard" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-accent">
                <ShieldCheck className="h-3.5 w-3.5" /> Seller dashboard
              </Link>
              <Link to="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground hover:bg-accent">
                ← Marketplace
              </Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
            <Link to="/quoby" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground font-display text-sm">S</span>
              <span className="font-display text-base">Admin</span>
            </Link>
          </div>
          <Outlet />

          {/* Mobile bottom nav */}
          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {items.map(({ to, label, icon: Icon, exact }) => {
              const active = exact ? pathname === to : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground data-[active=true]:text-foreground"
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
