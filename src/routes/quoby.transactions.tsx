import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AdminPage, BlockedPanel } from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/transactions")({
  component: AdminTransactions,
});

function AdminTransactions() {
  return (
    <AdminPage
      title="Transactions"
      subtitle="Payment records and settlement oversight. This page is an explicit blocked state, not a placeholder — it documents exactly what the backend must add before the console can show anything real."
    >
      <BlockedPanel
        title="Transactions & settlement"
        exists="Order amounts and paid-order GMV (see Overview), per-order payment terms on the Order oversight page. No payments, ledger or settlement tables exist in the schema."
        needed="A payments/transactions table (references, channel, state), settlement records, and admin-scoped RPCs before any reversal, payout or reconciliation UI can be built. The console will never imply payment reversal or settlement that does not exist."
        meanwhile={
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
            <span className="text-xs text-muted-foreground">Closest real data today:</span>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link to="/quoby/orders">Order oversight →</Link>
            </Button>
          </div>
        }
      />
    </AdminPage>
  );
}
