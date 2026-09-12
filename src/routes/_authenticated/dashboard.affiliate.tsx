import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/affiliate")({
  component: AffiliatePage,
});

function AffiliatePage() {
  const { user } = useSession();
  const qc = useQueryClient();

  const store = useQuery({
    queryKey: ["my-store", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("stores").select("id, name").eq("owner_id", user!.id).limit(1).maybeSingle()).data,
  });

  const opted = useQuery({
    queryKey: ["opted-in-catalog"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, title, base_price, currency, slug, affiliate_commission_pct, store:stores(name, slug), product_media(url)")
        .eq("status", "active")
        .eq("allow_affiliates", true)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  const mine = useQuery({
    queryKey: ["my-affiliate", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("affiliate_listings" as any)
        .select("id, source_product_id, custom_title, commission_pct, status")
        .eq("affiliate_user_id", user!.id);
      return (data ?? []) as any[];
    },
  });

  const relist = useMutation({
    mutationFn: async (p: any) => {
      if (!store.data) throw new Error("Create a store first");
      const { error } = await supabase.from("affiliate_listings" as any).insert({
        affiliate_user_id: user!.id,
        source_product_id: p.id,
        store_id: store.data.id,
        commission_pct: p.affiliate_commission_pct ?? 0,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to your store");
      qc.invalidateQueries({ queryKey: ["my-affiliate"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const takenIds = new Set((mine.data ?? []).map((m: any) => m.source_product_id));

  return (
    <div className="p-4 pb-24 md:p-8">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-[var(--gold)]" />
        <h1 className="font-display text-3xl">Affiliate catalog</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Re-list products from other sellers in your storefront and earn commission on every sale.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(opted.data ?? []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="aspect-square overflow-hidden rounded-xl bg-muted">
              {p.product_media?.[0]?.url && <img src={p.product_media[0].url} alt="" className="h-full w-full object-cover" />}
            </div>
            <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{p.store?.name}</p>
            <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
            <p className="mt-0.5 flex items-center justify-between">
              <span className="font-display text-sm">{formatGHS(p.base_price, { currency: p.currency })}</span>
              <span className="rounded-full bg-[var(--gold)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
                {p.affiliate_commission_pct}%
              </span>
            </p>
            <button
              disabled={takenIds.has(p.id) || relist.isPending}
              onClick={() => relist.mutate(p)}
              className="mt-2 w-full rounded-full bg-primary py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {takenIds.has(p.id) ? "In your store" : "Add to store"}
            </button>
          </div>
        ))}
        {(opted.data ?? []).length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No products opted into the affiliate program yet.</p>
        )}
      </div>
    </div>
  );
}
