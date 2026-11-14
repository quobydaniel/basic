import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Store as StoreIcon,
  Package,
  ShoppingCart,
  TrendingUp,
  ArrowRight,
  MessageCircle,
  Truck,
  Users,
  Sparkles,
  Eye,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: DashboardOverview,
});

function DashboardOverview() {
  const { user } = useSession();

  const myStores = useQuery({
    queryKey: ["my-stores", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, slug, name, tagline, logo_url, banner_url, status, currency")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (myStores.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!myStores.data || myStores.data.length === 0) return <CreateStore />;

  return <StoreOverview store={myStores.data[0]} />;
}

/* -------------------------------------------------------------------------- */
/*                              Create-store form                             */
/* -------------------------------------------------------------------------- */

function CreateStore() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const slug =
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
        "-" +
        Math.random().toString(36).slice(2, 6);
      const { data, error } = await supabase
        .from("stores")
        .insert({ owner_id: user!.id, slug, name, tagline })
        .select("id, slug")
        .single();
      if (error) throw error;
      await supabase.from("user_roles").insert({ user_id: user!.id, role: "seller" });
      return data;
    },
    onSuccess: () => {
      toast.success("Store created!");
      qc.invalidateQueries({ queryKey: ["my-stores"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create store"),
  });

  return (
    <div className="mx-auto max-w-lg px-4 py-10 pb-24 md:px-8">
      <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--terracotta)]">
        <StoreIcon className="h-3.5 w-3.5" /> Welcome, seller
      </p>
      <h1 className="font-display text-3xl">Launch your storefront</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Give your shop a name. You can add products, logo, banner, and connect Paystack + social channels next.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.length < 2) return toast.error("Store name is required");
          create.mutate();
        }}
        className="mt-6 space-y-3"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Store name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ama Beauty"
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Tagline</span>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Shea, soap & scent"
            className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {create.isPending ? "Creating…" : "Create storefront"}
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Store overview                                */
/* -------------------------------------------------------------------------- */

const STATUS_COLORS: Record<string, string> = {
  paid: "var(--sage)",
  pending: "var(--gold)",
  packed: "var(--terracotta)",
  shipped: "var(--ink)",
  delivered: "var(--primary)",
  cancelled: "var(--destructive)",
};

function StoreOverview({ store }: { store: any }) {
  const currency = store.currency ?? "GHS";

  const stats = useQuery({
    queryKey: ["store-stats", store.id],
    queryFn: async () => {
      const [{ count: productCount }, { data: orders }, { count: unreadChats }, { count: openDeliveries }] =
        await Promise.all([
          supabase.from("products").select("id", { count: "exact", head: true }).eq("store_id", store.id),
          supabase
            .from("orders")
            .select("id, total, status, created_at")
            .eq("store_id", store.id)
            .order("created_at", { ascending: false })
            .limit(500),
          supabase
            .from("conversations")
            .select("id", { count: "exact", head: true })
            .eq("seller_id", store.id)
            .gt("unread_seller", 0),
          supabase
            .from("delivery_requests")
            .select("id", { count: "exact", head: true })
            .eq("store_id", store.id)
            .in("status", ["open", "assigned", "picked_up"]),
        ]);
      return {
        productCount: productCount ?? 0,
        orders: orders ?? [],
        unreadChats: unreadChats ?? 0,
        openDeliveries: openDeliveries ?? 0,
      };
    },
  });

  const topProducts = useQuery({
    queryKey: ["top-products", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("quantity, unit_price, product_title, orders!inner(store_id, status)")
        .eq("orders.store_id", store.id)
        .in("orders.status", ["paid", "fulfilled", "shipped", "delivered"] as never[])
        .limit(500);
      // Group by the stored product_title — order_items carries no product FK
      // (the old products!inner embed 400'd and the widget silently stayed empty).
      const map = new Map<string, { title: string; qty: number; revenue: number }>();
      (data ?? []).forEach((r: any) => {
        const key = r.product_title ?? "Product";
        const cur = map.get(key) ?? { title: key, qty: 0, revenue: 0 };
        cur.qty += Number(r.quantity ?? 0);
        cur.revenue += Number(r.quantity ?? 0) * Number(r.unit_price ?? 0);
        map.set(key, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    },
  });

  const insights = useQuery({
    queryKey: ["ai-insights", store.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_insights")
        .select("id, kind, title, body, action_url")
        .eq("store_id", store.id)
        .eq("dismissed", false)
        .order("created_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  /* --- derive series --- */
  const { revenueSeries, statusSeries, revenue, orderCount, paidCount } = useMemo(() => {
    const orders = stats.data?.orders ?? [];
    // Build last 14 days
    const days: { date: string; label: string; revenue: number; orders: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        revenue: 0,
        orders: 0,
      });
    }
    const byDay = new Map(days.map((d) => [d.date, d]));
    let revenue = 0;
    let paidCount = 0;
    const statusMap = new Map<string, number>();
    orders.forEach((o: any) => {
      const key = String(o.created_at ?? "").slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) {
        bucket.orders += 1;
        if (o.status === "paid" || o.status === "shipped" || o.status === "delivered") {
          bucket.revenue += Number(o.total ?? 0);
        }
      }
      if (o.status === "paid" || o.status === "shipped" || o.status === "delivered") {
        revenue += Number(o.total ?? 0);
        paidCount += 1;
      }
      statusMap.set(o.status ?? "other", (statusMap.get(o.status ?? "other") ?? 0) + 1);
    });
    const statusSeries = Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }));
    return {
      revenueSeries: days,
      statusSeries,
      revenue,
      orderCount: orders.length,
      paidCount,
    };
  }, [stats.data]);

  const conversion = orderCount ? Math.round((paidCount / orderCount) * 100) : 0;

  return (
    <div className="p-4 pb-24 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Your store</p>
          <h1 className="mt-1 font-display text-3xl">{store.name}</h1>
        </div>
        <Link
          to="/s/$storeSlug"
          params={{ storeSlug: store.slug }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:bg-accent"
        >
          <Eye className="h-4 w-4" /> View storefront
        </Link>
      </div>

      {/* KPIs */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI
          label="Revenue"
          value={formatGHS(revenue, { currency })}
          hint={`${paidCount} paid`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="var(--sage)"
        />
        <KPI
          label="Orders"
          value={String(orderCount)}
          hint={`${conversion}% paid`}
          icon={<ShoppingCart className="h-4 w-4" />}
          accent="var(--gold)"
        />
        <KPI
          label="Products"
          value={String(stats.data?.productCount ?? 0)}
          hint="Live in store"
          icon={<Package className="h-4 w-4" />}
          accent="var(--terracotta)"
        />
        <KPI
          label="Unread chats"
          value={String(stats.data?.unreadChats ?? 0)}
          hint={`${stats.data?.openDeliveries ?? 0} deliveries`}
          icon={<MessageCircle className="h-4 w-4" />}
          accent="var(--primary)"
        />
      </div>

      {/* Insights strip */}
      {(insights.data ?? []).length > 0 && (
        <div className="mt-6 grid gap-2 md:grid-cols-3">
          {(insights.data ?? []).map((i: any) => (
            <Link
              key={i.id}
              to={i.action_url ?? "/dashboard"}
              className="group flex items-start gap-2 rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-3 hover:border-primary"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{i.title}</p>
                {i.body && <p className="mt-0.5 text-xs text-muted-foreground">{i.body}</p>}
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}

      {/* Charts row */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Revenue trend */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg">Revenue · last 14 days</p>
              <p className="text-xs text-muted-foreground">Paid, shipped, and delivered orders.</p>
            </div>
            <span className="rounded-full bg-[var(--sage)]/15 px-3 py-1 text-xs font-medium text-[var(--sage)]">
              {formatGHS(revenue, { currency })}
            </span>
          </div>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  formatter={(v: any) => [formatGHS(Number(v), { currency }), "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--primary)"
                  strokeWidth={2.2}
                  fill="url(#revGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders by status */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="font-display text-lg">Orders by status</p>
          <p className="text-xs text-muted-foreground">A live picture of your funnel.</p>
          {statusSeries.length === 0 ? (
            <EmptyChart hint="No orders yet — share your store link." />
          ) : (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusSeries}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={54}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                  >
                    {statusSeries.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] ?? "var(--muted-foreground)"} />
                    ))}
                  </Pie>
                  <Legend
                    verticalAlign="bottom"
                    height={28}
                    iconType="circle"
                    formatter={(v) => <span className="text-xs capitalize text-muted-foreground">{v}</span>}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Top products */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg">Top products</p>
              <p className="text-xs text-muted-foreground">Ranked by revenue.</p>
            </div>
            <Link
              to="/dashboard/products"
              className="text-xs font-medium text-primary hover:underline"
            >
              Manage →
            </Link>
          </div>
          {(topProducts.data ?? []).length === 0 ? (
            <EmptyChart hint="Add products to see this chart come alive." />
          ) : (
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topProducts.data ?? []}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="title"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={110}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--accent)" }}
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => [formatGHS(Number(v), { currency }), "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="font-display text-lg">Quick actions</p>
          <div className="mt-3 grid gap-2">
            <QuickAction to="/dashboard/products" title="Add a product" body="Snap a photo, AI writes the rest." icon={<Package className="h-4 w-4" />} />
            <QuickAction to="/chat" title="Reply to buyers" body={`${stats.data?.unreadChats ?? 0} unread thread${(stats.data?.unreadChats ?? 0) === 1 ? "" : "s"}`} icon={<MessageCircle className="h-4 w-4" />} />
            <QuickAction to="/dashboard/deliveries" title="Request a rider" body="Dispatch a paid order." icon={<Truck className="h-4 w-4" />} />
            <QuickAction to="/dashboard/affiliate" title="Grow with affiliates" body="Recruit resellers." icon={<Users className="h-4 w-4" />} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Small parts                                 */
/* -------------------------------------------------------------------------- */

function KPI({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-white"
          style={{ background: `color-mix(in oklab, ${accent} 85%, transparent)` }}
        >
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className="mt-3 font-display text-2xl leading-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function QuickAction({
  to,
  title,
  body,
  icon,
}: {
  to: any;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border border-border bg-background p-3 hover:border-primary hover:bg-accent"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function EmptyChart({ hint }: { hint: string }) {
  return (
    <div className="mt-4 grid h-64 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
      {hint}
    </div>
  );
}
