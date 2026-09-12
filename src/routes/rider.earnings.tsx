import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/rider/earnings")({
  component: Earnings,
});

function Earnings() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ["rider-earnings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: rider } = await supabase.from("riders" as any).select("id").eq("user_id", user!.id).maybeSingle();
      if (!rider) return { total: 0, rows: [] as any[] };
      const { data } = await supabase
        .from("delivery_requests" as any)
        .select("id, offered_fee, delivered_at, store:stores(name)")
        .eq("rider_id", (rider as any).id)
        .eq("status", "delivered")
        .order("delivered_at", { ascending: false });
      const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.offered_fee ?? 0), 0);
      return { total, rows: (data ?? []) as any[] };
    },
  });
  return (
    <div className="p-4">
      <h1 className="mb-1 font-display text-2xl">Earnings</h1>
      <p className="mb-4 text-sm text-muted-foreground">Total: <span className="font-display text-lg text-foreground">{formatGHS(q.data?.total ?? 0)}</span></p>
      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
        {(q.data?.rows ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{r.store?.name}</p>
              <p className="text-xs text-muted-foreground">{r.delivered_at && new Date(r.delivered_at).toLocaleString()}</p>
            </div>
            <p className="font-display">{formatGHS(r.offered_fee)}</p>
          </div>
        ))}
        {(q.data?.rows ?? []).length === 0 && <p className="p-6 text-sm text-muted-foreground">No completed deliveries yet.</p>}
      </div>
    </div>
  );
}
