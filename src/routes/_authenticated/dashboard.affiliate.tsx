import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Handshake, ListChecks, Share2, Store, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/affiliate")({
  component: AffiliatePage,
});

type AffiliateListing = {
  id: string;
  custom_title: string | null;
  commission_pct: number;
  status: string;
  source_product: {
    id: string;
    slug: string;
    title: string;
    base_price: number;
    currency: string;
    product_media: { url: string }[];
    store: { slug: string; name: string } | null;
  } | null;
};

/** Affiliate workspace — re-list partner products in your storefront, earn
    the seller's advertised commission on arranged sales. Click tracking and
    payout statuses have no backend tables yet, so this page shows REAL data
    only (listings, commissions on offer) and never invents earnings. */
function AffiliatePage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<string | null>(null);

  const store = useQuery({
    queryKey: ["my-store", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("stores")
          .select("id, name, slug")
          .eq("owner_id", user!.id)
          .limit(1)
          .maybeSingle()
      ).data,
  });

  const mine = useQuery({
    queryKey: ["my-affiliate", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("affiliate_listings")
        .select(
          "id, custom_title, commission_pct, status, source_product:products(id, slug, title, base_price, currency, product_media(url), store:stores(slug, name))",
        )
        .eq("affiliate_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AffiliateListing[];
    },
  });

  const opted = useQuery({
    queryKey: ["opted-in-catalog"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(
          "id, title, base_price, currency, slug, affiliate_commission_pct, store:stores(name, slug), product_media(url)",
        )
        .eq("status", "active")
        .eq("allow_affiliates", true)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as any[];
    },
  });

  const relist = useMutation({
    mutationFn: async (p: any) => {
      if (!store.data) throw new Error("Create a store first");
      const { error } = await (supabase as any).from("affiliate_listings").insert({
        affiliate_user_id: user!.id,
        source_product_id: p.id,
        store_id: store.data.id,
        commission_pct: p.affiliate_commission_pct ?? 0,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Added to your store — it now shows as a Partner pick");
      qc.invalidateQueries({ queryKey: ["my-affiliate"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const delist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("affiliate_listings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed from your store");
      qc.invalidateQueries({ queryKey: ["my-affiliate"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    onSettled: () => setRemoving(null),
  });

  function shareListing(l: AffiliateListing) {
    const p = l.source_product;
    if (!p?.store?.slug || !p?.slug) return;
    const url = `${window.location.origin}/s/${p.store.slug}/p/${p.slug}`;
    const text = `${l.custom_title ?? p.title} — from ${p.store.name} on BASIC`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: text, text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${text} ${url}`);
      toast.success("Link copied");
    }
  }

  const listings = mine.data ?? [];
  const takenIds = new Set(listings.map((l) => l.source_product?.id).filter(Boolean) as string[]);
  const avgCommission =
    listings.length > 0
      ? Math.round(
          (listings.reduce((s, l) => s + Number(l.commission_pct ?? 0), 0) / listings.length) * 10,
        ) / 10
      : null;

  return (
    <div className="p-4 pb-24 md:p-8">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-gold" />
        <h1 className="font-display text-3xl">Affiliate</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Re-list products from other sellers as Partner picks and earn their advertised commission.
      </p>

      {/* Overview — real counts only */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Your partner picks"
          value={String(listings.length)}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatCard
          label="Avg. commission"
          value={avgCommission != null ? `${avgCommission}%` : "—"}
          icon={<Handshake className="h-4 w-4" />}
        />
        <StatCard
          label="Open catalog"
          value={String(opted.data?.length ?? 0)}
          icon={<Store className="h-4 w-4" />}
        />
        <StatCard
          label="Your storefront"
          value={store.data?.name ?? "—"}
          icon={<Store className="h-4 w-4" />}
          link={
            store.data?.slug
              ? { to: "/s/$storeSlug", params: { storeSlug: store.data.slug } }
              : undefined
          }
        />
      </div>

      {/* How earnings work — honest, no invented payout states */}
      <div className="pearl-card mt-5 p-5">
        <p className="text-sm font-semibold">How affiliate earnings work</p>
        <ul className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <li>
            • Each seller sets the commission % on products they open to affiliates — it shows on
            every catalog card.
          </li>
          <li>
            • Your picks appear on your storefront as{" "}
            <span className="font-medium text-foreground">Partner picks</span>, always crediting the
            original seller.
          </li>
          <li>
            • Buyers buy from the original product page — the commission for referred sales is
            settled with the seller directly for now.
          </li>
          <li className="text-muted-foreground/80">
            Click tracking and automated payouts aren't built yet — nothing on this page estimates
            earnings you can't actually verify.
          </li>
        </ul>
      </div>

      {/* My re-listings */}
      <section className="mt-6">
        <h2 className="font-display text-xl">My partner picks</h2>
        {listings.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing re-listed yet — add products from the catalog below.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {listings.map((l) => {
              const p = l.source_product;
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {p?.product_media?.[0]?.url && (
                      <img
                        src={p.product_media[0].url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.custom_title ?? p?.title}</p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      from {p?.store?.name ?? "—"} ·{" "}
                      {formatGHS(p?.base_price ?? 0, { currency: p?.currency ?? "GHS" })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold">
                    {l.commission_pct}%
                  </span>
                  <button
                    onClick={() => shareListing(l)}
                    aria-label="Share the original listing"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Share2 className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                  <button
                    onClick={() => {
                      setRemoving(l.id);
                      delist.mutate(l.id);
                    }}
                    disabled={delist.isPending}
                    aria-label="Remove from my store"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Catalog */}
      <section className="mt-8">
        <h2 className="font-display text-xl">Open catalog</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Products sellers have opened to affiliates.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(opted.data ?? []).map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="aspect-square overflow-hidden rounded-xl bg-muted">
                {p.product_media?.[0]?.url && (
                  <img
                    src={p.product_media[0].url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{p.store?.name}</p>
              <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
              <p className="mt-0.5 flex items-center justify-between">
                <span className="font-display text-sm">
                  {formatGHS(p.base_price, { currency: p.currency })}
                </span>
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold">
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
            <p className="col-span-full text-sm text-muted-foreground">
              No products opted into the affiliate program yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  link,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  link?: { to: "/s/$storeSlug"; params: { storeSlug: string } };
}) {
  const body = (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-2 truncate font-display text-2xl text-foreground">{value}</p>
    </div>
  );
  return link ? (
    <Link {...link} className="hover:border-gold rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}
