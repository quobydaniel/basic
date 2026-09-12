import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Truck, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/deliveries")({
  component: DeliveriesPage,
});

function DeliveriesPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [creating, setCreating] = useState<{ orderId?: string } | null>(null);

  const store = useQuery({
    queryKey: ["my-store", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("stores").select("id, name").eq("owner_id", user!.id).limit(1).maybeSingle()).data,
  });

  const reqs = useQuery({
    queryKey: ["store-deliveries", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_requests" as any)
        .select("id, pickup_address, dropoff_address, offered_fee, status, created_at, rider:riders(vehicle_type, phone)")
        .eq("store_id", store.data!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (!store.data?.id) return;
    const ch = supabase
      .channel(`store-deliv-${store.data.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests", filter: `store_id=eq.${store.data.id}` }, () =>
        qc.invalidateQueries({ queryKey: ["store-deliveries"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [store.data?.id, qc]);

  return (
    <div className="p-4 pb-24 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Deliveries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Request a rider for any paid order.</p>
        </div>
        <button onClick={() => setCreating({})} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          <Plus className="h-4 w-4" /> New request
        </button>
      </div>

      <div className="mt-6 space-y-2">
        {(reqs.data ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
            <Truck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No delivery requests yet.</p>
          </div>
        )}
        {(reqs.data ?? []).map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{r.status.replace("_", " ")}</p>
                <p className="mt-1 text-sm">Pickup: {r.pickup_address ?? "—"}</p>
                <p className="text-sm text-muted-foreground">Dropoff: {r.dropoff_address ?? "—"}</p>
                {r.rider && <p className="mt-1 text-xs">Rider: {r.rider.vehicle_type} · {r.rider.phone}</p>}
              </div>
              <p className="font-display text-lg">{formatGHS(r.offered_fee)}</p>
            </div>
          </div>
        ))}
      </div>

      {creating && store.data && (
        <NewRequest storeId={store.data.id} onClose={() => setCreating(null)} onDone={() => { setCreating(null); qc.invalidateQueries({ queryKey: ["store-deliveries"] }); }} />
      )}
    </div>
  );
}

function NewRequest({ storeId, onClose, onDone }: { storeId: string; onClose: () => void; onDone: () => void }) {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [fee, setFee] = useState("20");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const { error } = await supabase.from("delivery_requests" as any).insert({
        store_id: storeId,
        pickup_address: pickup,
        dropoff_address: dropoff,
        offered_fee: Number(fee),
        notes,
      });
      if (error) throw error;
      toast.success("Rider request posted");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center md:p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-card p-6 md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-2xl">Request a rider</h2>
        <div className="mt-4 space-y-3">
          <input value={pickup} onChange={(e) => setPickup(e.target.value)} placeholder="Pickup address" className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm" />
          <input value={dropoff} onChange={(e) => setDropoff(e.target.value)} placeholder="Dropoff address" className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm" />
          <input value={fee} onChange={(e) => setFee(e.target.value)} type="number" placeholder="Offered fee (GHS)" className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the rider" rows={2} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm" />
          <button onClick={submit} disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? "Posting…" : "Post to riders"}
          </button>
        </div>
      </div>
    </div>
  );
}
