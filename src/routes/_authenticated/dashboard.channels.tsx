import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Instagram, MessageCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/dashboard/channels")({
  component: ChannelsPage,
});

const CHANNELS = [
  { kind: "meta" as const, name: "Instagram + Facebook", body: "Sync your catalog to Meta Commerce, tag products in posts.", icon: Instagram, color: "var(--terracotta)" },
  { kind: "tiktok" as const, name: "TikTok Shop", body: "Publish your catalog and receive TikTok Shop orders in BASIC.", icon: Radio, color: "var(--ink)" },
  { kind: "whatsapp" as const, name: "WhatsApp Business", body: "Send order confirmations, shipping updates, and chat-to-buy links.", icon: MessageCircle, color: "var(--sage)" },
];

function ChannelsPage() {
  const { user } = useSession();
  const qc = useQueryClient();

  const store = useQuery({
    queryKey: ["my-store-id", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id").eq("owner_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const channels = useQuery({
    queryKey: ["channels", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { data } = await supabase.from("channels").select("kind, status").eq("store_id", store.data!.id);
      return data ?? [];
    },
  });

  const connected = new Map((channels.data ?? []).map((c) => [c.kind, c.status]));

  const connect = useMutation({
    mutationFn: async (kind: "meta" | "tiktok" | "whatsapp") => {
      const existing = connected.get(kind);
      if (existing) {
        const { error } = await supabase.from("channels").delete().eq("store_id", store.data!.id).eq("kind", kind);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("channels").insert({ store_id: store.data!.id, kind, status: "connected" });
        if (error) throw error;
      }
    },
    onSuccess: (_, kind) => {
      toast.success(connected.get(kind) ? `Disconnected ${kind}` : `Connected ${kind}. OAuth handshake ships next release.`);
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!store.data) return <div className="p-8 pb-24 text-sm text-muted-foreground">You need a store first.</div>;

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">Social channels</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sell everywhere your customers hang out. BASIC keeps your catalog and orders in sync.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {CHANNELS.map((c) => {
          const on = !!connected.get(c.kind);
          return (
            <div key={c.kind} className="rounded-2xl border border-border bg-card p-5">
              <div className="grid h-11 w-11 place-items-center rounded-full text-white" style={{ backgroundColor: `oklch(from ${c.color} l c h)` }}>
                <c.icon className="h-5 w-5" />
              </div>
              <p className="mt-3 font-display text-lg">{c.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
              <button
                onClick={() => connect.mutate(c.kind)}
                disabled={connect.isPending}
                className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium disabled:opacity-60 ${on ? "bg-[var(--sage)]/15 text-[var(--sage)]" : "border border-border hover:bg-accent"}`}
              >
                {on ? <><Check className="h-4 w-4" /> Connected · manage</> : "Connect"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Live OAuth handshakes for Meta, TikTok Shop, and WhatsApp Business ship in the next release along with catalog sync.
      </p>
    </div>
  );
}
