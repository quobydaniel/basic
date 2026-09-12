import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Share2, ShieldCheck, MessageCircle, MapPin, Star, Sparkles, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ProductGallery } from "@/components/ProductGallery";
import { Stars } from "@/components/Stars";
import { ProductCardTile } from "./index";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { productBrief } from "@/lib/ai.functions";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/s/$storeSlug/p/$productSlug")({
  component: ProductPage,
});

function ProductPage() {
  const { storeSlug, productSlug } = Route.useParams();
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [msgBusy, setMsgBusy] = useState(false);
  const [myStars, setMyStars] = useState(0);
  const [myBody, setMyBody] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const briefFn = useServerFn(productBrief);
  const navigate = useNavigate();
  const { user } = useSession();
  const qc = useQueryClient();

  const data = useQuery({
    queryKey: ["product", storeSlug, productSlug],
    queryFn: async () => {
      const { data: store, error: se } = await supabase
        .from("stores")
        .select("id, slug, name, logo_url, owner_id, area, city, region, ghana_post_gps, whatsapp_number, payment_terms")
        .eq("slug", storeSlug)
        .eq("status", "active")
        .maybeSingle();
      if (se) throw se;
      if (!store) throw notFound();

      const { data: product, error: pe } = await supabase
        .from("products")
        .select("id, slug, title, description, base_price, currency, category_id, product_media(url, alt, position), product_variants(id, title, price, inventory_qty)")
        .eq("store_id", store.id)
        .eq("slug", productSlug)
        .eq("status", "active")
        .maybeSingle();
      if (pe) throw pe;
      if (!product) throw notFound();

      return { store, product };
    },
  });

  const reviews = useQuery({
    queryKey: ["reviews", productSlug],
    enabled: !data.isLoading,
    queryFn: async () => {
      const pid = data.data?.product.id;
      if (!pid) return { rows: [], avg: 0 };
      const { data: rows, error } = await supabase
        .from("reviews")
        .select("id, rating, body, buyer_id, created_at")
        .eq("product_id", pid)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const list = rows ?? [];
      const avg = list.length ? list.reduce((s: number, r: any) => s + r.rating, 0) / list.length : 0;
      return { rows: list, avg };
    },
  });

  const moreFromStore = useQuery({
    queryKey: ["more-from-store", storeSlug],
    enabled: !data.isLoading,
    queryFn: async () => {
      const sid = data.data?.store.id;
      if (!sid) return [];
      const { data: rows } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, store:stores(slug, name, area, city), product_media(url)")
        .eq("store_id", sid)
        .eq("status", "active")
        .neq("slug", productSlug)
        .limit(6);
      return rows ?? [];
    },
  });

  const related = useQuery({
    queryKey: ["related", productSlug],
    enabled: !data.isLoading && !!data.data?.product.category_id,
    queryFn: async () => {
      const catId = data.data?.product.category_id;
      if (!catId) return [];
      const { data: rows } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, category_id, store:stores(slug, name, area, city), product_media(url)")
        .eq("category_id", catId)
        .eq("status", "active")
        .neq("slug", productSlug)
        .limit(6);
      return rows ?? [];
    },
  });

  const myReview = useQuery({
    queryKey: ["my-review", productSlug],
    enabled: !!user,
    queryFn: async () => {
      const pid = data.data?.product.id;
      if (!pid) return null;
      const { data: r } = await supabase
        .from("reviews")
        .select("id, rating, body")
        .eq("product_id", pid)
        .eq("buyer_id", user!.id)
        .maybeSingle();
      return r;
    },
  });

  const hasPurchased = useQuery({
    queryKey: ["has-purchased", productSlug],
    enabled: !!user && !data.isLoading,
    queryFn: async () => {
      const variantIds = (data.data?.product.product_variants ?? []).map((v: any) => v.id);
      if (variantIds.length === 0) return false;
      const { data: rows } = await supabase
        .from("order_items")
        .select("id, order:orders!inner(buyer_id, status)")
        .in("variant_id", variantIds)
        .eq("order.buyer_id", user!.id)
        .limit(1);
      return (rows ?? []).length > 0;
    },
  });

  if (data.isLoading) return <AppShell><div className="p-8 text-sm text-muted-foreground">Loading…</div></AppShell>;
  if (data.isError) throw data.error; // propagates notFound() to the router
  const { store, product } = data.data!;
  const media = [...(product.product_media ?? [])].sort((a: any, b: any) => a.position - b.position);
  const variants = product.product_variants ?? [];
  const currentVariant = variants.find((v: any) => v.id === activeVariantId) ?? variants[0];
  const price = currentVariant?.price ?? product.base_price;
  const stockQty = variants.length
    ? variants.reduce((s2: number, v: any) => s2 + Number(v.inventory_qty ?? 0), 0)
    : Number((product as any).inventory_qty ?? 10);
  const stockBadge =
    stockQty === 0 ? "Sold out" : stockQty <= 5 ? `Only ${stockQty} left` : null;

  const locationLabel = [store.area, store.city || store.region].filter(Boolean).join(" · ");
  const waNumber = store.whatsapp_number ? store.whatsapp_number.replace(/\D/g, "") : null;
  const waText = encodeURIComponent(`Hi ${store.name}, I'm interested in "${product.title}" (${formatGHS(price, { currency: product.currency })}) on BASIC.`);
  const sellerId = store.owner_id as string | null;
  const canChat = !!sellerId;
  // Your own listing: no "Message seller" — that's how self-conversations
  // (buyer = seller) used to happen.
  const isOwnListing = !!user && sellerId === user.id;

  async function messageSeller() {
    if (!user) {
      toast("Sign in to message the seller");
      navigate({ to: "/auth", search: { mode: "shop" as const } });
      return;
    }
    if (msgBusy) return; // double-click guard
    setMsgBusy(true);
    try {
      // Reuse an existing thread for this product, else start one
      const { data: existing, error: lookupErr } = await supabase
        .from("conversations")
        .select("id")
        .eq("buyer_id", user.id)
        .eq("product_id", product.id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (existing) {
        navigate({ to: "/chat/$conversationId", params: { conversationId: existing.id } });
        return;
      }
      const { data: convo, error } = await supabase
        .from("conversations")
        .insert({ buyer_id: user.id, seller_id: sellerId!, store_id: store.id, product_id: product.id })
        .select("id")
        .single();
      if (error) {
        // Unique index backstop: another tab may have just created it
        if (error.code === "23505") {
          const { data: raced } = await supabase
            .from("conversations")
            .select("id")
            .eq("buyer_id", user.id)
            .eq("product_id", product.id)
            .maybeSingle();
          if (raced) {
            navigate({ to: "/chat/$conversationId", params: { conversationId: raced.id } });
            return;
          }
        }
        throw error;
      }
      navigate({ to: "/chat/$conversationId", params: { conversationId: convo.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start chat");
    } finally {
      setMsgBusy(false);
    }
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.title, text: `${product.title} — ${store.name}`, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  }

  return (
    <AppShell productId={product.id}>
      <div className="md:grid md:grid-cols-2 md:gap-10 md:px-8 md:pt-6">
        <section className="relative">
          <ProductGallery media={media} title={product.title} />
          {stockBadge && (
            <span
              className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold ${stockQty === 0 ? "bg-muted text-muted-foreground" : "bg-[var(--gold)] text-[var(--gold-foreground)]"}`}
            >
              {stockBadge}
            </span>
          )}
        </section>

        <section className="px-4 pt-4 md:px-0 md:pt-0">
          <div className="flex items-center justify-between">
            <Link
              to="/s/$storeSlug"
              params={{ storeSlug: store.slug }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              {store.logo_url && <img src={store.logo_url} alt="" className="h-6 w-6 rounded-full object-cover" />}
              {store.name}
            </Link>
            <FavoriteButton productId={product.id} />
          </div>
          <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl">{product.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            <p className="font-display text-2xl">{formatGHS(price, { currency: product.currency })}</p>
            {reviews.data && reviews.data.rows.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Stars rating={reviews.data.avg} size="xs" /> {reviews.data.avg.toFixed(1)} ({reviews.data.rows.length})
              </span>
            )}
          </div>
          {locationLabel && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-[var(--gold)]" /> {locationLabel}
            </p>
          )}

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{product.description}</p>
          )}

          {variants.length > 1 && (
            <div className="mt-5">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Variant</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v: any) => (
                  <button
                    key={v.id}
                    onClick={() => setActiveVariantId(v.id)}
                    data-active={(activeVariantId ?? variants[0].id) === v.id}
                    className="rounded-full border border-border px-4 py-1.5 text-sm data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                  >
                    {v.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat-first purchase actions */}
          <div className="mt-6 space-y-2">
            {canChat ? (
              <button
                onClick={messageSeller}
                disabled={msgBusy}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                <MessageCircle className="h-4 w-4" />
                Message seller · {formatGHS(price, { currency: product.currency })}
              </button>
            ) : (
              <p className="rounded-full border border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
                Demo store — seller chat coming soon
              </p>
            )}
            {waNumber && (
              <a
                href={`https://wa.me/${waNumber}?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-full border border-emerald-600/40 bg-emerald-500/10 py-3 text-sm font-medium text-emerald-500 hover:bg-emerald-500/20"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Chat on WhatsApp
              </a>
            )}
            <div className="flex gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${product.title} — ${formatGHS(price, { currency: product.currency })}\n${window.location.href}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-600/40 py-2.5 text-sm text-emerald-600 hover:bg-emerald-500/10"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Share on WhatsApp
              </a>
              {store.ghana_post_gps && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.ghana_post_gps)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm hover:bg-accent"
                >
                  <MapPin className="h-4 w-4" /> Shop location
                </a>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <MapPin className="h-4 w-4 text-[var(--gold)]" />
              <span>Meet, visit shop, or get it delivered</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <ShieldCheck className="h-4 w-4 text-[var(--gold)]" />
              <span>Pay on delivery, before, or escrow</span>
            </div>
          </div>

          {/* AI product insight */}
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" /> AI product insight
              </p>
              {brief && (
                <button onClick={() => setBrief(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  Hide
                </button>
              )}
            </div>
            {!brief ? (
              <>
                <p className="mt-1 text-xs text-muted-foreground">A grounded summary of this listing, its reviews, and the seller — no invented facts.</p>
                <button
                  onClick={async () => {
                    setBriefBusy(true);
                    try {
                      const res = (await briefFn({ data: { product_id: product.id } })) as any;
                      setBrief(res.brief);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "AI unavailable");
                    } finally {
                      setBriefBusy(false);
                    }
                  }}
                  disabled={briefBusy}
                  className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {briefBusy ? "Reading the listing…" : "✨ Get AI insight"}
                </button>
              </>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{brief}</p>
            )}
          </div>

          {/* Reviews */}
          <div className="mt-8 border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl">Reviews</h2>
              {reviews.data && reviews.data.rows.length > 0 && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Stars rating={reviews.data.avg} /> {reviews.data.avg.toFixed(1)}
                </span>
              )}
            </div>

            {/* My review form */}
            {user && (
              <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-medium">{myReview.data ? "Update your review" : "Write a review"}</p>
                {hasPurchased.data && (
                  <span className="mt-1 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    Verified purchase
                  </span>
                )}
                <div className="mt-2">
                  <Stars rating={myStars} size="md" onRate={setMyStars} />
                </div>
                <textarea
                  value={myBody}
                  onChange={(e) => setMyBody(e.target.value)}
                  rows={2}
                  placeholder="How was the quality, delivery, the seller?"
                  className="mt-2 w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
                />
                <button
                  onClick={async () => {
                    if (!myStars) return toast.error("Pick a star rating first");
                    setReviewBusy(true);
                    try {
                      const payload = { product_id: product.id, buyer_id: user!.id, rating: myStars, body: myBody.trim() || null };
                      const { error } = myReview.data
                        ? await supabase.from("reviews").update(payload).eq("id", myReview.data.id)
                        : await supabase.from("reviews").insert(payload);
                      if (error) throw error;
                      toast.success(myReview.data ? "Review updated" : "Review posted");
                      setMyBody("");
                      qc.invalidateQueries({ queryKey: ["reviews"] });
                      qc.invalidateQueries({ queryKey: ["my-review"] });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not save review");
                    } finally {
                      setReviewBusy(false);
                    }
                  }}
                  disabled={reviewBusy || !myStars}
                  className="mt-2 w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {reviewBusy ? "Saving…" : myReview.data ? "Update review" : "Post review"}
                </button>
              </div>
            )}
            {!user && (
              <p className="mt-3 text-sm text-muted-foreground">
                <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to leave a review — purchases unlock reviews.
              </p>
            )}

            {/* Reviews list */}
            <div className="mt-4 space-y-3">
              {(reviews.data?.rows ?? []).filter((r: any) => r.body).length === 0 && reviews.data && (
                <p className="text-sm text-muted-foreground">No written reviews yet.</p>
              )}
              {(reviews.data?.rows ?? []).filter((r: any) => r.body).map((r: any) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs text-primary">B</span>
                      Buyer review
                    </span>
                    <Stars rating={r.rating} size="xs" />
                  </div>
                  <p className="mt-2 text-sm text-foreground/85">{r.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Similar products — mobile: below the details, above More-from */}
          {((related.data ?? []).length > 0 || (moreFromStore.data ?? []).length > 0) && (
            <div className="mt-8 border-t border-border pt-6 md:hidden">
              <p className="mb-3 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.34em] text-muted-foreground">
                <span className="h-px w-6 bg-gold/60" aria-hidden /> You might also like
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(related.data?.length ? related.data! : moreFromStore.data!).slice(0, 8).map((p: any) => (
                  <ProductCardTile key={p.id} p={p} />
                ))}
              </div>
            </div>
          )}

          {/* More from this store */}
          {(moreFromStore.data ?? []).length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <h2 className="font-display text-xl">More from {store.name}</h2>
              <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
                {moreFromStore.data!.map((p: any) => (
                  <div key={p.id} className="w-36 shrink-0"><ProductCardTile p={p} /></div>
                ))}
              </div>
            </div>
          )}

          {/* Related in category */}
          {(related.data ?? []).length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <h2 className="font-display text-xl">You may also like</h2>
              <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2">
                {related.data!.map((p: any) => (
                  <div key={p.id} className="w-36 shrink-0"><ProductCardTile p={p} /></div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
