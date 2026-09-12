import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { adminGetModelConfig, adminSetModelConfig } from "@/lib/admin.functions";

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
    mutationFn: (v: { fn_name: string; model_id: string }) => adminSetModelConfig({ data: v as never }),
    onSuccess: () => {
      toast.success("Model config saved — effective on the next AI call");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (config.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading AI config…</div>;
  if (config.error) return <div className="p-6 text-sm text-destructive">Failed to load config: {(config.error as Error).message}</div>;

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-2xl">AI Models</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick which NVIDIA NIM model each function uses. Saved overrides win; clear a field to fall back to the built-in registry. Models are account-gated — a model that 404s on build.nvidia.com isn't enabled for your key.
      </p>

      <div className="mt-4 space-y-3">
        {(config.data ?? []).map((row) => (
          <form
            key={row.fnName}
            className="rounded-2xl border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem("model") as HTMLInputElement | null);
              if (!input) return;
              setModel.mutate({ fn_name: row.fnName, model_id: input.value.trim() });
            }}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{row.fnName}</p>
                <p className="text-xs text-muted-foreground">
                  Effective: <span className="font-mono text-foreground">{row.effective || "(none — heuristic)"}</span>
                  {row.dbModel !== null && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px]">DB override</span>}
                  {row.updatedAt && (
                    <span className="ml-2">updated {new Date(row.updatedAt).toLocaleString()}</span>
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
    </div>
  );
}
