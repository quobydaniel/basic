import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { MapPin, Truck, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/rider/active")({
  component: ActiveDeliveries,
});

function ActiveDeliveries() {
  const { user } = useSession();
  const qc = useQueryClient();
  const rider = useQuery({
    queryKey: ["rider-me", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("riders" as any).select("id").eq("user_id", user!.id).maybeSingle()).data as any,
  });
  const active = useQuery({
    queryKey: ["rider-active", rider.data?.id],
    enabled: !!rider.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_requests" as any)
        .select("id, pickup_address, dropoff_address, offered_fee, status, store:stores(name)")
        .eq("rider_id", rider.data.id)
        .in("status", ["assigned", "picked_up"])
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("rider-active-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, () => qc.invalidateQueries({ queryKey: ["rider-active"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function advance(id: string, next: "picked_up" | "delivered") {
    const patch: any = { status: next };
    if (next === "picked_up") patch.picked_up_at = new Date().toISOString();
    if (next === "delivered") patch.delivered_at = new Date().toISOString();
    const { error } = await supabase.from("delivery_requests" as any).update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("delivery_events" as any).insert({ delivery_request_id: id, status: next });
    qc.invalidateQueries({ queryKey: ["rider-active"] });
    toast.success(next === "picked_up" ? "Picked up" : "Delivered!");
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 font-display text-2xl">Active</h1>
      {(active.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No active deliveries.</p>}
      <div className="space-y-2">
        {(active.data ?? []).map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{r.store?.name}</p>
            <p className="mt-1 flex items-center gap-1 text-sm"><MapPin className="h-3.5 w-3.5 text-[var(--terracotta)]" /> {r.pickup_address}</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {r.dropoff_address}</p>
            <p className="mt-2 font-display">{formatGHS(r.offered_fee)}</p>
            <div className="mt-3 flex gap-2">
              {r.status === "assigned" && (
                <button onClick={() => advance(r.id, "picked_up")} className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground">
                  <Truck className="mr-1 inline h-4 w-4" /> Picked up
                </button>
              )}
              {r.status === "picked_up" && (
                <button onClick={() => advance(r.id, "delivered")} className="flex-1 rounded-full bg-[var(--sage)] py-2 text-sm font-semibold text-black">
                  <CheckCircle2 className="mr-1 inline h-4 w-4" /> Delivered
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
