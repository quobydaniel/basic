// Homepage social rails — Stories carousel + Shorts discovery. Both read the
// same tables the storefront surfaces use (stories / shorts, cast through
// `as any` until the generated types regen) and deep-link into the existing
// full-screen surfaces — no duplicate viewers, no separate tabs.

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play, Store as StoreIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

/* ---------------------------------------------------------------- */
/* Stories rail — one gold ring per house with a live story          */
/* ---------------------------------------------------------------- */

type StoryGroup = {
  store_id: string;
  store_slug: string;
  store_name: string;
  logo_url: string | null;
  count: number;
};

export function StoriesRail() {
  const { user } = useSession();

  const groups = useQuery({
    queryKey: ["home", "stories-rail"],
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      // Live stories with their store identity, newest per store first.
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("store_id, created_at, store:stores(slug, name, logo_url)")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      const seen = new Map<string, StoryGroup>();
      for (const r of data ?? []) {
        const st = r.store ?? {};
        if (!st.slug || seen.has(r.store_id)) continue;
        seen.set(r.store_id, {
          store_id: r.store_id,
          store_slug: st.slug,
          store_name: st.name,
          logo_url: st.logo_url ?? null,
          count: 1,
        });
      }
      return [...seen.values()].slice(0, 12);
    },
  });

  // Seen rings grey out for the signed-in buyer (same rule as storefronts).
  const views = useQuery({
    queryKey: ["home", "story-views", user?.id],
    retry: false,
    enabled: !!user && (groups.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (groups.data ?? []).map((g) => g.store_id);
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("id, store_id")
        .in("store_id", ids)
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      const storyIds = (data ?? []).map((s: any) => s.id);
      if (!storyIds.length) return new Set<string>();
      const { data: mine } = await (supabase as any)
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", user!.id)
        .in("story_id", storyIds);
      const seenStories = new Set((mine ?? []).map((v: any) => v.story_id));
      // A store ring is "caught up" only when every live story was viewed.
      const allSeen = new Set<string>();
      for (const s of data ?? []) {
        if (seenStories.has(s.id)) allSeen.add(s.store_id);
        else allSeen.delete(s.store_id);
      }
      return allSeen;
    },
  });

  const rows = groups.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section aria-label="Live seller stories" className="mt-10 md:mt-12">
      <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 pb-1 md:px-8">
        {rows.map((g) => {
          const caughtUp = views.data?.has(g.store_id) ?? false;
          return (
            <Link
              key={g.store_id}
              to="/s/$storeSlug"
              params={{ storeSlug: g.store_slug }}
              search={{ story: "1" } as any}
              title={`${g.store_name} has a live story — tap to watch`}
              className="group flex w-[86px] shrink-0 flex-col items-center gap-2"
            >
              <span
                className="grid h-[72px] w-[72px] place-items-center rounded-full p-[3px] transition-transform group-active:scale-95"
                style={{
                  background: caughtUp
                    ? "var(--border)"
                    : "conic-gradient(from 210deg, var(--gild), color-mix(in oklab, var(--gild), white 45%) 50%, var(--gild))",
                }}
              >
                <span className="grid h-full w-full place-items-center rounded-full bg-background p-[3px]">
                  {g.logo_url ? (
                    <img
                      src={g.logo_url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center rounded-full bg-muted font-display text-lg text-foreground">
                      {g.store_name.slice(0, 1)}
                    </span>
                  )}
                </span>
              </span>
              <span className="w-full truncate text-center text-[11px] font-medium text-foreground">
                {g.store_name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Shorts rail — vertical video discovery, mobile-first              */
/* ---------------------------------------------------------------- */

type ShortRow = {
  id: string;
  caption: string | null;
  media_url: string;
  media_type: string;
  product: { title: string | null; slug: string | null } | null;
  store: { slug: string; name: string } | null;
};

export function ShortsRail() {
  const shorts = useQuery({
    queryKey: ["home", "shorts-rail"],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shorts")
        .select(
          "id, caption, media_url, media_type, product:products(title, slug), store:stores(slug, name)",
        )
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return ((data ?? []) as ShortRow[]).filter((s) => s.store?.slug);
    },
  });

  const rows = shorts.data ?? [];
  if (rows.length === 0) return null;

  return (
    <section aria-label="Shorts — sellers on video" className="mt-12 md:mt-14">
      <div className="flex items-end justify-between px-4 md:px-8">
        <div>
          <h2 className="font-display text-3xl md:text-4xl">Shorts</h2>
        </div>
      </div>
      <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto px-4 pb-2 md:px-8">
        {rows.map((s) => {
          const isVideo = s.media_type === "video";
          const productLink = s.product?.slug
            ? {
                to: "/s/$storeSlug/p/$productSlug" as const,
                params: { storeSlug: s.store!.slug, productSlug: s.product.slug },
              }
            : {
                to: "/s/$storeSlug" as const,
                params: { storeSlug: s.store!.slug },
              };
          return (
            <div key={s.id} className="relative w-[150px] shrink-0 md:w-[190px]">
              <Link
                {...productLink}
                className="group block overflow-hidden rounded-2xl border border-border bg-muted"
                style={{ aspectRatio: "9 / 14" }}
              >
                {isVideo ? (
                  <video
                    src={s.media_url}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                    onMouseLeave={(e) => e.currentTarget.pause()}
                  />
                ) : (
                  <img
                    src={s.media_url}
                    alt={s.caption ?? ""}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
                {isVideo && (
                  <span className="pointer-events-none absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </span>
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80">
                    <StoreIcon className="h-3 w-3" /> {s.store!.name}
                  </span>
                  {s.caption && (
                    <span className="mt-1 line-clamp-2 block text-[12px] font-medium leading-snug text-white">
                      {s.caption}
                    </span>
                  )}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
