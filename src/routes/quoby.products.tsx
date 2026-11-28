import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminSetProductStatus } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminPage,
  AdminPanel,
  AdminPanelHead,
  AdminEmpty,
  AdminError,
  StatusBadge,
} from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/products")({
  component: AdminProducts,
});

function AdminProducts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const products = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, status, base_price, currency, created_at, store:stores(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as {
        id: string;
        title: string;
        status: string;
        base_price: number;
        currency: string;
        created_at: string;
        store: { name: string } | null;
      }[];
    },
  });

  const setStatus = useMutation({
    mutationFn: (v: { product_id: string; status: string }) =>
      adminSetProductStatus({ data: v as never }),
    onSuccess: () => {
      toast.success("Product status updated");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = products.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.store?.name ?? "").toLowerCase().includes(q),
    );
  }, [products.data, search]);

  return (
    <AdminPage
      title="Products"
      subtitle="Archive or reactivate any listing — the platform's real moderation lever while a formal report queue does not exist."
      actions={
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product or store"
          aria-label="Search products"
          className="pearl-input w-48 py-2 text-sm md:w-60"
        />
      }
    >
      {products.isLoading && (
        <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
          Loading products…
        </div>
      )}
      {products.error && <AdminError message={(products.error as Error).message} />}
      {products.data && (
        <AdminPanel>
          <AdminPanelHead title="Latest 200 listings" hint={`${rows.length} shown`} />
          {rows.length === 0 ? (
            <AdminEmpty text={search ? `No products match “${search}”.` : "No products yet."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 md:px-5">Product</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 md:px-5">
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-muted-foreground">{p.store?.name ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium">
                        {p.currency} {Number(p.base_price).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Set status for ${p.title}`}
                          value={p.status}
                          disabled={setStatus.isPending}
                          onChange={(e) =>
                            setStatus.mutate({ product_id: p.id, status: e.target.value })
                          }
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                        >
                          {["draft", "active", "archived"].map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminPanel>
      )}
    </AdminPage>
  );
}
