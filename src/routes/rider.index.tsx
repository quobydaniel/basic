import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MapPin, Package, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/rider/")({
  component: RiderHome,
});

function RiderHome() {
  const { user, loading } = useSession();
  const qc = useQueryClient();

  const rider = useQuery({
    queryKey: ["rider-me", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("riders" as any).select("*").eq("user_id", user!.id).maybeSingle();
      return data as any;
    },
  });

  const requests = useQuery({
    queryKey: ["rider-open"],
    enabled: !!rider.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_requests" as any)
        .select("id, pickup_address, dropoff_address, distance_km, offered_fee, notes, created_at, store:stores(name)")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("rider-open-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["rider-open"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("delivery_requests" as any)
        .update({ status: "assigned", rider_id: rider.data.id, assigned_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "open");
      if (error) throw error;
      await supabase.from("delivery_events" as any).insert({ delivery_request_id: id, status: "assigned", note: "Rider accepted" });
    },
    onSuccess: () => {
      toast.success("Accepted");
      qc.invalidateQueries({ queryKey: ["rider-open"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not accept"),
  });

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!user) return <p className="p-6 text-sm">Sign in to join as a rider.</p>;
  if (!rider.data) return <OnboardRider onDone={() => rider.refetch()} />;

  return (
    <div className="p-4">
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <Bike className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">{rider.data.vehicle_type}</p>
            <p className="text-xs text-muted-foreground">
              Rating {rider.data.rating} · {rider.data.completed_deliveries} deliveries
            </p>
          </div>
          <button
            onClick={async () => {
              await supabase.from("riders" as any).update({ is_online: !rider.data.is_online }).eq("id", rider.data.id);
              rider.refetch();
            }}
            className={`ml-auto rounded-full px-3 py-1.5 text-xs font-medium ${rider.data.is_online ? "bg-[var(--sage)] text-black" : "bg-muted text-foreground"}`}
          >
            {rider.data.is_online ? "Online" : "Go online"}
          </button>
        </div>
      </div>

      <h2 className="mb-2 font-display text-xl">Available deliveries</h2>
      {(requests.data ?? []).length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
          <Package className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No open deliveries right now.</p>
        </div>
      )}
      <div className="space-y-2">
        {(requests.data ?? []).map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{r.store?.name ?? "Store"}</p>
                <p className="mt-1 flex items-center gap-1 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-[var(--terracotta)]" /> {r.pickup_address ?? "Pickup"}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {r.dropoff_address ?? "Dropoff"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-xl">{formatGHS(r.offered_fee)}</p>
                {r.distance_km && <p className="text-xs text-muted-foreground">{r.distance_km} km</p>}
              </div>
            </div>
            <button
              onClick={() => accept.mutate(r.id)}
              disabled={accept.isPending}
              className="mt-3 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              Accept
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnboardRider({ onDone }: { onDone: () => void }) {
  const { user } = useSession();
  const [vehicle, setVehicle] = useState("motorbike");
  const [plate, setPlate] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("riders" as any).insert({
        user_id: user.id,
        vehicle_type: vehicle,
        license_plate: plate,
        phone,
      });
      if (error) throw error;
      await supabase.from("user_roles").insert({ user_id: user.id, role: "rider" as any });
      toast.success("Welcome, rider!");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <p className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--terracotta)]">
        <Bike className="h-3.5 w-3.5" /> Rider onboarding
      </p>
      <h1 className="font-display text-3xl">Deliver for local sellers</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pick your vehicle, add your plate. You'll see nearby delivery requests and can accept any that fit.
      </p>
      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Vehicle</span>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm">
            <option value="motorbike">Motorbike</option>
            <option value="bicycle">Bicycle</option>
            <option value="car">Car</option>
            <option value="van">Van</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">License plate</span>
          <input value={plate} onChange={(e) => setPlate(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm" placeholder="+233…" />
        </label>
        <button onClick={submit} disabled={busy} className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
          {busy ? "Setting up…" : "Start delivering"}
        </button>
      </div>
    </div>
  );
}
