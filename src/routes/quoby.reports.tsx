import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AdminPage, BlockedPanel } from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/reports")({
  component: AdminReports,
});

function AdminReports() {
  return (
    <AdminPage
      title="Reports & disputes"
      subtitle="Abuse reports and order disputes. Blocked state, documented honestly — no report queue exists in the backend yet."
    >
      <div className="space-y-4">
        <BlockedPanel
          title="Report queue"
          exists="Nothing — the schema has no reports table, no report categories, no evidence storage."
          needed="A reports table (category, reported entity, reporter, evidence, status) plus a resolution workflow before the queue can exist. Frontend-only report UIs would fabricate a moderation trail that isn't there."
          meanwhile={
            <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
              <span className="text-xs text-muted-foreground">
                Abuse response that DOES exist today:
              </span>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to="/quoby/products">Archive products →</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to="/quoby/stores">Suspend stores →</Link>
              </Button>
            </div>
          }
        />
        <BlockedPanel
          title="Order disputes"
          exists="Nothing — no disputes table or workflow. Order status transitions (cancelled, refunded) are enforced server-side through the store's own order workflow."
          needed="A disputes table tied to orders with party, reason, evidence and resolution states, plus admin RPCs."
        />
      </div>
    </AdminPage>
  );
}
