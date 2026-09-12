import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminSetProductStatus } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/quoby/products")({
  component: AdminProducts,
});

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/20 text-foreground",
  draft: "bg-amber-500/20 text-foreground",
  archived: "bg-muted text-muted-foreground",
};

function AdminProducts() {
  const qc = useQueryClient();
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
    mutationFn: (v: { product_id: string; status: string }) => adminSetProductStatus({ data: v as never }),
    onSuccess: () => {
      toast.success("Product status updated");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (products.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading products…</div>;
  if (products.error) return <div className="p-6 text-sm text-destructive">Failed to load products: {(products.error as Error).message}</div>;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-2xl">Products</h1>
      <p className="mt-1 text-sm text-muted-foreground">Archive or reactivate any listing.</p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {(products.data ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.store?.name ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-xs font-medium">
                  {p.currency} {Number(p.base_price).toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[p.status] ?? "bg-muted"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    aria-label={`Set status for ${p.title}`}
                    value={p.status}
                    disabled={setStatus.isPending}
                    onChange={(e) => setStatus.mutate({ product_id: p.id, status: e.target.value })}
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
    </div>
  );
}
