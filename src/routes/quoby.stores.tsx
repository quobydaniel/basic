import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminSetStorePlan, adminSetStoreStatus } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/quoby/stores")({
  component: AdminStores,
});

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-500/20 text-foreground",
  paused: "bg-amber-500/20 text-foreground",
  suspended: "bg-destructive/20 text-destructive",
};

function AdminStores() {
  const qc = useQueryClient();
  const stores = useQuery({
    queryKey: ["admin", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, slug, status, plan, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as { id: string; name: string; slug: string; status: string; plan: string; created_at: string }[];
    },
  });

  const setStatus = useMutation({
    mutationFn: (v: { store_id: string; status: string }) => adminSetStoreStatus({ data: v as never }),
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

  if (stores.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading stores…</div>;
  if (stores.error) return <div className="p-6 text-sm text-destructive">Failed to load stores: {(stores.error as Error).message}</div>;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-2xl">Stores</h1>
      <p className="mt-1 text-sm text-muted-foreground">Moderate stores: pause, suspend, or flip plans.</p>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(stores.data ?? []).map((s) => (
              <tr key={s.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{s.name}</div>
                  <a href={`/s/${s.slug}`} className="text-xs text-muted-foreground hover:text-foreground">
                    /s/{s.slug}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[s.status] ?? "bg-muted"}`}>
                      {s.status}
                    </span>
                    <select
                      aria-label={`Set status for ${s.name}`}
                      value={s.status}
                      disabled={setStatus.isPending}
                      onChange={(e) => setStatus.mutate({ store_id: s.id, status: e.target.value })}
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
                    className="rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
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
    </div>
  );
}
