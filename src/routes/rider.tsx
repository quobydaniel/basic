import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Package, MapPin, Wallet, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/rider")({
  component: RiderLayout,
});

const tabs = [
  { to: "/rider", label: "Deliveries", icon: Package, exact: true },
  { to: "/rider/active", label: "Active", icon: MapPin },
  { to: "/rider/earnings", label: "Earnings", icon: Wallet },
  { to: "/rider/profile", label: "Profile", icon: UserIcon },
];

function RiderLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--terracotta)] text-white font-display text-sm">R</span>
          <span className="font-display text-base">Rider</span>
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">BASIC Delivery</span>
      </header>
      <main className="mx-auto max-w-2xl pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground data-[active=true]:text-foreground"
              data-active={active}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
