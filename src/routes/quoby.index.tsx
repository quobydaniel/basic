import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Store as StoreIcon, Package, ShoppingCart, Banknote } from "lucide-react";

import { adminGetStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/quoby/")({
  component: AdminOverview,
});

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 font-display text-2xl">{value}</p>
    </div>
  );
}

function AdminOverview() {
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => adminGetStats(),
  });

  if (stats.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading overview…</div>;
  }
  if (stats.error) {
    return <div className="p-6 text-sm text-destructive">Failed to load stats: {(stats.error as Error).message}</div>;
  }
  const d = stats.data!;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-2xl">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">Platform health at a glance.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={Users} label="Users" value={d.totalUsers} />
        <StatCard icon={StoreIcon} label="Stores" value={d.totalStores} />
        <StatCard icon={Package} label="Products" value={d.totalProducts} />
        <StatCard icon={ShoppingCart} label="Orders" value={d.totalOrders} />
        <StatCard icon={Banknote} label="GMV (paid)" value={`GH₵${d.gmv.toFixed(2)}`} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Recent signups</h2>
          <ul className="mt-3 space-y-2">
            {d.recentUsers.length === 0 && <li className="text-sm text-muted-foreground">No users yet.</li>}
            {d.recentUsers.map((u) => (
              <li key={u.user_id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="font-medium">{u.full_name || u.email}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Recent orders</h2>
          <ul className="mt-3 space-y-2">
            {d.recentOrders.length === 0 && (
              <li className="text-sm text-muted-foreground">No orders yet.</li>
            )}
            {(d.recentOrders as { id: string; status: string; total: number | null; currency: string; created_at: string; store: { name: string } | null }[]).map((o) => (
              <li key={o.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                <span className="truncate">
                  <span className="font-medium">{o.store?.name ?? "Store"}</span>
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase">{o.status}</span>
                </span>
                <span className="text-xs font-medium">
                  {o.currency} {Number(o.total ?? 0).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
