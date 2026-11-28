import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Store as StoreIcon,
  Package,
  ReceiptText,
  Bike,
  HandCoins,
  ArrowUpRight,
} from "lucide-react";

import { adminGetStats } from "@/lib/admin.functions";
import {
  AdminPage,
  AdminPanel,
  AdminPanelHead,
  StatTile,
  StatusBadge,
  AdminEmpty,
} from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/")({
  component: AdminOverview,
});

function AdminOverview() {
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminGetStats(),
  });

  const d = stats.data;
  const sections = [
    { to: "/quoby/orders", label: "Order oversight", icon: ReceiptText },
    { to: "/quoby/riders", label: "Rider directory", icon: Bike },
    { to: "/quoby/affiliates", label: "Affiliate listings", icon: HandCoins },
  ];

  return (
    <AdminPage
      title="Overview"
      subtitle="Platform health at a glance. Every figure below comes from live platform tables — nothing estimated."
    >
      {stats.isLoading && (
        <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
          Loading overview…
        </div>
      )}
      {stats.error && (
        <div className="pearl-card p-5 text-sm text-error">
          Failed to load stats: {(stats.error as Error).message}
        </div>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatTile icon={Users} label="Users" value={d.totalUsers} />
            <StatTile icon={StoreIcon} label="Stores" value={d.totalStores} />
            <StatTile icon={Package} label="Products" value={d.totalProducts} />
            <StatTile icon={ReceiptText} label="Orders" value={d.totalOrders} />
            <StatTile icon={StoreIcon} label="GMV (paid)" value={`GH₵${d.gmv.toFixed(2)}`} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {sections.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="pearl-card group flex items-center justify-between px-4 py-3.5 text-sm font-medium transition-colors hover:text-gold"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 text-gold" /> {label}
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <AdminPanel>
              <AdminPanelHead title="Recent signups" hint={`${d.recentUsers.length} latest`} />
              {d.recentUsers.length === 0 ? (
                <AdminEmpty text="No users yet." />
              ) : (
                <ul className="divide-y divide-border/60">
                  {d.recentUsers.map((u) => (
                    <li
                      key={u.user_id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm md:px-5"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">{u.full_name || u.email}</span>
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>

            <AdminPanel>
              <AdminPanelHead title="Recent orders" hint="latest 8" />
              {d.recentOrders.length === 0 ? (
                <AdminEmpty
                  text="No orders yet."
                  hint="New orders appear here as buyers place them."
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {(
                    d.recentOrders as {
                      id: string;
                      status: string;
                      total: number | null;
                      currency: string;
                      created_at: string;
                      store: { name: string } | null;
                    }[]
                  ).map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm md:px-5"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{o.store?.name ?? "Store"}</span>
                        <StatusBadge status={o.status} />
                      </span>
                      <span className="shrink-0 text-xs font-medium">
                        {o.currency} {Number(o.total ?? 0).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </AdminPanel>
          </div>
        </>
      )}
    </AdminPage>
  );
}
