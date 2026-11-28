import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Share2, ShieldCheck, MessageCircle, MapPin, Star, Sparkles, Loader2, Store, Lock, ShoppingBag, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ProductGallery } from "@/components/ProductGallery";
import { Stars } from "@/components/Stars";
import { ProductCardTile } from "./index";
import { supabase } from "@/integrations/supabase/client";
import { formatGHS } from "@/lib/format";
import { addToCart } from "@/lib/cart";
import { recordRecentlyViewed } from "@/lib/recently-viewed";
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
  const [briefLeft, setBriefLeft] = useState<number | null>(null);
  const briefFn = useServerFn(productBrief);
  const navigate = useNavigate();
  const router = useRouter();
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
        .select("id, slug, title, description, base_price, currency, category_id, delivery_available, payment_type, product_media(url, alt, position), product_variants(id, title, price, inventory_qty)")
        .eq("store_id", store.id)
        .eq("slug", productSlug)
        .eq("status", "active")
        .maybeSingle();
      if (pe) throw pe;
      if (!product) throw notFound();

      return { store, product };
    },
  });

  // Recently viewed — the homepage rail reads this local trail.
  const viewed = data.data?.product;
  const viewedStore = data.data?.store;
  useEffect(() => {
    if (!viewed || !viewedStore) return;
    recordRecentlyViewed({
      id: viewed.id,
      slug: viewed.slug,
      title: viewed.title,
      base_price: viewed.base_price,
      currency: viewed.currency,
      store: { slug: storeSlug, name: viewedStore.name, area: viewedStore.area ?? null, city: viewedStore.city ?? null },
      product_media: viewed.product_media?.[0]?.url ? [{ url: viewed.product_media[0].url }] : [],
    });
  }, [viewed?.id]);

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

  // Buyer plan — the AI insight card meters by it (free: 5/day, Premium: unlimited).
  const myPlan = useQuery({
    queryKey: ["my-plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("plan").eq("id", user!.id).maybeSingle();
      return ((data as any)?.plan ?? "shopper") as string;
    },
  });
  const insightPremium = myPlan.data === "premium" || myPlan.data === "premium-yearly";

  const hasPurchased = useQuery({
    queryKey: ["has-purchased", productSlug],
    enabled: !!user && !data.isLoading,
    queryFn: async () => {
      const variantIds = (data.data?.product.product_variants ?? []).map((v: any) => v.id);
      const title = data.data?.product.title as string | undefined;
      if (!variantIds.length && !title) return false;
      // order_items carries no product_id — match by variant, falling back to
      // the engine's title-only lines (variant_id is nullable). Cancelled
      // orders were never purchases.
      let q = supabase
        .from("order_items")
        .select("id, order:orders!inner(buyer_id, status)")
        .eq("order.buyer_id", user!.id)
        .neq("order.status", "cancelled")
        .limit(1);
      const titleClause = title ? `product_title.eq."${title.replaceAll('"', "")}"` : null;
      if (variantIds.length) {
        q = titleClause
          ? q.or(`variant_id.in.(${variantIds.join(",")}),${titleClause}`)
          : q.in("variant_id", variantIds);
      } else if (title) {
        q = q.eq("product_title", title);
      }
      const { data: rows, error } = await q;
      if (error) throw error;
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
  const negotiable = !!(product as any).negotiable;

  const locationLabel = [store.area, store.city || store.region].filter(Boolean).join(" · ");
  const waNumber = store.whatsapp_number ? store.whatsapp_number.replace(/\D/g, "") : null;
  const waText = encodeURIComponent(`Hi ${store.name}, I'm interested in "${product.title}" (${formatGHS(price, { currency: product.currency })}) on BASIC.`);
  const sellerId = store.owner_id as string | null;
  const canChat = !!sellerId;
  // Your own listing: no "Message seller" — that's how self-conversations
  // (buyer = seller) used to happen.
  const isOwnListing = !!user && sellerId === user.id;

  // Cart path — the server re-checks price and stock at checkout, so the
  // cart only captures the buyer's intent here. Negotiable listings stay
  // chat-only: the price is agreed in conversation, not listed.
  const [added, setAdded] = useState(false);
  function handleAddToCart() {
    if (negotiable || stockQty === 0 || isOwnListing) return;
    addToCart({
      product_id: product.id,
      store_id: store.id,
      store_slug: storeSlug,
      store_name: store.name,
      product_slug: product.slug,
      title: product.title,
      image: product.product_media?.[0]?.url ?? null,
      unit_price: price,
      currency: product.currency,
      qty: 1,
      variant_title: currentVariant?.title ?? null,
      delivery_available: (product as any).delivery_available ?? null,
      payment_type: (product as any).payment_type ?? null,
    });
    setAdded(true);
    toast.success("Added to cart");
    setTimeout(() => setAdded(false), 1600);
  }

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
          {/* Back — Jiji/Temu keep an exit arrow on the ad page; browser back
              on the first entry falls back to the storefront. */}
          <button
            onClick={() => {
              if (window.history.length > 1) router.history.back();
              else navigate({ to: "/s/$storeSlug", params: { storeSlug } });
            }}
            aria-label="Back"
            className="absolute left-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-md backdrop-blur transition hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <ProductGallery media={media} title={product.title} />
          {stockBadge && (
            <span
              className={`absolute right-3 top-3 z-20 rounded-full px-3 py-1 text-xs font-semibold ${stockQty === 0 ? "bg-muted text-muted-foreground" : "bg-[var(--gold)] text-[var(--gold-foreground)]"}`}
            >
              {stockBadge}
            </span>
          )}

          {/* Trust + AI insight — pinned right under the image (Quoby's ask),
              mobile and desktop alike. */}
          <div className="px-4 pt-4 md:px-0 md:pt-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                <MapPin className="h-4 w-4 text-[var(--gold)]" />
                <span>Meet, visit shop, or get it delivered</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                <ShieldCheck className="h-4 w-4 text-[var(--gold)]" />
                <span>Pay on delivery, before, or escrow</span>
              </div>
            </div>

            {/* AI product insight — grounded brief that opens with the
                seller's own description. Free buyer plan: 5 a day; Premium:
                unlimited. */}
            <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    {insightPremium
                      ? "A grounded summary of this listing — unlimited with Premium."
                      : "A grounded summary of this listing, drawn from the seller's own description — 5 free a day."}
                  </p>
                  <button
                    onClick={async () => {
                      setBriefBusy(true);
                      try {
                        const res = (await briefFn({ data: { product_id: product.id } })) as any;
                        setBrief(res.brief);
                        setBriefLeft(typeof res.remaining === "number" ? res.remaining : null);
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
                  {!insightPremium && typeof briefLeft === "number" && (
                    <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                      {briefLeft} of 5 free insights left today — Premium is unlimited
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{brief}</p>
              )}
            </div>
          </div>
        </section>

        <section className="px-4 pt-4 md:px-0 md:pt-0">
          {/* Storefront card — who sells this, where, and one-tap to their
              full shop (the "visit storefront" ask). */}
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
            <Link
              to="/s/$storeSlug"
              params={{ storeSlug: store.slug }}
              className="flex min-w-0 items-center gap-2.5"
            >
              {store.logo_url && <img src={store.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />}
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold text-foreground">{store.name}</span>
                {locationLabel && <span className="block truncate text-[11px] text-muted-foreground">{locationLabel}</span>}
              </span>
            </Link>
            <Link
              to="/s/$storeSlug"
              params={{ storeSlug: store.slug }}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-gold/50 px-3 py-1.5 text-xs font-semibold text-gold transition-colors hover:bg-[var(--gold)] hover:text-[var(--gold-foreground)]"
            >
              <Store className="h-3.5 w-3.5" /> <span className="hidden min-[420px]:inline">Visit storefront</span>
            </Link>
          </div>
          <div className="mt-2 flex items-center justify-end">
            <FavoriteButton productId={product.id} />
          </div>
          <h1 className="mt-2 font-display text-3xl leading-tight md:text-4xl">{product.title}</h1>
          <div className="mt-2 flex items-center gap-2">
            {(product as any).negotiable ? (
            <p className="font-display text-2xl text-gold">Price negotiable — chat with the seller</p>
          ) : (
            <p className="font-display text-2xl">{formatGHS(price, { currency: product.currency })}</p>
          )}
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
            {!negotiable && !isOwnListing && stockQty > 0 && (
              <button
                onClick={handleAddToCart}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-gold hover:text-gold"
              >
                {added ? <Check className="h-4 w-4 text-success" /> : <ShoppingBag className="h-4 w-4" />}
                {added ? "Added to cart" : "Add to cart"}
              </button>
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

            {/* My review form — buyers only; everyone else gets a lock note */}
            {user && hasPurchased.data && (
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
            {user && hasPurchased.data === false && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/40 p-4">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Reviews are for buyers — purchase this piece and the review box unlocks here.
                </p>
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
        </section>
      </div>

      {/* Full-width discovery sections — below the split so the grid uses the
          whole canvas instead of a squeezed side column. */}
      {(moreFromStore.data ?? []).length > 0 && (
        <div className="border-t border-border px-4 pt-6 md:px-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">More from {store.name}</h2>
            <Link
              to="/s/$storeSlug"
              params={{ storeSlug: store.slug }}
              className="flex items-center gap-1 text-xs font-semibold text-gold hover:underline"
            >
              Visit storefront <Store className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 pb-6 sm:grid-cols-3 md:grid-cols-4">
            {moreFromStore.data!.slice(0, 8).map((p: any) => (
              <ProductCardTile key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {(related.data ?? []).length > 0 && (
        <div className="border-t border-border px-4 pb-8 pt-6 md:px-8">
          <h2 className="font-display text-xl">Similar products</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {related.data!.slice(0, 8).map((p: any) => (
              <ProductCardTile key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {/* Sticky buy bar — mobile only (Temu-style: price + primary action are
          always one thumb-reach away, no matter how far you've scrolled).
          Sits in the band vacated by the bottom tab bar. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {negotiable ? "Chat for price" : formatGHS(price, { currency: product.currency })}
            </p>
            <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {stockQty === 0 ? "Sold out" : stockBadge ?? "In stock"}
            </p>
          </div>
          {waNumber && (
            <a
              href={`https://wa.me/${waNumber}?text=${waText}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat on WhatsApp"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-emerald-600/50 text-emerald-500"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          )}
          {isOwnListing ? (
            <Link
              to="/dashboard/products"
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground"
            >
              Your listing — manage
            </Link>
          ) : (
            <>
              {!negotiable && stockQty > 0 && (
                <button
                  onClick={handleAddToCart}
                  aria-label="Add to cart"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-foreground active:scale-95"
                >
                  {added ? <Check className="h-4 w-4 text-success" /> : <ShoppingBag className="h-4 w-4" />}
                </button>
              )}
            <button
              onClick={messageSeller}
              disabled={msgBusy || stockQty === 0}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_color-mix(in_oklab,var(--primary)_60%,transparent)] disabled:opacity-50"
            >
              {msgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {stockQty === 0 ? "Sold out" : "Chat to buy"}
            </button>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
