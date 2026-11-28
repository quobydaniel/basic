import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";

import { adminListAffiliates } from "@/lib/admin.queries";
import {
  AdminPage,
  AdminPanel,
  AdminPanelHead,
  AdminEmpty,
  AdminError,
  PearlBadge,
  StatTile,
  statusTone,
} from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/affiliates")({
  component: AdminAffiliates,
});

type ListingRow = {
  id: string;
  affiliate_name: string | null;
  commission_pct: number;
  custom_price: number | null;
  custom_title: string | null;
  status: string;
  created_at: string;
  product: { id: string; title: string; currency: string; base_price: number } | null;
  store: { id: string; name: string; slug: string } | null;
};

function AdminAffiliates() {
  const listings = useQuery({
    queryKey: ["admin", "affiliates"],
    queryFn: () => adminListAffiliates(),
  });

  const rows = (listings.data ?? []) as unknown as ListingRow[];
  const active = rows.filter((r) => r.status === "active").length;
  const stores = new Set(rows.map((r) => r.store?.id).filter(Boolean)).size;

  return (
    <AdminPage
      title="Affiliates"
      subtitle="Affiliate listings across the platform — who is promoting which store's products and on what commission. Real listings only; payouts are not built yet."
    >
      {listings.isLoading && (
        <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
          Loading affiliate listings…
        </div>
      )}
      {listings.error && <AdminError message={(listings.error as Error).message} />}

      {listings.data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile icon={HandCoins} label="Listings" value={rows.length} />
            <StatTile icon={HandCoins} label="Active" value={active} />
            <StatTile icon={HandCoins} label="Stores involved" value={stores} />
          </div>

          <AdminPanel className="mt-4">
            <AdminPanelHead title="Affiliate listings" hint={`${rows.length} rows`} />
            {rows.length === 0 ? (
              <AdminEmpty
                text="No affiliate listings yet."
                hint="Listings appear when sellers expose products for affiliate promotion."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 md:px-5">Product</th>
                      <th className="px-4 py-3">Store</th>
                      <th className="px-4 py-3">Affiliate</th>
                      <th className="px-4 py-3 text-right">Commission</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-3 font-medium md:px-5">
                          {r.custom_title || r.product?.title || "—"}
                          {r.custom_price != null && (
                            <div className="text-xs font-normal text-muted-foreground">
                              custom price {r.product?.currency ?? "GH₵"}{" "}
                              {Number(r.custom_price).toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={r.store ? `/s/${r.store.slug}` : undefined}
                            className="hover:text-gold hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.store?.name ?? "—"}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {r.affiliate_name ?? r.id.slice(0, 8) + "…"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {Number(r.commission_pct ?? 0).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3">
                          <PearlBadge tone={statusTone(r.status)}>{r.status}</PearlBadge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </AdminPanel>
        </>
      )}
    </AdminPage>
  );
}
