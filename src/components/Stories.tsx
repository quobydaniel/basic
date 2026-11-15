// Stories — WhatsApp-style 24h seller statuses, buyer side.
// StoryTray: the tappable ring under the storefront hero. StoryViewer: the
// fullscreen overlay — progress bars, tap left/right, auto-advance, emoji
// reactions, seen-tracking, product CTA. Media lives in the product-media
// bucket under {storeId}/stories/… (existing store-owner storage policies
// cover that path). Tables (stories / story_views / story_reactions) come
// from apply-pending-2026-11-14k.sql — before it runs, every query here
// errors and the tray quietly renders nothing.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Share2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

type StoryRow = {
  id: string;
  store_id: string;
  product_id: string | null;
  caption: string | null;
  media_url: string;
  media_type: string;
  created_at: string;
  expires_at?: string;
  product: { title: string; slug: string } | null;
};

/* Shorts — the store's persistent showreel (no expiry). Same shape minus
   expires_at; the viewer plays both kinds off this union. */
export type ShortRow = {
  id: string;
  store_id: string;
  product_id: string | null;
  caption: string | null;
  media_url: string;
  media_type: string;
  created_at: string;
  product: { title: string; slug: string } | null;
};

const IMAGE_MS = 5000;
const VIDEO_MS = 15000;
const REACTIONS = ["❤️", "😂", "🔥", "😍"];

function timeLeft(expiresAt?: string): string {
  if (!expiresAt) return "expired";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

/* The canonical share target — ?story=1 lands on the storefront and the
   viewer starts playing on arrival. navigator.share surfaces WhatsApp
   (incl. posting to your own status) on mobile; desktop falls back to
   wa.me / WhatsApp Web. */
export function shareStory(storeSlug: string, storeName: string) {
  const url = `${window.location.origin}/s/${storeSlug}?story=1`;
  const text = `Check out ${storeName}'s story on BASIC 🔥 ${url}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ title: storeName, text, url }).catch(() => {}); // dismissed — fine
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/* Shorts share the same deep-link pattern — ?shorts=1 opens the Shorts
   tab and starts playing. */
export function shareShort(storeSlug: string, storeName: string) {
  const url = `${window.location.origin}/s/${storeSlug}?shorts=1`;
  const text = `${storeName}'s latest short on BASIC 🎬 ${url}`;
  if (typeof navigator !== "undefined" && navigator.share) {
    navigator.share({ title: storeName, text, url }).catch(() => {});
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

/* ---------------------------------------------------------------- */
/* Hooks — story data shared across surfaces                        */
/* ---------------------------------------------------------------- */

/* One store's live stories + whether the current viewer still has
   unseen ones (drives every ring shade). Pre-migration this 404s →
   empty list, so every ring surface quietly renders plain. */
export function useLiveStories(storeId: string | undefined, userId: string | undefined) {
  const stories = useQuery({
    queryKey: ["store-stories", storeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("id, store_id, product_id, caption, media_url, media_type, created_at, expires_at, product:products(title, slug)")
        .eq("store_id", storeId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StoryRow[];
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const list = stories.data ?? [];

  // Own views → the rings grey out once the buyer has caught up.
  const myViews = useQuery({
    queryKey: ["story-views-mine", storeId, userId],
    queryFn: async () => {
      const ids = list.map((s) => s.id);
      if (!ids.length) return [] as string[];
      const { data, error } = await (supabase as any)
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", userId)
        .in("story_id", ids);
      if (error) throw error;
      return (data ?? []).map((v: any) => v.story_id as string);
    },
    enabled: !!storeId && !!userId && list.length > 0,
  });

  const viewed = new Set(myViews.data ?? []);
  return { stories: list, unseen: list.some((s) => !viewed.has(s.id)) };
}

/* Directory-level: which stores have a live story (store_id → count).
   Shared by /stores and the home featured rail — one cache entry. */
export function useStoryStoreIds() {
  return useQuery({
    queryKey: ["stores-directory-stories"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stories")
        .select("store_id")
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      const set: Record<string, number> = {};
      for (const r of data ?? []) set[(r as any).store_id] = (set[(r as any).store_id] ?? 0) + 1;
      return set;
    },
  });
}

/* One store's shorts — the persistent showreel behind the storefront's
   Shorts tab, newest first. Pre-migration this 404s once → empty grid. */
export function useStoreShorts(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store-shorts", storeId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("shorts")
        .select("id, store_id, product_id, caption, media_url, media_type, created_at, product:products(title, slug)")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShortRow[];
    },
    enabled: !!storeId,
    staleTime: 60_000,
  });
}

/* ---------------------------------------------------------------- */
/* Tray — the store's story ring on the storefront                  */
/* ---------------------------------------------------------------- */

/* Presentational — the page owns the story data and the viewer, so the
   hero avatar ring and this tray trigger the same fullscreen playback. */
export function StoryTray({
  stories,
  unseen,
  onOpen,
  storeName,
  logoUrl,
  accent,
}: {
  stories: StoryRow[];
  unseen: boolean;
  onOpen: () => void;
  storeName: string;
  logoUrl: string | null;
  accent: string;
}) {
  if (!stories.length) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8">
      <button
        onClick={onOpen}
        className="group flex items-center gap-3 rounded-2xl py-2 pr-3 text-left"
        aria-label={`Watch ${storeName}'s story`}
      >
        <span
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full p-[2.5px] transition-transform group-active:scale-95"
          style={{ background: unseen ? `conic-gradient(from 210deg, ${accent}, color-mix(in oklab, ${accent}, white 45%) 50%, ${accent})` : "var(--border)" }}
        >
          <span className="grid h-full w-full place-items-center rounded-full bg-background p-[2px]">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center rounded-full bg-muted font-display text-sm">
                {storeName.slice(0, 1)}
              </span>
            )}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">{storeName}</span>
          <span className="block text-[11px] text-muted-foreground">
            Story · {stories.length > 1 ? `${stories.length} new · ` : ""}
            {timeLeft(stories[stories.length - 1].expires_at)}
          </span>
        </span>
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Viewer — fullscreen, auto-advancing, reactable                   */
/* ---------------------------------------------------------------- */

export function StoryViewer({
  stories,
  storeSlug,
  storeName,
  logoUrl,
  accent,
  onClose,
  kind = "story",
  startIndex,
}: {
  stories: (StoryRow | ShortRow)[];
  storeSlug: string;
  storeName: string;
  logoUrl: string | null;
  accent: string;
  onClose: () => void;
  /* "story" = 24h status (reactions + expiry clock); "short" = persistent
     showreel piece (no reactions, view-tracked in short_views). */
  kind?: "story" | "short";
  startIndex?: number;
}) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [i, setI] = useState(startIndex ?? 0);
  const [progress, setProgress] = useState(0);
  const advancedRef = useRef(false);
  const cur = stories[i];
  const dur = cur?.media_type === "video" ? VIDEO_MS : IMAGE_MS;

  const next = () => {
    if (i + 1 < stories.length) setI(i + 1);
    else onClose();
  };
  const prev = () => {
    if (i > 0) setI(i - 1);
  };
  const advanceOnce = () => {
    if (!advancedRef.current) {
      advancedRef.current = true;
      next();
    }
  };

  // Seen-tracking: one upsert per piece, best-effort — anon viewers skip.
  // Shorts count views in short_views; stories keep the seen-ring table.
  const markViewed = useMutation({
    mutationFn: async (storyId: string) => {
      if (!user) return;
      const table = kind === "short" ? "short_views" : "story_views";
      const col = kind === "short" ? "short_id" : "story_id";
      await (supabase as any)
        .from(table)
        .upsert({ [col]: storyId, viewer_id: user.id }, { onConflict: `${col},viewer_id`, ignoreDuplicates: true });
      if (kind !== "short") qc.invalidateQueries({ queryKey: ["story-views-mine"] });
    },
  });

  useEffect(() => {
    advancedRef.current = false;
    setProgress(0);
    if (cur) markViewed.mutate(cur.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Auto-advance timer — video may also end early and call advanceOnce.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setProgress(p);
      if (p >= 1) advanceOnce();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, dur]);

  // Escape closes; scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") advanceOnce();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, stories.length]);

  if (!cur) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white" role="dialog" aria-label={`${storeName} ${kind}`}>
      {/* progress bars */}
      <div className="absolute inset-x-0 top-0 z-30 flex gap-1 px-3 pt-3">
        {stories.map((s, idx) => (
          <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: idx < i ? "100%" : idx === i ? `${progress * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* header */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2.5 px-4 pb-4 pt-7">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-white/40" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15 font-display text-xs">{storeName.slice(0, 1)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{storeName}</p>
          <p className="text-[10px] text-white/70">{kind === "short" ? "Short" : timeLeft((cur as StoryRow).expires_at)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => (kind === "short" ? shareShort(storeSlug, storeName) : shareStory(storeSlug, storeName))}
            aria-label={kind === "short" ? "Share short" : "Share story"}
            title={kind === "short" ? "Share to WhatsApp" : "Share to WhatsApp status"}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <Share2 className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={onClose}
            aria-label={kind === "short" ? "Close short" : "Close story"}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* media + tap zones */}
      <div className="relative z-0 flex h-full w-full items-center justify-center">
        {cur.media_type === "video" ? (
          <video
            key={cur.id}
            src={cur.media_url}
            autoPlay
            muted
            playsInline
            onEnded={advanceOnce}
            className="max-h-full w-full object-contain"
          />
        ) : (
          <img key={cur.id} src={cur.media_url} alt="" className="max-h-full w-full object-contain" />
        )}
        <button
          onClick={prev}
          aria-label="Previous story"
          className="absolute inset-y-0 left-0 z-10 w-1/3"
        />
        <button
          onClick={next}
          aria-label="Next story"
          className="absolute inset-y-0 right-0 z-10 w-2/3"
        />
      </div>

      {/* caption + product + reactions */}
      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-6 pt-14">
        {cur.caption && <p className="mb-3 max-w-xl text-sm leading-relaxed">{cur.caption}</p>}
        <div className="flex items-end justify-between gap-3">
          {cur.product ? (
            <Link
              to="/s/$storeSlug/p/$productSlug"
              params={{ storeSlug, productSlug: cur.product.slug }}
              className="flex min-w-0 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold backdrop-blur transition-colors hover:bg-white/20"
            >
              <span className="truncate">View product · {cur.product.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {kind === "story" && <ReactionBar storyId={cur.id} accent={accent} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Reactions — one emoji per viewer per story, counts are public    */
/* ---------------------------------------------------------------- */

function ReactionBar({ storyId, accent }: { storyId: string; accent: string }) {
  const { user } = useSession();
  const qc = useQueryClient();

  const reactions = useQuery({
    queryKey: ["story-reactions", storyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("story_reactions")
        .select("viewer_id, emoji")
        .eq("story_id", storyId);
      if (error) throw error;
      return (data ?? []) as { viewer_id: string; emoji: string }[];
    },
    staleTime: 15_000,
  });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reactions.data ?? []) m.set(r.emoji, (m.get(r.emoji) ?? 0) + 1);
    return m;
  }, [reactions.data]);

  const mine = (reactions.data ?? []).find((r) => user && r.viewer_id === user.id)?.emoji ?? null;

  const react = useMutation({
    mutationFn: async (emoji: string) => {
      if (!user) throw new Error("Sign in to react to stories");
      const { error } = await (supabase as any)
        .from("story_reactions")
        .upsert({ story_id: storyId, viewer_id: user.id, emoji }, { onConflict: "story_id,viewer_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["story-reactions", storyId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not react"),
  });

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {REACTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        const isMine = mine === emoji;
        return (
          <button
            key={emoji}
            onClick={() => react.mutate(emoji)}
            disabled={react.isPending}
            aria-label={`React ${emoji}`}
            className={`relative grid h-9 w-9 place-items-center rounded-full text-lg transition-transform active:scale-90 ${
              isMine ? "bg-white/25 ring-2" : "bg-white/10 hover:bg-white/20"
            }`}
            style={isMine ? { ["--tw-ring-color" as any]: accent } : undefined}
          >
            {emoji}
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-black/70 px-1 text-[9px] font-bold">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
