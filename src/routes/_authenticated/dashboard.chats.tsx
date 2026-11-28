// /dashboard/chats — the SELLER inbox, inside the seller dashboard. Buyer
// conversations for the user's store only; auto-pilot replies to buyers
// inside each thread (describe the product, track orders, close the deal).
// The buyer inbox lives at /chat. Header carries the store-wide Auto-reply
// AI switch (Pro) — the same toggle that appears in each thread.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { ChatShell } from "@/components/ChatShell";

export const Route = createFileRoute("/_authenticated/dashboard/chats")({
  component: SellerChatsPage,
});

function SellerChatsPage() {
  const { user } = useSession();
  const qc = useQueryClient();

  // Store meta for the auto-reply toggle. Resilient to the migration not
  // being applied yet — a missing column reads as "OFF", never breaks the page.
  const store = useQuery({
    queryKey: ["store-autopilot-meta-list", user?.id],
    enabled: !!user,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("stores" as any)
        .select("id, name, plan, auto_pilot")
        .eq("owner_id", user!.id)
        .limit(1)
        .maybeSingle() as any);
      if (error) return null;
      return data;
    },
  });
  const st = store.data as { id: string; name: string; plan: string; auto_pilot: boolean | null } | null;

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await (supabase.from("stores" as any).update({ auto_pilot: next }).eq("id", st!.id) as any);
      if (error) throw error;
    },
    onSuccess: (_d, next) => {
      toast.success(next ? "Auto-reply AI is ON — it answers buyers, takes orders and alerts you." : "Auto-reply AI is OFF.");
      qc.invalidateQueries({ queryKey: ["store-autopilot-meta-list"] });
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "";
      toast.error(/auto_pilot|PGRST204|column/i.test(m) ? "One-time setup needed — run the auto-pilot SQL migration in Supabase." : m || "Could not switch");
    },
  });

  const isPro = st?.plan === "pro";

  return (
    <div>
      {/* Auto-pilot card — visible to EVERY seller. Free stores see the
          Premium-locked variant (upgrade funnel) instead of nothing, so the
          empty-state promise ("switch on auto-pilot") always has a switch. */}
      {st && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${isPro && st.auto_pilot === true ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium leading-tight">
                Auto-reply AI
                {!isPro && (
                  <span className="rounded-full bg-[var(--gild)]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--gild)]">
                    ✦ Premium
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {!isPro
                  ? "Auto-pilot answers buyers, takes orders and alerts you — even while you're away."
                  : st.auto_pilot === true
                    ? "Answers NEW customers automatically — pause or resume the AI per chat inside any conversation."
                    : "Off — you reply yourself."}
              </p>
            </div>
          </div>
          {isPro ? (
            <button
              onClick={() => toggle.mutate(st.auto_pilot !== true)}
              disabled={toggle.isPending}
              role="switch"
              aria-checked={st.auto_pilot === true}
              aria-label="Toggle auto-reply AI"
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${st.auto_pilot === true ? "bg-emerald-500" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${st.auto_pilot === true ? "left-[1.375rem]" : "left-0.5"}`} />
            </button>
          ) : (
            <Link
              to="/pricing"
              className="shrink-0 rounded-full bg-[var(--gold)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--gold-foreground)] transition-shadow hover:shadow-[0_0_24px_-6px_var(--gold)]"
            >
              Upgrade
            </Link>
          )}
        </div>
      )}
      <ChatShell scope="selling" surface="dashboard" />
    </div>
  );
}
