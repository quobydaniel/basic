import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  component: OrdersPage,
});

const STATUSES = ["pending", "paid", "fulfilled", "shipped", "delivered", "cancelled", "refunded"] as const;

function OrdersPage() {
  const { user } = useSession();
  const qc = useQueryClient();

  const orders = useQuery({
    queryKey: ["dashboard-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: stores } = await supabase.from("stores").select("id").eq("owner_id", user!.id);
      const ids = (stores ?? []).map((s) => s.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, total, currency, contact_email, created_at, buyer_confirmed_at, order_items(product_title, quantity)")
        .in("store_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("orders").update({ status: status as any }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order updated");
      qc.invalidateQueries({ queryKey: ["dashboard-orders"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Manage every order from every channel.</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
        {orders.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {(orders.data ?? []).length === 0 && !orders.isLoading && (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
            <p className="font-display text-lg">No orders yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Once a customer checks out, their order lands here.
            </p>
          </div>
        )}
        {(orders.data ?? []).map((o: any) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                #{o.order_number}
                {o.buyer_confirmed_at && (
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                    Buyer confirmed receipt ✓
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString()} · {o.contact_email ?? "guest"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(o.order_items ?? []).map((it: any) => `${it.quantity}× ${it.product_title}`).join(", ") || "—"}
              </p>
            </div>
            <p className="font-display text-lg">{formatGHS(o.total, { currency: o.currency })}</p>
            <select
              value={o.status}
              onChange={(e) => setStatus.mutate({ id: o.id, status: e.target.value })}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
