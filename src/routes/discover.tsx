import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useDeferredValue } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { ProductCardTile } from "./index";
import { useBuyerLocation } from "@/lib/buyer-location";
import { LocationPicker } from "@/components/LocationPicker";
import { useCategoryStats, rollupCount } from "@/lib/category-stats";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const Route = createFileRoute("/discover")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Discover — BASIC" },
      { name: "description", content: "Browse products and storefronts from across Ghana on BASIC." },
    ],
  }),
  component: Discover,
});

type Cat = { id: string; slug: string; name: string; parent_id: string | null };

function Discover() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState(search.q ?? "");
  const deferredQ = useDeferredValue(q); // one query per pause, not per keystroke
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState<string>(search.min != null ? String(search.min) : "");
  const [maxPrice, setMaxPrice] = useState<string>(search.max != null ? String(search.max) : "");
  const { location: buyerLoc } = useBuyerLocation();
  const activeCat = search.category;

  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, slug, name, parent_id").order("position");
      return (data ?? []) as Cat[];
    },
  });

  // Sub-categories of the active top-level category
  const activeCatObj = cats.data?.find((c) => c.slug === activeCat);
  const subcats = activeCatObj ? (cats.data ?? []).filter((c) => c.parent_id === activeCatObj.id) : [];

  const products = useQuery({
    queryKey: ["discover", deferredQ, activeCat, search.min, search.max, buyerLoc],
    queryFn: async () => {
      // Resolve category filter: include the category's sub-cats
      let categoryIds: string[] = [];
      if (activeCat) {
        const cat = cats.data?.find((c) => c.slug === activeCat);
        if (cat) {
          const kids = (cats.data ?? []).filter((c) => c.parent_id === cat.id);
          categoryIds = [cat.id, ...kids.map((k) => k.id)];
        }
      }
      // Location filter with cascade fallback: area → city → region → all.
      // A too-specific pick degrades to the wider level; if NO seller has a
      // matching location, show everything rather than an empty marketplace.
      let storeIds: string[] | null = null;
      let locFallback = false;
      if (buyerLoc) {
        const tryLevels: Array<Record<string, string>> = [];
        if (buyerLoc.area && buyerLoc.city) tryLevels.push({ area: buyerLoc.area, city: buyerLoc.city });
        if (buyerLoc.city) tryLevels.push({ city: buyerLoc.city });
        if (buyerLoc.region) tryLevels.push({ region: buyerLoc.region });
        for (const level of tryLevels) {
          let loc = supabase.from("stores").select("id").eq("status", "active");
          for (const [k, v] of Object.entries(level)) loc = loc.eq(k, v);
          const { data: sids } = await loc;
          storeIds = (sids ?? []).map((s: { id: string }) => s.id);
          if (storeIds.length > 0) break;
        }
        if (!storeIds || storeIds.length === 0) {
          storeIds = null; // no location-tagged sellers — browse all of Ghana
          locFallback = true;
        }
      }

      let query = supabase
        .from("products")
        .select("id, slug, title, base_price, currency, category_id, store:stores(slug, name, area, city), product_media(url)")
        .eq("status", "active");
      if (deferredQ) query = query.ilike("title", `%${deferredQ}%`);
      if (categoryIds.length) query = query.in("category_id", categoryIds);
      if (search.min != null) query = query.gte("base_price", search.min);
      if (search.max != null) query = query.lte("base_price", search.max);
      if (storeIds) query = query.in("store_id", storeIds);
      const { data, error } = await query.limit(48);
      if (error) throw error;
      return { rows: data ?? [], locFallback };
    },
    enabled: !activeCat || (cats.data?.length ?? 0) > 0,
  });

  function applyPrice() {
    navigate({
      to: "/discover",
      search: {
        ...(q ? { q } : {}),
        ...(activeCat ? { category: activeCat } : {}),
        ...(minPrice ? { min: Number(minPrice) } : {}),
        ...(maxPrice ? { max: Number(maxPrice) } : {}),
      },
    });
  }

  const filtersActive = search.min != null || search.max != null || !!buyerLoc;

  return (
    <AppShell>
      <div className="px-4 pt-4 md:px-8 md:pt-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl">Discover</h1>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${filtersActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Find your next favorite Ghanaian brand.</p>

        <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {showFilters && (
          <div className="mt-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location</p>
            <div className="mt-2">
              <LocationPicker />
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Price (GH₵)</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Min"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
              <span className="text-muted-foreground">–</span>
              <input
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Max"
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={applyPrice}
                className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Apply
              </button>
            </div>
            {buyerLoc && (
              <p className="mt-3 text-xs text-muted-foreground">
                Showing sellers in <span className="font-medium text-foreground">{[buyerLoc.area, buyerLoc.city, buyerLoc.region].filter(Boolean).join(" · ")}</span> — change via the location chip above.
              </p>
            )}
          </div>
        )}

        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
          <FilterPill to="/discover" search={{ q: deferredQ || undefined }} active={!activeCat}>All</FilterPill>
          {cats.data?.filter((c) => !c.parent_id).map((c) => (
            <FilterPill key={c.id} to="/discover" search={{ category: c.slug, q: deferredQ || undefined }} active={activeCat === c.slug}>
              {c.name}
            </FilterPill>
          ))}
        </div>

        {subcats.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {subcats.map((c) => (
              <FilterPill key={c.id} to="/discover" search={{ category: c.slug, q: deferredQ || undefined }} active={activeCat === c.slug}>
                {c.name}
              </FilterPill>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-5 md:px-8">
        {products.isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />
          ))}
        {((products.data as any)?.rows ?? []).map((p: any) => (
          <ProductCardTile key={p.id} p={p} />
        ))}
        {!products.isLoading && ((products.data as any)?.rows?.length ?? 0) === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Nothing here yet. Try widening your filters or location.
          </p>
        )}
        {!products.isLoading && (products.data as any)?.locFallback && (
          <p className="col-span-full pb-2 text-center text-xs text-muted-foreground md:col-span-4">
            No sellers in {buyerLoc ? [buyerLoc.area, buyerLoc.city].filter(Boolean).join(", ") : "your area"} yet — showing all of Ghana.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function FilterPill({ to, search, active, children }: any) {
  return (
    <Link
      to={to}
      search={search}
      className="whitespace-nowrap rounded-full border border-border px-4 py-1.5 text-sm data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
      data-active={active}
    >
      {children}
    </Link>
  );
}
