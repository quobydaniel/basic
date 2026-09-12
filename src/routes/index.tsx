import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { ArrowRight, TrendingUp, Sparkles, Store as StoreIcon, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FavoriteButton } from "@/components/FavoriteButton";
import { Parallax, Reveal } from "@/components/motion";
import { supabase } from "@/integrations/supabase/client";
import { useBuyerLocation } from "@/lib/buyer-location";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: MarketplaceHome,
});

type StoreCard = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  banner_url: string | null;
  plan: string | null;
};

type ProductCard = {
  id: string;
  slug: string;
  title: string;
  base_price: number;
  currency: string;
  store: { slug: string; name: string; area: string | null; city: string | null } | null;
  product_media: { url: string }[];
};

type Category = { id: string; slug: string; name: string; icon: string | null; parent_id: string | null };

/* Collections browser — houses on the rail, their sub-collections beneath. */
function CategoryIndex({ categories }: { categories?: Category[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const all = categories ?? [];
  const parents = all.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => all.filter((c) => c.parent_id === id);

  return (
    <section>
      <h2 className="sr-only">Collections</h2>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 md:px-8">
        {parents.map((c) => {
          const kids = childrenOf(c.id);
          const open = openId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setOpenId(open ? null : c.id)}
              className={`whitespace-nowrap rounded-full border px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                open ? "border-gold bg-gold/10 text-gold" : "border-border bg-card text-muted-foreground hover:border-gold/50 hover:text-gold"
              }`}
            >
              {c.name}{kids.length > 0 && <span className="ml-1.5 text-[10px] opacity-60">+{kids.length}</span>}
            </button>
          );
        })}
      </div>
      {openId && childrenOf(openId).length > 0 && (
        <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto px-4 md:px-8">
          {childrenOf(openId).map((c) => (
            <Link
              key={c.id}
              to="/discover"
              search={{ category: c.slug }}
              className="whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold transition-colors hover:bg-gold/15"
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* Deterministic prototype rating — visual stand-in until real reviews
   accumulate in the `reviews` table. Same product → same numbers. */
export function protoRating(id: string): { avg: number; count: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const avg = 4.2 + (h % 8) / 10;
  const count = 8 + (h % 392);
  return { avg: Math.round(avg * 10) / 10, count };
}

function MarketplaceHome() {
  const stores = useQuery({
    queryKey: ["home", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, slug, name, tagline, logo_url, banner_url, plan")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data as StoreCard[];
    },
  });

  const categories = useQuery({
    queryKey: ["home", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name, icon, parent_id")
        .order("position");
      if (error) throw error;
      return data as Category[];
    },
  });

  const products = useQuery({
    queryKey: ["home", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, store:stores(slug, name, area, city), product_media(url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data as unknown as ProductCard[];
    },
  });

  /* Featured storefronts — paid placement: Pro stores claim the top slots
     (positions 1–6), free stores follow. Newest first within each tier. */
  const featuredStores = useMemo(() => {
    const rows = [...(stores.data ?? [])];
    const pro = rows.filter((st) => st.plan === "pro");
    const free = rows.filter((st) => st.plan !== "pro");
    return [...pro, ...free].slice(0, 6);
  }, [stores.data]);

  return (
    <AppShell>
      {/* Obsidian hero — candlelight parallax over charcoal */}
      <section className="px-4 pt-4 md:px-8 md:pt-8">
        <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <Parallax speed={0.3} className="absolute inset-0">
              <div className="candle absolute -top-40 left-1/2 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,var(--gold)_0%,transparent_60%)] opacity-[0.13] blur-3xl" />
            </Parallax>
            <Parallax speed={-0.18} className="absolute inset-0">
              <div className="absolute -bottom-36 -left-24 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,var(--terracotta)_0%,transparent_62%)] opacity-[0.10] blur-3xl" />
            </Parallax>
            <Parallax speed={0.12} className="absolute inset-0">
              <div className="absolute -right-20 top-1/3 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,var(--gold)_0%,transparent_60%)] opacity-[0.08] blur-2xl" />
            </Parallax>
          </div>

          <div className="relative flex flex-col items-center gap-10 px-6 py-14 text-center md:px-12 md:py-20">
            <Parallax speed={0.03} className="max-w-2xl">
              <p className="mb-5 flex items-center justify-center gap-4 text-[10px] font-semibold uppercase tracking-[0.42em] text-muted-foreground">
                <span className="h-px w-10 bg-gradient-to-r from-transparent to-gold/70" />
                Ghana-powered commerce
                <span className="h-px w-10 bg-gradient-to-l from-transparent to-gold/70" />
              </p>
              <h1 className="font-display text-5xl leading-[1.05] md:text-7xl">
                Selling made simple.
                <br />
                Shopping made <span className="gold-text italic">golden</span>.
              </h1>
              <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                Sellers open a storefront in minutes and reach buyers in every
                region. Buyers shop thousands of Ghana-made finds — pay with
                Mobile Money or card, delivered to your door.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/discover"
                  className="group inline-flex items-center gap-2.5 rounded-full bg-gold px-7 py-3 text-[12px] font-bold uppercase tracking-[0.22em] text-gold-foreground transition-all duration-300 hover:shadow-[0_0_36px_-6px_var(--gold)]"
                >
                  Start shopping
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.2} />
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "sell" as const }}
                  className="inline-flex items-center gap-2.5 rounded-full border border-border px-7 py-3 text-[12px] font-semibold uppercase tracking-[0.22em] text-foreground/90 transition-colors duration-300 hover:border-gold hover:text-gold"
                >
                  Open your store
                </Link>
              </div>
            </Parallax>

            {/* Gold-ringed plates — each floats at its own parallax speed */}
            <div className="hidden w-full max-w-3xl grid-cols-4 gap-4 md:grid">
              {(products.data ?? []).slice(0, 4).map((p: any, i: number) => (
                <Parallax key={p.id} speed={0.1 + i * 0.05}>
                  <Link
                    to="/s/$storeSlug/p/$productSlug"
                    params={{ storeSlug: p.store?.slug ?? "", productSlug: p.slug }}
                    className={`group block overflow-hidden rounded-xl border border-border bg-background/60 backdrop-blur transition-colors duration-300 hover:border-gold/60 ${i % 2 ? "mt-8" : ""}`}
                  >
                    <div className="h-28 w-full overflow-hidden bg-muted">
                      {p.product_media?.[0]?.url && (
                        <img src={p.product_media[0].url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                      )}
                    </div>
                    <div className="px-3 py-3 text-left">
                      <p className="line-clamp-1 font-display text-sm">{p.title}</p>
                      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                        {formatGHS(p.base_price, { currency: p.currency })}
                      </p>
                    </div>
                  </Link>
                </Parallax>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PARKED — category rail removed for now (nav mega-menu covers it).
      <Reveal className="mt-8 md:mt-12">
        <CategoryIndex categories={categories.data} />
      </Reveal>
      ── end parked ── */}

      {/* Featured stores */}
      <Reveal>
        <SectionHeader eyebrow="The houses" title="Featured storefronts" to="/stores" icon={<TrendingUp className="h-4 w-4" />} />
      </Reveal>
      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-3 md:overflow-visible md:px-8">
        {stores.isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 w-72 shrink-0 animate-pulse rounded-3xl bg-muted md:w-auto" />
          ))}
        {featuredStores.map((s: any, i: number) => (
          <Reveal key={s.id} delay={i * 90} className="shrink-0 md:w-auto">
            <Link
              to="/s/$storeSlug"
              params={{ storeSlug: s.slug }}
              className="group relative block h-56 w-72 overflow-hidden rounded-3xl border border-border bg-card transition-all duration-500 hover:border-gold/50 hover:shadow-[0_24px_60px_-24px_oklch(0.80_0.11_85/0.35)] md:w-auto"
            >
              {s.plan === "pro" && (
                <span className="absolute right-3 top-3 z-10 rounded-full bg-gold px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gold-foreground shadow-md">
                  Featured
                </span>
              )}
              {s.banner_url && (
                <img
                  src={s.banner_url}
                  alt={s.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-90 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 text-white">
                {s.logo_url && (
                  <img
                    src={s.logo_url}
                    alt=""
                    className="h-10 w-10 rounded-full border border-gold/50 object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate font-display text-lg leading-tight">{s.name}</p>
                  <p className="truncate text-[11px] uppercase tracking-[0.18em] text-white/70">{s.tagline}</p>
                </div>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>

      {/* Recommended for you — rule-based: buyer location first, then newest */}
      <RecommendedSection />

      {/* Just dropped grid */}
      <Reveal>
        <SectionHeader eyebrow="Recent acquisitions" title="Just arrived" icon={<Sparkles className="h-4 w-4" />} />
      </Reveal>
      <div className="mt-4 grid grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-5 md:px-8">
        {products.isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />
          ))}
        {products.data?.map((p, i) => (
          <Reveal key={p.id} delay={(i % 4) * 80}>
            <ProductCardTile p={p} />
          </Reveal>
        ))}
      </div>

      {/* Seller CTA — quiet gold invitation */}
      <Reveal>
        <section className="relative mx-4 mt-14 mb-6 overflow-hidden rounded-3xl border border-border bg-card p-8 md:mx-8 md:p-14">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,var(--gold)_0%,transparent_60%)] opacity-[0.10] blur-2xl"
            aria-hidden
          />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-md">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.34em] text-gold">
                <StoreIcon className="h-3.5 w-3.5" strokeWidth={1.8} /> For makers &amp; houses
              </p>
              <h3 className="font-display text-3xl leading-tight md:text-4xl">
                Your craft, presented properly.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Accept Mobile Money and cards with Paystack. Sync your catalog to
                Instagram, TikTok Shop, and WhatsApp.
              </p>
            </div>
            <Link
              to="/auth"
              search={{ mode: "sell" as const }}
              className="group inline-flex w-fit items-center gap-2.5 rounded-full bg-gold px-7 py-3 text-[12px] font-bold uppercase tracking-[0.22em] text-gold-foreground transition-all duration-300 hover:shadow-[0_0_36px_-6px_var(--gold)]"
            >
              Begin
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.2} />
            </Link>
          </div>
        </section>
      </Reveal>
    </AppShell>
  );
}

function SectionHeader({ eyebrow, title, icon, to = "/discover" }: { eyebrow: string; title: string; icon?: React.ReactNode; to?: string }) {
  return (
    <div className="mt-12 flex items-end justify-between px-4 md:mt-16 md:px-8">
      <div>
        <h2 className="font-display text-3xl md:text-4xl">{title}</h2>
      </div>
      <Link
        to={to}
        className="pb-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:text-gold"
      >
        View all
      </Link>
    </div>
  );
}

export function ProductCardTile({ p }: { p: ProductCard }) {
  const img = p.product_media?.[0]?.url;
  const rating = protoRating(p.id);
  return (
    <Link
      to="/s/$storeSlug/p/$productSlug"
      params={{ storeSlug: p.store?.slug ?? "", productSlug: p.slug }}
      className="group block"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted transition-colors duration-300 group-hover:border-gold/50">
        {img && (
          <img
            src={img}
            alt={p.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
        <div className="absolute right-2 top-2">
          <FavoriteButton productId={p.id} size="sm" />
        </div>
        {rating.count > 150 && (
          <span className="absolute left-2 top-2 rounded-full border border-gold/40 bg-background/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-gold backdrop-blur">
            Sought after
          </span>
        )}
      </div>
      <div className="mt-2.5">
        <p className="line-clamp-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {p.store?.name}
          {p.store?.area ? ` · ${p.store.area}` : p.store?.city ? ` · ${p.store.city}` : ""}
        </p>
        <p className="line-clamp-1 font-display text-[16px]">{p.title}</p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-gold">
            {(p as any).negotiable ? "Chat for price" : formatGHS(p.base_price, { currency: p.currency })}
          </p>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Star className="h-3 w-3 fill-gold text-gold" />
            {rating.avg.toFixed(1)}
            <span className="text-muted-foreground/60">({rating.count})</span>
          </span>
        </div>
      </div>
    </Link>
  );
}


function RecommendedSection() {
  const { location } = useBuyerLocation();
  const recs = useQuery({
    queryKey: ["home", "recommended", location?.region, location?.city],
    queryFn: async () => {
      if (location) {
        // Prefer sellers in the buyer's city/region, fallback to newest
        const locFilter = location.city
          ? supabase.from("stores").select("id").eq("city", location.city)
          : supabase.from("stores").select("id").eq("region", location.region!);
        const { data: sids } = await locFilter;
        const ids = (sids ?? []).map((x: { id: string }) => x.id);
        if (ids.length) {
          const { data } = await supabase
            .from("products")
            .select("id, slug, title, base_price, currency, store:stores(slug, name, area, city), product_media(url)")
            .eq("status", "active")
            .in("store_id", ids)
            .order("created_at", { ascending: false })
            .limit(6);
          if (data && data.length) return data;
        }
      }
      const { data } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, store:stores(slug, name, area, city), product_media(url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  if (!recs.data?.length) return null;
  return (
    <>
      <Reveal className="mt-12 md:mt-16">
        <div className="flex items-end justify-between px-4 md:px-8">
          <div>
            <h2 className="font-display text-3xl md:text-4xl">Recommended</h2>
          </div>
        </div>
      </Reveal>
      <div className="no-scrollbar mt-4 flex gap-4 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-3 md:overflow-visible md:px-8">
        {recs.data.map((p: any, i: number) => (
          <Reveal key={p.id} delay={i * 70} className="w-40 shrink-0 md:w-auto">
            <ProductCardTile p={p} />
          </Reveal>
        ))}
      </div>
    </>
  );
}
