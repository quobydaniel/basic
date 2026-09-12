import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/rider/profile")({
  component: RiderProfile,
});

function RiderProfile() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ["rider-me", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("riders" as any).select("*").eq("user_id", user!.id).maybeSingle()).data as any,
  });
  if (!q.data) return <p className="p-6 text-sm">No rider profile yet.</p>;
  return (
    <div className="p-4">
      <h1 className="mb-4 font-display text-2xl">Rider profile</h1>
      <dl className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Vehicle</dt><dd>{q.data.vehicle_type}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Plate</dt><dd>{q.data.license_plate ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd>{q.data.phone ?? "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Rating</dt><dd>{q.data.rating}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Approved</dt><dd>{q.data.is_approved ? "Yes" : "Pending"}</dd></div>
      </dl>
    </div>
  );
}
