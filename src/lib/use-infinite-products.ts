// useInfiniteProducts — cursor-free .range() pagination for product listings.
//
// One hook powers infinite scroll everywhere products list vertically
// (Discover, Home feed). Callers describe HOW to filter (applyFilters), the
// hook handles page windows, the sentinel callback and exhaustion. Append-only
// rows keyed by the filter key so TanStack Query refetches page 1 when filters
// change while keeping scroll position.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InfiniteProduct = {
  id: string;
  slug: string;
  title: string;
  base_price: number;
  currency: string;
  store: { slug: string; name: string; area: string | null; city: string | null } | null;
  product_media: { url: string }[];
};

const SELECT = "id, slug, title, base_price, currency, store:stores(slug, name, area, city), product_media(url)";
const PAGE = 12;

type QueryLike = ReturnType<typeof supabase.from>;

export function useInfiniteProducts(opts: {
  /** Stable cache key — include every filter value that affects the query. */
  key: unknown[];
  /** false pauses everything (e.g. waiting on a dependent query). */
  enabled?: boolean;
  /** Applies filters/order to a fresh products query. MUST return the same builder. */
  applyFilters: (q: QueryLike) => QueryLike;
  pageSize?: number;
}) {
  const { key, enabled = true, applyFilters, pageSize = PAGE } = opts;
  const [appending, setAppending] = useState(false);
  const qc = useQueryClient();
  const applyRef = useRef(applyFilters);
  applyRef.current = applyFilters;
  // Offset + in-flight flag as refs (not state) — the IntersectionObserver
  // can fire faster than React commits, and deriving the next range from
  // cached row counts double-fetched overlapping pages (duplicate keys).
  const offsetRef = useRef(0);
  const busyRef = useRef(false);

  // Stable identity: `key` is usually an inline array (new each render), so
  // memoize on its JSON — otherwise the filter-change effect below would run
  // every render and keep resetting the pagination offset.
  const keyJson = useMemo(() => JSON.stringify(key), [key]);
  const pageKey = useMemo(() => ["infinite", ...JSON.parse(keyJson) as unknown[]], [keyJson]);

  // First page — via react-query so filter changes, SSR and caches behave.
  const first = useQuery({
    queryKey: [...pageKey, 0],
    enabled,
    queryFn: async () => {
      offsetRef.current = 0;
      let q = supabase.from("products").select(SELECT, { count: "exact" }).eq("status", "active");
      q = applyRef.current(q) as typeof q;
      // Deterministic tie-breaker: callers order by created_at (ties are
      // common on bulk imports) — without a stable final key, PostgREST can
      // shuffle equal-timestamp rows between pages and dup/skip one at a
      // page boundary.
      q = q.order("id", { ascending: true }) as typeof q;
      const { data, error, count } = await q.range(0, pageSize - 1);
      if (error) throw error;
      offsetRef.current = (data ?? []).length;
      return { rows: (data ?? []) as unknown as InfiniteProduct[], total: count ?? 0 };
    },
  });

  // Filters changed → drop appended pages.
  useEffect(() => {
    offsetRef.current = 0;
    setAppending(false);
  }, [pageKey]);

  const total = first.data?.total ?? 0;
  const rows = first.data?.rows ?? [];

  const loadMore = useCallback(async () => {
    if (!enabled || busyRef.current) return;
    if (offsetRef.current >= total) return;
    busyRef.current = true;
    setAppending(true);
    try {
      const start = offsetRef.current;
      let q = supabase.from("products").select(SELECT).eq("status", "active");
      q = applyRef.current(q) as typeof q;
      q = q.order("id", { ascending: true }) as typeof q;
      const { data, error } = await q.range(start, start + pageSize - 1);
      if (error) throw error;
      const fresh = (data ?? []) as unknown as InfiniteProduct[];
      offsetRef.current = start + fresh.length;
      // Merge into the first page's cache so rendering stays one flat list;
      // dedupe defensively (created_at ties can overlap page boundaries).
      qc.setQueryData<{ rows: InfiniteProduct[]; total: number }>([...pageKey, 0], (prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.rows.map((r) => r.id));
        const newOnes = fresh.filter((r) => !seen.has(r.id));
        return newOnes.length
          ? { rows: [...prev.rows, ...newOnes], total: prev.total }
          : prev;
      });
    } finally {
      busyRef.current = false;
      setAppending(false);
    }
  }, [enabled, total, pageSize, qc, pageKey]);

  // Sentinel: IntersectionObserver prefetches ~600px before the end. A
  // passive scroll fallback backs it up — IO callbacks are throttled when
  // the tab is hidden (background tabs, some webviews), and a marketplace
  // that stalls mid-scroll reads as broken.
  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) void loadMore();
        },
        { rootMargin: "600px 0px" }, // start fetching before the user hits the end
      );
      io.observe(node);
      const onScroll = () => {
        const r = node.getBoundingClientRect();
        if (r.top < window.innerHeight + 600) void loadMore();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        io.disconnect();
        window.removeEventListener("scroll", onScroll);
      };
    },
    [loadMore],
  );

  return {
    rows,
    total,
    loading: first.isLoading,
    error: first.error,
    appending,
    hasMore: rows.length < total,
    loadMore,
    sentinelRef,
  };
}
