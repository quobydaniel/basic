import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { ProductCardTile } from "./index";
import { StoreLocationCard } from "@/components/StoreChrome";
import { MapPin, BadgeCheck } from "lucide-react";

export const Route = createFileRoute("/s/$storeSlug/")({
  component: StorefrontPage,
});

function StorefrontPage() {
  const { storeSlug } = Route.useParams();

  const store = useQuery({
    queryKey: ["store", storeSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, slug, name, tagline, description, logo_url, banner_url, country, currency, status, plan, kyc_verified, area, city, region")
        .eq("slug", storeSlug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return (data as any);
    },
  });

  const products = useQuery({
    queryKey: ["store-products", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, store:stores(slug, name), product_media(url)")
        .eq("store_id", store.data!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (store.isLoading) return <AppShell><div className="p-8 text-sm text-muted-foreground">Loading storefront…</div></AppShell>;
  if (store.isError) throw store.error; // propagates notFound() to the router
  if (store.data && store.data.status !== "active") {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="font-display text-4xl text-[var(--gold)]">⏸</p>
          <h1 className="mt-4 font-display text-2xl">This store is currently unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {store.data.name} isn't taking orders right now. Please check back later.
          </p>
        </div>
      </AppShell>
    );
  }
  const s = store.data!;

  return (
    <AppShell>
      <section className="relative">
        <div className="relative h-52 w-full overflow-hidden md:h-72">
          {s.banner_url && <img src={s.banner_url} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        </div>
        <div className="mx-auto -mt-14 max-w-2xl px-4 md:max-w-6xl md:px-8">
          <div className="flex items-end gap-4">
            {s.logo_url && (
              <img src={s.logo_url} alt="" className="h-24 w-24 rounded-2xl border-4 border-background object-cover shadow-[var(--shadow-soft)]" />
            )}
            <div className="pb-2">
              <h1 className="font-display text-3xl leading-tight md:text-4xl">
                {s.name}
                {(s as any).kyc_verified && (
                  <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-1 align-middle text-[10px] font-bold uppercase tracking-wide text-[var(--gold-foreground)]" title="Identity verified by BASIC (KYC)">
                    <BadgeCheck className="h-3 w-3" /> Verified seller
                  </span>
                )}
                {s.plan === "pro" && (
                  <span className="ml-3 inline-block rounded-full bg-[var(--gold)] px-2.5 py-1 align-middle text-[10px] font-bold uppercase tracking-wide text-[var(--gold-foreground)]">Pro</span>
                )}
              </h1>
              {s.tagline && <p className="text-sm text-muted-foreground md:text-base">{s.tagline}</p>}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name, s.area, s.city].filter(Boolean).join(" "))}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-gold/60 hover:text-foreground"
              >
                <MapPin className="h-3 w-3" />
                {(s.area || s.city) ? [s.area, s.city].filter(Boolean).join(", ") : "Ghana · Ships worldwide"}
                {(s.area || s.city) && <span className="font-semibold text-gold">· Directions →</span>}
              </a>
            </div>
          </div>
          {s.description && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/85">{s.description}</p>}
        </div>
      </section>

      {(s.area || s.city || s.region) && (
        <div className="mt-8 px-4 md:px-8">
          <StoreLocationCard area={s.area} city={s.city} region={s.region} name={s.name} />
        </div>
      )}

      <div className="mt-8 px-4 md:px-8">
        <h2 className="font-display text-2xl">All products</h2>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 px-4 pb-8 md:grid-cols-4 md:gap-5 md:px-8">
        {(products.data ?? []).map((p) => (
          <ProductCardTile key={p.id} p={p as any} />
        ))}
        {!products.isLoading && (products.data?.length ?? 0) === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            This store hasn't listed products yet.
          </p>
        )}
      </div>
    </AppShell>
  );
}
