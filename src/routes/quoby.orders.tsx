import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { adminListOrders } from "@/lib/admin.queries";
import {
  AdminPage,
  AdminPanel,
  AdminPanelHead,
  AdminEmpty,
  AdminError,
  StatusBadge,
} from "@/components/admin/AdminKit";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/quoby/orders")({
  component: AdminOrders,
});

const STATUSES = [
  "all",
  "pending",
  "paid",
  "fulfilled",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  subtotal: number;
  currency: string;
  created_at: string;
  fulfillment_type: string | null;
  payment_term: string | null;
  source: string;
  buyer_id: string | null;
  shipping_address: unknown;
  store: { id: string; name: string; slug: string } | null;
};

function AdminOrders() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<OrderRow | null>(null);

  const orders = useQuery({
    queryKey: ["admin", "orders", status, search],
    queryFn: () => adminListOrders({ data: { status, search: search || undefined } }),
  });

  return (
    <AdminPage
      title="Order oversight"
      subtitle="Every order on the platform with its live server-side status. Read-only — status transitions belong to the store's own workflow and the place_order hardening rules."
      actions={
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #"
            aria-label="Search order number"
            className="pearl-input w-44 py-2 pl-8 text-sm md:w-56"
          />
        </label>
      }
    >
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              status === s
                ? "border-gild/40 bg-gild/15 text-gold"
                : "border-border/70 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {orders.isLoading && (
          <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
            Loading orders…
          </div>
        )}
        {orders.error && <AdminError message={(orders.error as Error).message} />}
        {orders.data && (
          <AdminPanel>
            {orders.data.length === 0 ? (
              <AdminEmpty
                text={
                  search
                    ? `No orders match “${search}”.`
                    : status === "all"
                      ? "No orders yet."
                      : `No ${status} orders.`
                }
                hint="Orders appear here the moment the backend creates them — the console never fabricates records."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 md:px-5">Order</th>
                      <th className="px-4 py-3">Store</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders.data as unknown as OrderRow[]).map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => setOpen(o)}
                        className="cursor-pointer border-b border-border/50 transition-colors last:border-0 hover:bg-gild/5"
                      >
                        <td className="px-4 py-3 font-medium md:px-5">
                          {o.order_number}
                          <div className="text-xs font-normal text-muted-foreground">
                            {o.fulfillment_type ?? "—"} · {o.source}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={o.store ? `/s/${o.store.slug}` : undefined}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-gold hover:underline"
                          >
                            {o.store?.name ?? "—"}
                          </a>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {o.currency} {Number(o.total ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display">Order {open.order_number}</SheetTitle>
                <SheetDescription>
                  Placed {new Date(open.created_at).toLocaleString()} · via {open.source}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-4 pb-8">
                <div className="flex items-center justify-between">
                  <StatusBadge status={open.status} />
                  <span className="font-display text-xl">
                    {open.currency} {Number(open.total ?? 0).toFixed(2)}
                  </span>
                </div>
                <dl className="space-y-2 rounded-xl border border-border/70 p-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Store</dt>
                    <dd className="text-right font-medium">{open.store?.name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd>
                      {open.currency} {Number(open.subtotal ?? 0).toFixed(2)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Fulfillment</dt>
                    <dd className="capitalize">{open.fulfillment_type ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Payment term</dt>
                    <dd className="capitalize">{open.payment_term ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Buyer ref</dt>
                    <dd className="font-mono text-xs">
                      {open.buyer_id ? `${open.buyer_id.slice(0, 8)}…` : "—"}
                    </dd>
                  </div>
                </dl>
                {open.shipping_address != null && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Shipping address
                    </p>
                    <pre className="overflow-x-auto rounded-xl border border-border/70 bg-muted/30 p-3 font-mono text-xs">
                      {JSON.stringify(open.shipping_address, null, 2)}
                    </pre>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Refunds, reversals and settlement actions are not available in this console — no
                  payments backend contract exists yet (see docs/BUILD-PLAN.md §6).
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AdminPage>
  );
}
