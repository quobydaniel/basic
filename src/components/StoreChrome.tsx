// Storefront chrome — the seller's own mini-website shell.
// StoreTopBar: branded header (logo, name, share, BASIC mark) — no BASIC
// chrome; the storefront belongs to the seller. StoreAssistant: an AI
// shop assistant that speaks for the seller, takes orders in chat — Pro
// feature, enforced server-side and gated in the UI.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronRight, Loader2, Lock, MapPin, Send, Share2, ShoppingBag, Sparkles, Store as StoreIcon, X } from "lucide-react";
import { buyerAssistant, placeAssistantOrder } from "@/lib/ai.functions";
import { characterById } from "@/lib/ai-characters";
import { StoreCharacter } from "@/components/StoreCharacter";
import { formatGHS } from "@/lib/format";
import { toast } from "sonner";

export type StoreLite = {
  name: string;
  slug: string;
  logo_url: string | null;
  theme?: { accent?: string } | null;
  plan?: string | null;
  ai_character?: string | null;
  ai_greeting?: string | null;
};

/** Logo with initials fallback — broken/missing images never leave a hole. */
export function StoreAvatar({ store, className }: { store: { name: string; logo_url: string | null }; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = store.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  if (!store.logo_url || broken) {
    return (
      <div className={`grid place-items-center bg-gradient-to-br from-[var(--store-accent,var(--gold))] to-black/40 font-display text-foreground ${className ?? ""}`}>
        {initials || <StoreIcon className="h-1/3 w-1/3" />}
      </div>
    );
  }
  return <img src={store.logo_url} alt={store.name} onError={() => setBroken(true)} className={`object-cover ${className ?? ""}`} />;
}

/** Store-branded header + "Powered by BASIC" mark + share. */
export function StoreTopBar({ store, shareTitle }: { store: StoreLite; shareTitle?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/s/${store.slug}` : `/s/${store.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle ?? store.name, text: store.name, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur-lg" style={{ borderColor: "color-mix(in oklab, var(--store-accent, var(--gold)) 25%, transparent)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <Link to="/s/$storeSlug" params={{ storeSlug: store.slug }} className="flex min-w-0 items-center gap-2.5">
          <StoreAvatar store={store} className="h-9 w-9 rounded-xl" />
          <span className="truncate font-display text-lg tracking-tight text-white">{store.name}</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={share}
            aria-label="Share this store"
            title="Share this store"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/90 transition-colors hover:border-[var(--store-accent,var(--gold))] hover:text-white"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
          </button>
          <Link to="/" title="Powered by BASIC" className="flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60 transition-colors hover:border-white/40 hover:text-white">
            BASIC
          </Link>
        </div>
      </div>
    </header>
  );
}

type AssistantMsg = { role: "user" | "assistant"; content: string };
type AssistantProduct = { id: string; slug: string; title: string; base_price: number; currency: string; image?: string | null };
type PendingOrder = {
  product_slug: string;
  quantity: number;
  variant: string | null;
  delivery: string | null;
  payment: string | null;
};
type PlacedOrder = {
  order_id: string;
  order_number: string;
  total: number;
  quantity: number;
  title: string;
  currency: string;
};

/** Pro-gated AI shop assistant — speaks for the seller, takes orders in chat. */
export function StoreAssistant({ store, product }: { store: StoreLite; product?: { slug: string; title: string } }) {
  const isPro = store.plan === "pro";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMsg[]>([]);
  const [products, setProducts] = useState<AssistantProduct[]>([]);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chat = useServerFn(buyerAssistant);
  const placeAssistantOrderFn = useServerFn(placeAssistantOrder);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    const next: AssistantMsg[] = [...messages, { role: "user" as const, content: clean }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = (await chat({
        data: {
          messages: next,
          store_slug: store.slug,
          page_context: product ? "product" : "store",
          page_path: loc.href.slice(0, 300),
          page_product: product,
        },
      })) as any;
      setMessages([...next, { role: "assistant" as const, content: res.reply ?? "" }]);
      setProducts(res.products ?? []);
      if (res.orderReady) {
        setPlaced(null);
        setPendingOrder(res.orderReady);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Assistant unavailable";
      toast.error(msg.includes("Pro") ? msg : "Assistant unavailable");
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }

  async function confirmOrder() {
    if (!pendingOrder || placing) return;
    setPlacing(true);
    try {
      const res = (await placeAssistantOrderFn({
        data: {
          store_slug: store.slug,
          product_slug: pendingOrder.product_slug,
          quantity: pendingOrder.quantity,
          variant: pendingOrder.variant ?? undefined,
          delivery: pendingOrder.delivery ?? undefined,
          payment: pendingOrder.payment ?? undefined,
        },
      })) as any;
      setPlaced(res);
      setPendingOrder(null);
      setMessages((m) => [...m, { role: "assistant" as const, content: `Order #${res.order_number} placed — ${res.quantity}× ${res.title} for ${formatGHS(res.total, { currency: res.currency })}. Track it in your Orders.` }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not place the order");
    } finally {
      setPlacing(false);
    }
  }

  const accent = "var(--store-accent, var(--gold))";
  // AI shopkeeper character (Pro): replaces the generic sparkle with the
  // seller's chosen tiny character in the launcher and panel.
  const character = isPro ? characterById(store.ai_character) : null;

  return (
    <>
      {/* Floating assistant — Pro stores with a picked character get the
          animated 3D chibi; everyone else gets the pill. */}
      {isPro && character ? (
        <StoreCharacter
          characterId={character.id}
          characterName={character.name}
          greeting={store.ai_greeting ?? null}
          open={open}
          onActivate={() => setOpen((v) => !v)}
        />
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close store assistant" : `Ask ${store.name}'s assistant`}
          className={`fixed bottom-5 right-4 z-50 flex h-14 items-center gap-2 rounded-full px-4 text-sm font-bold shadow-[0_14px_40px_-10px_oklch(0_0_0/0.6)] transition-transform hover:scale-105 active:scale-95 md:right-6 ${isPro ? "text-black" : "text-white"}`}
          style={{ background: isPro ? accent : "oklch(0.35 0.01 260)" }}
        >
          {isPro ? (
            <Sparkles className="h-5 w-5" />
          ) : (
            <Lock className="h-5 w-5" />
          )}
          <span className="hidden sm:inline">{isPro ? "Ask us" : "Store AI"}</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex h-[min(560px,calc(100dvh-6rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_40px_90px_-30px_oklch(0_0_0/0.8)] md:bottom-24 md:right-6"
          style={{ borderColor: `color-mix(in oklab, ${accent} 35%, transparent)` }}
          role="dialog"
          aria-label={`${store.name} assistant`}
        >
          <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-full text-black" style={{ background: accent }}>
              {character ? <span aria-hidden className="text-xl leading-none">{character.emoji}</span> : <Sparkles className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base leading-tight">{character ? `${character.name} · ${store.name} AI` : `${store.name} AI`}</p>
              <p className="text-[11px] text-muted-foreground">{isPro ? "Takes orders for the seller · answers instantly" : "Pro feature"}</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isPro ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground"><Lock className="h-6 w-6" /></span>
              <p className="font-display text-lg">The AI shop assistant is a Pro feature.</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Pro stores get an assistant that answers buyers, recommends products, and takes orders around the clock.
              </p>
              <button
                onClick={() => {
                  toast("Sellers upgrade from the dashboard or via the Premium icon.");
                  navigate({ to: "/auth", search: { mode: "sell" as const } });
                }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-black"
                style={{ background: accent }}
              >
                Go Pro <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.length === 0 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Hi 👋 I manage this shop's chat. Ask about any product, delivery, or place an order — I'll handle it for {store.name}.
                    </p>
                    <div className="grid gap-2">
                      {["Place an order", "What do you recommend?", "How does delivery work?"].map((chip) => (
                        <button
                          key={chip}
                          onClick={() => send(chip)}
                          className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-left text-sm transition-colors hover:border-gold"
                        >
                          {chip} <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm text-white"
                          : "max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-background px-3.5 py-2 text-sm text-foreground"
                      }
                      style={m.role === "user" ? { background: accent } : undefined}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {products.length > 0 && messages.some((m) => m.role === "assistant") && (
                  <div className="grid grid-cols-2 gap-2">
                    {products.slice(0, 4).map((p) => (
                      <a
                        key={p.id}
                        href={`/s/${store.slug}/p/${p.slug}`}
                        className="group overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-gold"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                          {p.image && <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                        </div>
                        <div className="px-2.5 py-2">
                          <p className="line-clamp-1 text-xs font-medium">{p.title}</p>
                          <p className="text-[11px] font-semibold" style={{ color: accent }}>{formatGHS(p.base_price, { currency: p.currency })}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
                {pendingOrder && !placed && (
                  <div className="rounded-2xl border border-gold/50 bg-gold/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: accent }}>
                      <ShoppingBag className="h-3.5 w-3.5" /> Confirm your order
                    </p>
                    <div className="mt-2 space-y-1 text-xs text-foreground">
                      <p>
                        <span className="text-muted-foreground">Item:</span>{" "}
                        {products.find((p) => p.slug === pendingOrder.product_slug)?.title ?? pendingOrder.product_slug}
                        {pendingOrder.variant && <> · {pendingOrder.variant}</>}
                      </p>
                      <p><span className="text-muted-foreground">Qty:</span> {pendingOrder.quantity}</p>
                      {pendingOrder.delivery && <p><span className="text-muted-foreground">Delivery area:</span> {pendingOrder.delivery}</p>}
                      {pendingOrder.payment && <p><span className="text-muted-foreground">Payment:</span> {pendingOrder.payment}</p>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={confirmOrder}
                        disabled={placing}
                        className="flex-1 rounded-full py-2 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-60"
                        style={{ background: accent }}
                      >
                        {placing ? "Placing…" : "Confirm order"}
                      </button>
                      <button
                        onClick={() => setPendingOrder(null)}
                        className="rounded-full border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}
                {placed && (
                  <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="min-w-0 text-xs">
                      <p className="font-semibold text-emerald-500">Order #{placed.order_number} placed</p>
                      <p className="mt-0.5 text-muted-foreground">
                        {placed.quantity}× {placed.title} — {formatGHS(placed.total, { currency: placed.currency })}
                      </p>
                      <Link to="/orders" className="mt-1.5 inline-flex items-center gap-1 font-semibold text-foreground underline">
                        Track it in Orders <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )}
                {busy && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the shelves…
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="border-t border-border/70 bg-background p-2.5"
              >
                <div className="flex items-end gap-2 rounded-2xl border border-input bg-card px-3 py-2 focus-within:border-gold/60">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Message ${store.name}…`}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
                    style={{ background: accent }}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}


/** Storefront location card: OpenStreetMap embed (keyless) geocoded from the
 *  store's area/city, plus a Google Maps directions link. Renders nothing
 *  when the store has no location set. */
export function StoreLocationCard({
  area,
  city,
  region,
  name,
}: {
  area?: string | null;
  city?: string | null;
  region?: string | null;
  name: string;
}) {
  const label = [area, city || region].filter(Boolean).join(", ");
  const geo = useQuery({
    queryKey: ["store-geocode", label],
    enabled: !!label,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const q = encodeURIComponent([area, city, region, "Ghana"].filter(Boolean).join(", "));
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
      if (!res.ok) throw new Error("geocode failed");
      const j = (await res.json()) as { lat: string; lon: string }[];
      return j?.[0] ? { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) } : null;
    },
  });

  if (!label) return null;
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, area, city].filter(Boolean).join(" "))}`;
  const pos = geo.data;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {pos ? (
        <iframe
          title={`Map — ${name}`}
          className="h-52 w-full border-0"
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${(pos.lon - 0.012).toFixed(5)}%2C${(pos.lat - 0.008).toFixed(5)}%2C${(pos.lon + 0.012).toFixed(5)}%2C${(pos.lat + 0.008).toFixed(5)}&layer=mapnik&marker=${pos.lat}%2C${pos.lon}`}
        />
      ) : (
        <div className="grid h-40 place-items-center bg-muted/50 text-xs text-muted-foreground">
          {geo.isLoading ? "Loading map…" : "Map unavailable — use Directions below"}
        </div>
      )}
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Where to find us</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
        <a
          href={gmaps}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full border border-gold/50 px-3 py-1.5 text-xs font-semibold text-gold transition-colors hover:bg-gold/10"
        >
          Directions →
        </a>
      </div>
    </div>
  );
}
