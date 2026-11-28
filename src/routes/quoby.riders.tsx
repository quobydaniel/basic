import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bike, Phone } from "lucide-react";

import { adminListRiders } from "@/lib/admin.queries";
import {
  AdminPage,
  AdminPanel,
  AdminPanelHead,
  AdminEmpty,
  AdminError,
  PearlBadge,
  StatTile,
} from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/riders")({
  component: AdminRiders,
});

type RiderRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  vehicle_type: string;
  license_plate: string | null;
  is_online: boolean;
  is_approved: boolean;
  rating: number;
  completed_deliveries: number;
  created_at: string;
};

function AdminRiders() {
  const riders = useQuery({
    queryKey: ["admin", "riders"],
    queryFn: () => adminListRiders(),
  });

  const rows = (riders.data ?? []) as unknown as RiderRow[];
  const approved = rows.filter((r) => r.is_approved).length;
  const online = rows.filter((r) => r.is_online).length;
  const deliveries = rows.reduce((s, r) => s + (r.completed_deliveries ?? 0), 0);

  return (
    <AdminPage
      title="Riders"
      subtitle="Directory of registered riders and their delivery record. Read-only — approval happens through rider onboarding; this console never grants verification itself."
    >
      {riders.isLoading && (
        <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
          Loading riders…
        </div>
      )}
      {riders.error && <AdminError message={(riders.error as Error).message} />}

      {riders.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={Bike} label="Riders" value={rows.length} />
            <StatTile
              icon={Bike}
              label="Approved"
              value={approved}
              hint="verified via onboarding"
            />
            <StatTile
              icon={Bike}
              label="Online now"
              value={online}
              hint="availability switch is theirs"
            />
            <StatTile
              icon={Bike}
              label="Deliveries done"
              value={deliveries}
              hint="all riders, lifetime"
            />
          </div>

          <AdminPanel className="mt-4">
            <AdminPanelHead title="Rider directory" hint={`${rows.length} registered`} />
            {rows.length === 0 ? (
              <AdminEmpty
                text="No riders registered yet."
                hint="Riders appear here as soon as they create their rider profile in the app."
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {r.full_name || "Unnamed rider"}
                        {r.is_online && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-success">
                            <span className="h-1.5 w-1.5 rounded-full bg-success" /> online
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="capitalize">{r.vehicle_type}</span>
                        {r.license_plate && <span>· {r.license_plate}</span>}
                        {r.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {r.phone}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <PearlBadge tone={r.is_approved ? "green" : "warn"}>
                        {r.is_approved ? "approved" : "pending approval"}
                      </PearlBadge>
                      <PearlBadge tone="gold">★ {Number(r.rating ?? 0).toFixed(1)}</PearlBadge>
                      <PearlBadge tone="muted">{r.completed_deliveries} deliveries</PearlBadge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </>
      )}
    </AdminPage>
  );
}
