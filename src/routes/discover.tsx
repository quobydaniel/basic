import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useDeferredValue } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { ProductCardTile } from "./index";
import { useBuyerLocation } from "@/lib/buyer-location";
import { LocationPicker } from "@/components/LocationPicker";
import { useInfiniteProducts } from "@/lib/use-infinite-products";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  sort: z.enum(["new", "price-asc", "price-desc"]).optional(),
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

const SORTS = [
  { value: "new", label: "Newest" },
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" },
] as const;

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
  const sort = search.sort ?? "new";

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

  // Store-id scope for the location cascade — computed once, reused by every
  // page of the infinite list (kept out of queryFn so pagination stays cheap).
  const storeScope = useStoreScope(buyerLoc);

  const products = useInfiniteProducts({
    key: ["discover", deferredQ, activeCat, search.min, search.max, sort, storeScope],
    enabled: true,
    applyFilters: (query) => {
      let categoryIds: string[] = [];
      if (activeCat) {
        const cat = cats.data?.find((c) => c.slug === activeCat);
        if (cat) {
          const kids = (cats.data ?? []).filter((c) => c.parent_id === cat.id);
          categoryIds = [cat.id, ...kids.map((k) => k.id)];
        }
      }
      let next = query;
      if (deferredQ) next = next.ilike("title", `%${deferredQ}%`);
      if (categoryIds.length) next = next.in("category_id", categoryIds);
      if (search.min != null) next = next.gte("base_price", search.min);
      if (search.max != null) next = next.lte("base_price", search.max);
      // null scope = browse all of Ghana; empty array = nothing matches location
      if (storeScope) next = next.in("store_id", storeScope);
      next = next.order("created_at", { ascending: false });
      if (sort === "price-asc") next = next.order("base_price", { ascending: true });
      else if (sort === "price-desc") next = next.order("base_price", { ascending: false });
      return next;
    },
  });

  function applyPrice() {
    navigate({
      to: "/discover",
      search: {
        ...(q ? { q } : {}),
        ...(activeCat ? { category: activeCat } : {}),
        ...(minPrice ? { min: Number(minPrice) } : {}),
        ...(maxPrice ? { max: Number(maxPrice) } : {}),
        ...(sort !== "new" ? { sort } : {}),
      },
    });
  }

  function setSort(next: "new" | "price-asc" | "price-desc") {
    navigate({
      to: "/discover",
      search: {
        ...(deferredQ ? { q: deferredQ } : {}),
        ...(activeCat ? { category: activeCat } : {}),
        ...(search.min != null ? { min: search.min } : {}),
        ...(search.max != null ? { max: search.max } : {}),
        ...(next !== "new" ? { sort: next } : {}),
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
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${filtersActive ? "border-[var(--gold)] bg-[var(--gold)]/10 text-gold" : "border-border text-muted-foreground hover:bg-accent"}`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
          </button>
        </div>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">Find your next favorite Ghanaian brand.</p>

        <div className="mt-3 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 focus-within:border-gold/60">
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
                className="shrink-0 rounded-xl bg-[var(--gold)] px-4 py-2 text-sm font-semibold text-[var(--gold-foreground)] hover:brightness-110"
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
      </div>

      {/* Sticky discovery bar — chips + sort ride under the masthead while
          the grid scrolls, so ordering/filtering is always one tap away.
          Direct child of <main> (NOT the header block): sticky only travels
          within its containing block, and this one must span the whole page. */}
      <div className="sticky top-[4.3rem] z-30 bg-background/95 px-4 py-2.5 backdrop-blur md:top-[6.7rem] md:px-8">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <FilterPill to="/discover" search={{ q: deferredQ || undefined, ...(sort !== "new" ? { sort } : {}) }} active={!activeCat}>All</FilterPill>
          {cats.data?.filter((c) => !c.parent_id).map((c) => (
            <FilterPill key={c.id} to="/discover" search={{ category: c.slug, q: deferredQ || undefined, ...(sort !== "new" ? { sort } : {}) }} active={activeCat === c.slug}>
              {c.name}
            </FilterPill>
          ))}
        </div>

        {subcats.length > 0 && (
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {subcats.map((c) => (
              <FilterPill key={c.id} to="/discover" search={{ category: c.slug, q: deferredQ || undefined, ...(sort !== "new" ? { sort } : {}) }} active={activeCat === c.slug}>
                {c.name}
              </FilterPill>
            ))}
          </div>
        )}

        {/* Sort — Jiji/Temu-style ordering, native select so mobile opens the picker */}
        <div className="mt-2 flex items-center gap-2">
          <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "new" | "price-asc" | "price-desc")}
              className="bg-transparent text-xs font-semibold text-foreground outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          {products.total > 0 && (
            <span className="text-xs text-muted-foreground">{products.total.toLocaleString()} item{products.total === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 px-4 pb-6 md:grid-cols-4 md:gap-5 md:px-8">
        {products.loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-muted" />
          ))}
        {products.rows.map((p) => (
          <ProductCardTile key={p.id} p={p} />
        ))}
        {!products.loading && products.rows.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
            Nothing here yet. Try widening your filters or location.
          </p>
        )}
        {!products.loading && buyerLoc && storeScope === null && (
          <p className="col-span-full pb-2 text-center text-xs text-muted-foreground">
            No sellers in {buyerLoc ? [buyerLoc.area, buyerLoc.city].filter(Boolean).join(", ") : "your area"} yet — showing all of Ghana.
          </p>
        )}
        {/* Infinite scroll sentinel — prefetches 600px before the end */}
        {products.hasMore && !products.loading && (
          <div ref={products.sentinelRef} className="col-span-full flex items-center justify-center py-6">
            {products.appending ? (
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading more…</span>
            ) : (
              <button
                onClick={() => void products.loadMore()}
                className="rounded-full border border-border px-5 py-2 text-xs font-semibold text-muted-foreground hover:border-gold/60 hover:text-gold"
              >
                Load more
              </button>
            )}
          </div>
        )}
        {!products.hasMore && products.rows.length > 0 && (
          <p className="col-span-full py-5 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
            You've seen it all — {products.rows.length} item{products.rows.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </AppShell>
  );
}

/* Store-id scope for the buyer's location, with cascade fallback
   (area → city → region → all Ghana). Null scope = "everywhere": the
   listing query simply skips the IN filter. */
function useStoreScope(buyerLoc: { area?: string | null; city?: string | null; region?: string | null } | null): string[] | null {
  const [scope, setScope] = useState<string[] | null>(null);
  const locKey = buyerLoc ? `${buyerLoc.area ?? ""}|${buyerLoc.city ?? ""}|${buyerLoc.region ?? ""}` : "";
  useEffect(() => {
    setScope(null);
    if (!buyerLoc) return;
    let dead = false;
    (async () => {
      const tryLevels: Array<Record<string, string>> = [];
      if (buyerLoc.area && buyerLoc.city) tryLevels.push({ area: buyerLoc.area, city: buyerLoc.city });
      if (buyerLoc.city) tryLevels.push({ city: buyerLoc.city });
      if (buyerLoc.region) tryLevels.push({ region: buyerLoc.region });
      for (const level of tryLevels) {
        let loc = supabase.from("stores").select("id").eq("status", "active");
        for (const [k, v] of Object.entries(level)) loc = loc.eq(k, v);
        const { data: sids } = await loc;
        const ids = (sids ?? []).map((s: { id: string }) => s.id);
        if (ids.length > 0) {
          if (!dead) setScope(ids);
          return;
        }
      }
      if (!dead) setScope(null); // no location-tagged sellers — browse all of Ghana
    })();
    return () => {
      dead = true;
    };
  }, [locKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return scope;
}

function FilterPill({ to, search, active, children }: any) {
  return (
    <Link
      to={to}
      search={search}
      className="whitespace-nowrap rounded-full border border-border px-4 py-1.5 text-sm transition-colors data-[active=true]:border-[var(--gold)] data-[active=true]:bg-[var(--gold)] data-[active=true]:text-[var(--gold-foreground)]"
      data-active={active}
    >
      {children}
    </Link>
  );
}
