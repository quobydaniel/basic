import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useDeferredValue } from "react";
import { z } from "zod";
import { ArrowUpRight, MapPin, Search, Store as StoreIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/motion";
import { Stars } from "@/components/Stars";
import { supabase } from "@/integrations/supabase/client";
import { useStoryStoreIds } from "@/components/Stories";

const searchSchema = z.object({
  city: z.string().optional(),
  sort: z.enum(["new", "rated", "pieces"]).optional(),
  pro: z.boolean().optional(),
});

export const Route = createFileRoute("/stores")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Storefronts — BASIC" },
      { name: "description", content: "Every independent storefront on BASIC, in one directory." },
    ],
  }),
  component: StoresPage,
});

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  banner_url: string | null;
  area: string | null;
  city: string | null;
  region: string | null;
  plan: string | null;
};

function StoresPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);

  const stores = useQuery({
    queryKey: ["stores-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, slug, name, tagline, logo_url, banner_url, area, city, region, plan")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });

  // One lightweight pass over products to count each house's listings.
  const counts = useQuery({
    queryKey: ["stores-directory-counts"],
    enabled: !!stores.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("store_id").eq("status", "active");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const sid = (row as { store_id: string }).store_id;
        map[sid] = (map[sid] ?? 0) + 1;
      }
      return map;
    },
  });

  // Real ratings — reviews rolled up per store through their products.
  // Stores without reviewed products simply don't show a star line.
  const ratings = useQuery({
    queryKey: ["stores-directory-ratings"],
    enabled: !!stores.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("rating, product:products(store_id)")
        .limit(1000);
      if (error) throw error;
      const per: Record<string, { sum: number; n: number }> = {};
      for (const r of data ?? []) {
        const sid = (r as any).product?.store_id as string | undefined;
        if (!sid) continue;
        (per[sid] ??= { sum: 0, n: 0 });
        per[sid].sum += (r as any).rating as number;
        per[sid].n += 1;
      }
      const avg: Record<string, { avg: number; n: number }> = {};
      for (const [sid, v] of Object.entries(per)) avg[sid] = { avg: v.sum / v.n, n: v.n };
      return avg;
    },
  });

  // Houses with a live story (24h WhatsApp-style status) — golden profile
  // ring + a deep link that starts the story on arrival. Shared hook with
  // the home page so both surfaces hit one cached query; pre-migration it
  // 404s once and everything just renders ringless.
  const storyStores = useStoryStoreIds();

  const rows = stores.data ?? [];
  const sort = search.sort ?? "new";

  // Distinct cities for the location chips (region as fallback).
  const cities = [...new Set(rows.map((s) => s.city || s.region).filter(Boolean))] as string[];

  const filtered = rows
    .filter((s) => {
      if (search.pro && s.plan !== "pro") return false;
      if (search.city && (s.city || s.region) !== search.city) return false;
      if (deferredQ.trim()) {
        const needle = deferredQ.trim().toLowerCase();
        const hay = `${s.name} ${s.tagline ?? ""} ${s.city ?? ""} ${s.area ?? ""} ${s.region ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "rated") {
        const ra = ratings.data?.[a.id]?.avg ?? -1;
        const rb = ratings.data?.[b.id]?.avg ?? -1;
        if (rb !== ra) return rb - ra;
      }
      if (sort === "pieces") {
        const ca = counts.data?.[a.id] ?? 0;
        const cb = counts.data?.[b.id] ?? 0;
        if (cb !== ca) return cb - ca;
      }
      // default keeps the Pro houses first, newest beneath
      return Number(b.plan === "pro") - Number(a.plan === "pro");
    });

  const location = (s: StoreRow) => [s.area, s.city || s.region].filter(Boolean).join(" · ") || "Ghana";

  function setFilter(next: { city?: string; sort?: string; pro?: boolean }) {
    navigate({
      to: "/stores",
      // Merge by key presence — clicking one filter must never clear the
      // others (a plain object spread here would wipe the rest).
      search: (prev: Record<string, unknown>) => {
        const merged: Record<string, unknown> = { ...prev };
        if ("city" in next) merged.city = next.city || undefined;
        if ("sort" in next) merged.sort = next.sort && next.sort !== "new" ? next.sort : undefined;
        if ("pro" in next) merged.pro = next.pro || undefined;
        return merged;
      },
      resetScroll: false,
    });
  }

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
      active
        ? "bg-[var(--gold)] text-[var(--gold-foreground)]"
        : "border border-border text-muted-foreground hover:border-gold/40 hover:text-foreground"
    }`;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pt-8 md:max-w-6xl md:px-8 md:pt-12">
        <p className="mb-1.5 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.34em] text-muted-foreground">
          <span className="h-px w-6 bg-gold/60" aria-hidden />
          <StoreIcon className="h-3.5 w-3.5" /> The houses
        </p>
        <h1 className="font-display text-4xl md:text-5xl">Storefronts</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Every independent seller on BASIC, in one directory. Walk in, look around,
          and start a conversation.
        </p>

        {/* Search — name, tagline, or where they are */}
        <div className="mt-5 flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 focus-within:border-gold/60">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stores — name or what they sell…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Location chips */}
        {cities.length > 0 && (
          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            <button onClick={() => setFilter({ city: undefined })} className={chip(!search.city)}>
              All locations
            </button>
            {cities.map((c) => (
              <button
                key={c}
                onClick={() => setFilter({ city: search.city === c ? undefined : c })}
                className={chip(search.city === c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* PRO toggle + sort + result count */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setFilter({ pro: !search.pro })}
            className={chip(!!search.pro)}
          >
            Pro only
          </button>
          <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => setFilter({ sort: e.target.value })}
              className="bg-transparent text-xs font-semibold text-foreground outline-none"
            >
              <option value="new">Newest</option>
              <option value="rated">Top rated</option>
              <option value="pieces">Most pieces</option>
            </select>
          </label>
          {!stores.isLoading && (
            <span className="text-xs text-muted-foreground">
              {filtered.length} storefront{filtered.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-5 px-4 pb-8 sm:grid-cols-2 md:grid-cols-3 md:px-8">
        {stores.isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
          ))}

        {filtered.map((s, i) => {
          const rating = ratings.data?.[s.id];
          const hasStory = (storyStores.data?.[s.id] ?? 0) > 0;
          return (
            <Reveal key={s.id} delay={(i % 3) * 80}>
              <Link
                to="/s/$storeSlug"
                params={{ storeSlug: s.slug }}
                search={hasStory ? ({ story: "1" } as any) : undefined}
                title={hasStory ? `${s.name} has a live story — tap to watch` : undefined}
                className="group block overflow-hidden rounded-2xl border border-border bg-card transition-all duration-500 hover:border-gold/50 hover:shadow-[0_24px_60px_-24px_oklch(0.80_0.11_85/0.35)]"
              >
                {/* Banner */}
                <div className="relative h-28 overflow-hidden bg-muted">
                  {s.banner_url && (
                    <img
                      src={s.banner_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover opacity-90 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
                </div>

                <div className="relative px-5 pb-5">
                  {/* Logo rides the banner edge — live-story houses wear the
                      WhatsApp-style golden ring (monogram tile when logoless). */}
                  <span
                    className={`absolute -top-7 left-5 grid h-14 w-14 place-items-center rounded-2xl shadow-[var(--shadow-soft)] ${hasStory ? "p-[2.5px]" : ""}`}
                    style={hasStory ? { background: "conic-gradient(from 210deg, var(--gold), transparent 55%, var(--gold))" } : undefined}
                  >
                    {s.logo_url ? (
                      <img
                        src={s.logo_url}
                        alt=""
                        loading="lazy"
                        className={`h-full w-full rounded-2xl border-2 border-card object-cover ${hasStory ? "rounded-[13px]" : ""}`}
                      />
                    ) : hasStory ? (
                      <span className="grid h-full w-full place-items-center rounded-[13px] border-2 border-card bg-card font-display text-lg text-gold">
                        {s.name.trim().charAt(0).toUpperCase()}
                      </span>
                    ) : null}
                  </span>
                  <div className="pt-9">
                    <p className="flex items-center gap-2 font-display text-xl leading-tight">
                      <span className="truncate transition-colors group-hover:text-gold">{s.name}</span>
                      {s.plan === "pro" && (
                        <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gold">
                          Pro
                        </span>
                      )}
                    </p>
                    {s.tagline && <p className="mt-0.5 line-clamp-1 text-[13px] italic text-muted-foreground">{s.tagline}</p>}
                    <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {location(s)}
                      </span>
                      {rating ? (
                        <span className="flex items-center gap-1 normal-case tracking-normal">
                          <Stars rating={rating.avg} size="xs" /> {rating.avg.toFixed(1)}
                          <span className="text-muted-foreground/60">({rating.n})</span>
                        </span>
                      ) : (
                        <span>
                          {counts.data?.[s.id] ?? "…"} piece{(counts.data?.[s.id] ?? 0) === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      Visit storefront <ArrowUpRight className="h-3.5 w-3.5" />
                    </p>
                  </div>
                </div>
              </Link>
            </Reveal>
          );
        })}

        {!stores.isLoading && filtered.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No storefronts open yet — the first houses are being fitted out."
              : "No storefronts match — try another name, city, or turn off the filters."}
          </p>
        )}
      </div>
    </AppShell>
  );
}
