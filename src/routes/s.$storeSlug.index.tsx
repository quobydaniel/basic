// /s/$storeSlug — the seller's storefront: branded mini-site (own top bar),
// hero with banner/logo/stats/follow, and tabs — Items, Reviews, About,
// Policies. The Pro AI shop assistant floats on top of it all.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { BadgeCheck, Check, ChevronRight, MapPin, MessageCircle, ShieldCheck, Star, Truck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ProductCardTile, protoRating } from "./index";
import { StoreAssistant, StoreAvatar, StoreLocationCard, StoreTopBar } from "@/components/StoreChrome";
import { StoryViewer, useLiveStories } from "@/components/Stories";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/s/$storeSlug/")({
  component: StorefrontPage,
});

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  currency: string;
  status: string;
  plan: "free" | "pro";
  theme: { accent?: string } | null;
  created_at: string;
  area: string | null;
  city: string | null;
  region: string | null;
  kyc_verified: boolean;
};

type ProductRow = {
  id: string;
  slug: string;
  title: string;
  base_price: number;
  currency: string;
  store: { slug: string; name: string; area: string | null; city: string | null };
};

type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  products: { title: string } | null;
  buyer: { full_name: string | null } | null;
};

type SortKey = "relevance" | "price-asc" | "price-desc";

function StorefrontPage() {
  const { storeSlug } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"items" | "reviews" | "about" | "policies">("items");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [following, setFollowing] = useState<boolean | null>(null);
  const [topMode, setTopMode] = useState<"sold" | "rating">("sold");
  const store = useQuery({
    queryKey: ["store", storeSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, slug, name, tagline, description, logo_url, banner_url, country, currency, status, plan, kyc_verified, area, city, region, created_at, payment_terms, theme, ai_character, ai_greeting")
        .eq("slug", storeSlug)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as unknown as StoreRow;
    },
  });

  // ?story=1 — shared story links land here and the viewer starts playing
  // on arrival. TanStack's Link search serialization quotes the value
  // ("1"), so strip quotes before matching. The stories query may still
  // be in flight, so opening waits for data (once).
  const [autoPlay, setAutoPlay] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const autoPlayedRef = useRef(false);
  const { stories: liveStories, unseen: storyUnseen } = useLiveStories(store.data?.id, user?.id);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("story")?.replace(/"/g, "");
    if (v === "1" || v === "true") setAutoPlay(true);
  }, []);
  useEffect(() => {
    if (autoPlay && !autoPlayedRef.current && liveStories.length > 0) {
      autoPlayedRef.current = true;
      setStoryOpen(true);
    }
  }, [autoPlay, liveStories.length]);

  const products = useQuery({
    queryKey: ["store-products", storeSlug],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("products")
        .select("id, slug, title, base_price, currency, negotiable, category_id, category:categories(name, slug), store:stores(slug, name, area, city), product_media(url)")
        .eq("store_id", store.data!.id)
        .eq("status", "active")
        .order("created_at", { ascending: false }) as any);
      if (error) throw error;
      return ((data ?? []) as any[]) as ProductRow[];
    },
  });

  const followers = useQuery({
    queryKey: ["store-followers", store.data?.id, user?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { count } = await (supabase
        .from("store_followers" as any)
        .select("id", { count: "exact", head: true })
        .eq("store_id", store.data!.id) as any);
      let following = false;
      if (user) {
        const { data } = await (supabase
          .from("store_followers" as any)
          .select("id")
          .eq("store_id", store.data!.id)
          .eq("follower_id", user.id)
          .maybeSingle() as any);
        following = !!data;
      }
      return { count: count ?? 0, following };
    },
  });

  useEffect(() => {
    if (followers.data && following === null) setFollowing(followers.data.following);
  }, [followers.data, following]);

  const sold = useQuery({
    queryKey: ["store-sold", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      // order_items has no product FK — scope through the order instead.
      // Variant-less AI-created items count too; unpaid/cancelled orders don't.
      // (orders.status is the order_status enum — "placed" isn't a value.)
      const { data, error } = await (supabase
        .from("order_items" as any)
        .select("quantity, orders!inner(store_id, status)")
        .eq("orders.store_id", store.data!.id)
        .in("orders.status", ["paid", "fulfilled", "shipped", "delivered"] as never[]) as any);
      if (error) return 0;
      return ((data ?? []) as any[]).reduce((s, r) => s + Number(r.quantity ?? 0), 0);
    },
  });

  const reviews = useQuery({
    queryKey: ["store-reviews", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      // No `buyer:profiles` embed — that FK doesn't exist in the schema and
      // the embed 400'd every review query (reviews never rendered). Names
      // come from a batched follow-up lookup instead; when profiles are
      // RLS-hidden from the viewer it returns empty → "Verified buyer".
      const { data, error } = await (supabase
        .from("reviews")
        .select("id, rating, body, created_at, product_id, buyer_id, products!inner(title, store_id)")
        .eq("products.store_id", store.data!.id)
        .eq("approved", true)
        .order("created_at", { ascending: false })
        .limit(30) as any);
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map((r) => ({ ...r, buyer: null as { full_name: string | null } | null }));
      const ids = [...new Set(rows.map((r) => r.buyer_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        const names = new Map((profs ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]));
        for (const r of rows) r.buyer = { full_name: names.get(r.buyer_id) ?? null };
      }
      return rows as ReviewRow[];
    },
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to follow");
      if (following) {
        const { error } = await (supabase.from("store_followers" as any).delete().eq("store_id", store.data!.id).eq("follower_id", user.id) as any);
        if (error) throw error;
        return false;
      }
      const { error } = await (supabase.from("store_followers" as any).insert({ store_id: store.data!.id, follower_id: user.id }) as any);
      if (error) throw error;
      return true;
    },
    onSuccess: (next) => {
      setFollowing(next);
      toast.success(next ? "Following — new items will show up first." : "Unfollowed");
      qc.invalidateQueries({ queryKey: ["store-followers", store.data?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (store.isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }


  const s = store.data;
  if (!s) throw notFound();
  const accent = (s.theme as any)?.accent ?? "var(--gold)";
  const currency = s.currency ?? "GHS";

  const all = products.data ?? [];
  const q2 = q.trim().toLowerCase();
  const filtered = q2 ? all.filter((p) => p.title.toLowerCase().includes(q2)) : all;
  const sorted = [...filtered].sort((a, b) =>
    sort === "price-asc" ? a.base_price - b.base_price : sort === "price-desc" ? b.base_price - a.base_price : 0
  );
  const topRated = [...all].sort((a, b) => protoRating(b.id).avg - protoRating(a.id).avg).filter((p) => protoRating(p.id).count > 0);
  const topItems = (topMode === "rating" ? topRated : [...all]).slice(0, 4);

  const reviewRows = reviews.data ?? [];
  const avg = reviewRows.length ? reviewRows.reduce((s2, r) => s2 + Number(r.rating ?? 0), 0) / reviewRows.length : 0;
  const followerCount = followers.data?.count ?? 0;
  const joined = s.created_at ? new Date(s.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null;

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ "--store-accent": accent } as any}>
      <StoreTopBar store={s} shareTitle={s.name} />

      {/* Hero */}
      <section className="relative">
        <div className="relative h-40 w-full overflow-hidden md:h-56">
          {s.banner_url && (
            <img
              src={s.banner_url}
              alt=""
              onError={(e) => { e.currentTarget.style.display = "none"; }}
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        </div>
        <div className="relative z-10 mx-auto -mt-16 max-w-6xl px-4 md:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            {/* Live-story houses wear the WhatsApp-style golden ring on their
                own profile picture too — tapping it plays the story. */}
            {liveStories.length > 0 ? (
              <button
                onClick={() => setStoryOpen(true)}
                aria-label={`Watch ${s.name}'s story`}
                className="shrink-0 self-start rounded-full p-[3px] transition-transform active:scale-95"
                style={{ background: storyUnseen ? `conic-gradient(from 210deg, ${accent}, color-mix(in oklab, ${accent}, white 45%) 50%, ${accent})` : "var(--border)" }}
              >
                <StoreAvatar store={s} className="h-24 w-24 rounded-full border-4 border-background object-cover shadow-[var(--shadow-soft)] md:h-28 md:w-28" />
              </button>
            ) : (
              <StoreAvatar store={s} className="h-24 w-24 rounded-full border-4 border-background object-cover shadow-[var(--shadow-soft)] md:h-28 md:w-28" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl leading-tight">{s.name}</h1>
                {s.kyc_verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--gold-foreground)]" title="Identity verified by BASIC (KYC)">
                    <BadgeCheck className="h-3 w-3" /> Verified seller
                  </span>
                )}
                {s.plan === "pro" && (
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black" style={{ background: accent }}>Pro</span>
                )}
              </div>
              {joined && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500/20 text-emerald-500"><Check className="h-2.5 w-2.5" /></span>
                  Started selling on BASIC {joined}
                </p>
              )}
              {s.tagline && <p className="mt-0.5 text-sm text-muted-foreground">{s.tagline}</p>}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name, s.area, s.city].filter(Boolean).join(" "))}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-gold/60 hover:text-foreground"
              >
                <MapPin className="h-3 w-3" style={{ color: accent }} />
                {[s.area, s.city || s.region].filter(Boolean).join(", ") || "Ghana"}
                <span className="font-semibold text-gold">· Directions →</span>
              </a>
            </div>

            <div className="flex flex-col items-stretch gap-3 md:items-end">
              <div className="flex divide-x divide-border rounded-2xl border border-border bg-card">
                {[
                  { v: followerCount.toLocaleString(), l: "Followers" },
                  { v: (sold.data ?? 0).toLocaleString(), l: "Sold" },
                  { v: String(all.length), l: "Items" },
                ].map((stat) => (
                  <div key={stat.l} className="px-5 py-2.5 text-center">
                    <p className="font-display text-lg leading-tight">{stat.v}</p>
                    <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{stat.l}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => toggleFollow.mutate()}
                disabled={toggleFollow.isPending}
                className="flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 text-black"
                style={{ background: accent }}
              >
                <UserPlus className="h-4 w-4" />
                {following ? "Following" : "Follow"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="mx-auto mt-6 max-w-6xl px-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <div className="no-scrollbar flex gap-5 overflow-x-auto">
            {([
              ["items", "Items"],
              ["reviews", reviewRows.length ? `Reviews (${avg.toFixed(1)}★)` : "Reviews"],
              ["about", "About"],
              ["policies", "Policies"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative whitespace-nowrap pb-2.5 text-sm font-medium transition-colors ${tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
                {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5" style={{ background: accent }} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "items" && (
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="mt-4 flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2.5 transition-colors focus-within:border-gold/60">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search all ${all.length} items…`}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {topItems.length >= 2 && (
            <div className="mt-10">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-1 font-display text-2xl">Top items</h2>
                {([
                  ["sold", "Best-selling"],
                  ["rating", "Best-reviewed"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setTopMode(mode)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                      topMode === mode ? "text-black" : "border-border bg-card text-muted-foreground hover:border-foreground/40"
                    }`}
                    style={topMode === mode ? { background: accent, borderColor: accent } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
                {topItems.map((p) => <ProductCardTile key={p.id} p={p as any} />)}
              </div>
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl">All items</h2>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Sort by
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none hover:border-gold/60"
              >
                <option value="relevance">Relevance</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 pb-16 md:grid-cols-4 md:gap-5">
            {sorted.map((p) => <ProductCardTile key={p.id} p={p as any} />)}
            {sorted.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
                {q ? `Nothing matches "${q}".` : "This store hasn't listed products yet."}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "reviews" && (
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          {reviewRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No reviews yet — be the first to review an item.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <p className="font-display text-4xl">{avg.toFixed(1)}</p>
                <div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`h-4 w-4 ${n <= Math.round(avg) ? "fill-gold text-gold" : "text-muted-foreground/40"}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{reviewRows.length} review{reviewRows.length === 1 ? "" : "s"}</p>
                </div>
              </div>
              <ul className="mt-6 space-y-4">
                {reviewRows.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{r.products?.title ?? "Product"}</p>
                      <span className="flex items-center gap-0.5 text-xs font-semibold text-gold">
                        {r.rating} <Star className="h-3 w-3 fill-gold text-gold" />
                      </span>
                    </div>
                    {r.body && <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{r.body}</p>}
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {(r.buyer as any)?.full_name || "Verified buyer"} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === "about" && (
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">
            {s.description || `${s.name} is an independent seller on BASIC${s.tagline ? ` — ${s.tagline.toLowerCase()}` : ""}. Message the seller directly to ask about any piece; purchases happen in chat, so every question gets answered before you pay.`}
          </p>
          <div className="mt-6 space-y-3">
            {(s.area || s.city || s.region) && (
              <StoreLocationCard area={s.area} city={s.city} region={s.region} name={s.name} />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {!(s.area || s.city || s.region) && (
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                  <div>
                    <p className="text-sm font-medium">Where to find us</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Ghana — ask in chat for exact meetup details.</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                <div>
                  <p className="text-sm font-medium">Chat first</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Every purchase starts as a conversation — ask anything.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "policies" && (
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
              <div>
                <p className="text-sm font-medium">Safe buying on BASIC</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Agree on price, delivery and payment in chat before you pay. Pay on delivery or via escrow where the seller offers it.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <Truck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
              <div>
                <p className="text-sm font-medium">Delivery</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Each listing shows the seller's delivery terms — meet-up, pickup or home delivery across Ghana.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <Star className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
              <div>
                <p className="text-sm font-medium">Returns</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Return terms are on every listing. Anything unclear — ask in chat before you order.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <StoreAssistant store={{ name: s.name, slug: s.slug, logo_url: s.logo_url, theme: s.theme, plan: s.plan }} />
      {storyOpen && liveStories.length > 0 && (
        <StoryViewer stories={liveStories} storeSlug={s.slug} storeName={s.name} logoUrl={s.logo_url} accent={accent} onClose={() => setStoryOpen(false)} />
      )}
      <div className="h-20" />
    </div>
  );
}
