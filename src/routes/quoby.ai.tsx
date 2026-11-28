import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminGetModelConfig, adminSetModelConfig } from "@/lib/admin.functions";
import { AdminPage, AdminPanel, BlockedPanel } from "@/components/admin/AdminKit";

export const Route = createFileRoute("/quoby/ai")({
  component: AdminAIModels,
});

function AdminAIModels() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ["admin", "ai-models"],
    queryFn: () => adminGetModelConfig(),
  });

  const setModel = useMutation({
    mutationFn: (v: { fn_name: string; model_id: string }) =>
      adminSetModelConfig({ data: v as never }),
    onSuccess: () => {
      toast.success("Model config saved — effective on the next AI call");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminPage
      title="AI models"
      subtitle="Pick which NVIDIA NIM model each function uses. Saved overrides win; clear a field to fall back to the built-in registry. Models are account-gated — a model that 404s on build.nvidia.com isn't enabled for your key."
    >
      {config.isLoading && (
        <div className="pearl-card p-8 text-center text-sm text-muted-foreground">
          Loading AI config…
        </div>
      )}
      {config.error && (
        <div className="pearl-card p-5 text-sm text-error">
          Failed to load config: {(config.error as Error).message}
        </div>
      )}

      {config.data && (
        <div className="space-y-4">
          <AdminPanel>
            <div className="divide-y divide-border/60">
              {(config.data ?? []).map((row) => (
                <form
                  key={row.fnName}
                  className="px-4 py-4 md:px-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem(
                      "model",
                    ) as HTMLInputElement | null;
                    if (!input) return;
                    setModel.mutate({ fn_name: row.fnName, model_id: input.value.trim() });
                  }}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{row.fnName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Effective:{" "}
                        <span className="font-mono text-foreground">
                          {row.effective || "(none — heuristic)"}
                        </span>
                        {row.dbModel !== null && (
                          <span className="ml-2 rounded-full border border-gild/30 bg-gild/15 px-2 py-0.5 text-[10px] text-gold">
                            DB override
                          </span>
                        )}
                        {row.updatedAt && (
                          <span className="ml-2">
                            updated {new Date(row.updatedAt).toLocaleString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        name="model"
                        defaultValue={row.dbModel ?? ""}
                        placeholder={row.fileModel || "leave empty"}
                        className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs md:w-80"
                      />
                      <button
                        type="submit"
                        disabled={setModel.isPending}
                        className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </form>
              ))}
            </div>
          </AdminPanel>

          <BlockedPanel
            title="AI operations monitoring"
            exists="Model configuration above and the gateway's own key-pool budgeting (server-side). The ai_usage table is RLS self-only, so this console cannot read other users' request counts."
            needed="An admin-scoped usage view (service-role RPC or an ai_usage admin read policy) returning per-fn request counts, error rates and ration headroom — aggregated only, never raw prompts."
          />
        </div>
      )}
    </AdminPage>
  );
}
