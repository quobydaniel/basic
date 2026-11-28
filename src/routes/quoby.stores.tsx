import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminSetStorePlan, adminSetStoreStatus } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  AdminPage,
  AdminPanel,
  AdminPanelHead,
  AdminEmpty,
  AdminError,
  StatusBadge,
} from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/stores")({
  component: AdminStores,
});

function AdminStores() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const stores = useQuery({
    queryKey: ["admin", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, slug, status, plan, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        slug: string;
        status: string;
        plan: string;
        created_at: string;
      }[];
    },
  });

  const setStatus = useMutation({
    mutationFn: (v: { store_id: string; status: string }) =>
      adminSetStoreStatus({ data: v as never }),
    onSuccess: () => {
      toast.success("Store status updated");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPlan = useMutation({
    mutationFn: (v: { store_id: string; plan: string }) => adminSetStorePlan({ data: v as never }),
    onSuccess: () => {
      toast.success("Store plan updated");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const all = stores.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q));
  }, [stores.data, search]);

  return (
    <AdminPage
      title="Stores"
      subtitle="Moderate storefronts: pause, suspend, or flip plans. Changes apply immediately through admin server functions."
      actions={
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search store or slug"
          aria-label="Search stores"
          className="pearl-input w-48 py-2 text-sm md:w-60"
        />
      }
    >
      {stores.isLoading && (
        <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
          Loading stores…
        </div>
      )}
      {stores.error && <AdminError message={(stores.error as Error).message} />}
      {stores.data && (
        <AdminPanel>
          <AdminPanelHead title="Store directory" hint={`${rows.length} shown`} />
          {rows.length === 0 ? (
            <AdminEmpty text={search ? `No stores match “${search}”.` : "No stores yet."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 md:px-5">Store</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3 md:px-5">
                        <div className="font-medium">{s.name}</div>
                        <a
                          href={`/s/${s.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:text-gold hover:underline"
                        >
                          /s/{s.slug}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={s.status} />
                          <select
                            aria-label={`Set status for ${s.name}`}
                            value={s.status}
                            disabled={setStatus.isPending}
                            onChange={(e) =>
                              setStatus.mutate({ store_id: s.id, status: e.target.value })
                            }
                            className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
                          >
                            {["active", "paused", "suspended"].map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Set plan for ${s.name}`}
                          value={s.plan}
                          disabled={setPlan.isPending}
                          onChange={(e) => setPlan.mutate({ store_id: s.id, plan: e.target.value })}
                          className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs capitalize"
                        >
                          {["free", "pro"].map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(s.created_at).toLocaleDateString()}
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
