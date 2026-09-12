// Buyer AI assistant — floating, context-aware. On each page it greets
// differently, suggests the right actions, and can navigate the app / find
// products / draft offers. The AI never messages sellers directly.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLocation } from "@tanstack/react-router";
import { X, Send, Loader2, Sparkles, Navigation, PackageSearch, HandCoins, Store } from "lucide-react";
import { toast } from "sonner";
import { buyerAssistant } from "@/lib/ai.functions";
import { formatGHS } from "@/lib/format";

type AssistantStore = {
  id: string; slug: string; name: string; tagline: string | null;
  area: string | null; city: string | null; logo_url: string | null; pro: boolean;
};
type Msg = { role: "user" | "assistant"; content: string; products?: AssistantProduct[]; stores?: AssistantStore[]; go?: string | null };
type AssistantProduct = {
  id: string; slug: string; title: string; base_price: number; currency: string;
  store: { slug: string; name: string; area?: string | null; city?: string | null } | null;
  image: string | null;
};

type AssistantContext = "home" | "discover" | "product" | "orders" | "favorites" | "account";

// Lightweight markdown for assistant replies: **bold**, "- " bullets,
// blank-line paragraphs. Keeps replies scannable without a markdown dep.
function RichText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${out.length}`} className="my-1.5 space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
            <span className="min-w-0">{inlineMd(b)}</span>
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^[-*•]\s+/.test(line)) { bullets.push(line.replace(/^[-*•]\s+/, "")); continue; }
    flush();
    out.push(<p key={`p-${out.length}`} className="my-1">{inlineMd(line)}</p>);
  }
  flush();
  return <div className="leading-relaxed">{out}</div>;
}

function inlineMd(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

const CONTEXT_META: Record<AssistantContext, { teaser: string; sub: string; chips: string[] }> = {
  home: {
    teaser: "Need help finding something?",
    sub: "Find products · stores · navigate the app",
    chips: ["What's trending in Ghana?", "Gifts under GH₵200", "Which stores sell kente?"],
  },
  discover: {
    teaser: "Search smarter — ask me",
    sub: "I'll dig through the whole catalog",
    chips: ["Kente under GH₵500", "Best skincare sellers", "Shops in Accra"],
  },
  product: {
    teaser: "Ask about this product",
    sub: "Grounded in this listing — reviews, price, seller",
    chips: ["What should I ask the seller?", "Draft an offer", "Is this good value?"],
  },
  orders: {
    teaser: "Questions about an order?",
    sub: "Payments, delivery, and tracking answers",
    chips: ["How do payments work?", "What does escrow mean?", "Take me to my chats"],
  },
  favorites: {
    teaser: "Chat about a favorite?",
    sub: "I'll help you pick between saved items",
    chips: ["Which of my favorites is best value?", "Compare my saved items", "Take me to my orders"],
  },
  account: {
    teaser: "Need a hand?",
    sub: "Find products · stores · navigate the app",
    chips: ["What's trending in Ghana?", "Take me to my orders", "How does BASIC work?"],
  },
};

export function FloatingBuyerAssistant({ productId, context = "home" }: { productId?: string; context?: AssistantContext }) {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);
  const chat = useServerFn(buyerAssistant);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const meta = CONTEXT_META[context] ?? CONTEXT_META.home;

  // Teaser bubble: appears after a short settle, resets per page context
  useEffect(() => {
    setShowTeaser(false);
    const t = setTimeout(() => setShowTeaser(true), 2200);
    return () => clearTimeout(t);
  }, [context]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setShowTeaser(false);
    try { localStorage.setItem("basic:assistant-used", "1"); } catch {}
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = (await chat({ data: { messages: next, product_id: productId, page_context: context, page_path: loc.href.slice(0, 300) } })) as any;
      setMessages([...next, { role: "assistant", content: res.reply ?? "", products: res.products ?? [], stores: res.stores ?? [], go: res.go ?? null }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Assistant unavailable";
      if (msg.includes("429")) toast.error("Slow down — the assistant is catching its breath.");
      else toast.error(msg);
      setMessages(messages);
      setInput(clean);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* Teaser bubble */}
      {showTeaser && !open && (
        <div
          className="fixed bottom-[8.75rem] right-[4.25rem] z-40 md:bottom-[6.75rem]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="relative flex items-center gap-1 rounded-2xl rounded-br-sm border border-border bg-card px-3.5 py-2.5 shadow-[var(--shadow-soft)]">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--gold)]" />
            <span className="text-xs font-medium">{meta.teaser}</span>
            <button
              aria-label="Dismiss"
              onClick={() => setShowTeaser(false)}
              className="ml-1 text-muted-foreground/60 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Launcher — gradient orb with sweep shine */}
      <button
        aria-label={open ? "Close assistant" : "Open BASIC assistant"}
        onClick={() => {
          setOpen((v) => !v);
          setShowTeaser(false);
        }}
        className="group fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary via-primary to-[var(--gold)] text-primary-foreground shadow-[0_12px_30px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition hover:scale-[1.05] active:scale-95 md:bottom-6 md:right-6"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
          <span className="absolute -left-8 top-0 h-full w-8 rotate-12 bg-white/25 blur-md transition-all duration-700 group-hover:left-14" />
        </span>
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <Sparkles className="h-6 w-6 transition-transform group-hover:rotate-12" />
        )}
        {!open && (
          <span className="pointer-events-none absolute inset-0 -z-10 animate-ping rounded-full bg-primary/40" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-36 right-4 z-50 flex h-[min(560px,calc(100dvh-10rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:bottom-24 md:right-6"
          role="dialog"
          aria-label="BASIC assistant"
        >
          <div className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-4 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-[var(--gold)] text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-base leading-tight">BASIC assistant</p>
              <p className="text-[11px] text-muted-foreground">{meta.sub}</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="ml-auto rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Clear
              </button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {context === "product"
                    ? "Hi 👋 I've read this listing, its reviews, and the seller details. Ask me anything — or I can draft an offer for you."
                    : context === "discover"
                      ? "Hi 👋 Tell me what you're looking for — I'll dig through every store on BASIC."
                      : "Hi 👋 I can find products, suggest stores, answer questions, and take you anywhere in the app."}
                </p>
                <div className="grid gap-2">
                  {meta.chips.map((s) => {
                    const Icon =
                      s.startsWith("Take me") ? Navigation
                      : /draft an offer|offer/i.test(s) ? HandCoins
                      : /store|seller/i.test(s) ? Store
                      : PackageSearch;
                    return (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:border-primary hover:bg-accent"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                      : "max-w-[94%] rounded-2xl rounded-bl-md border border-border/70 bg-background/70 px-3.5 py-2.5 text-sm text-foreground"
                  }
                >
                  {m.role === "user" ? m.content : <RichText text={m.content} />}
                </div>
                {m.stores && m.stores.length > 0 && (
                  <div className="w-full space-y-1.5">
                    {m.stores.map((st) => (
                      <a
                        key={st.id}
                        href={`/s/${st.slug}`}
                        className="flex items-center gap-2.5 rounded-2xl border border-border bg-background p-2 transition hover:border-primary"
                      >
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                          {st.logo_url && <img src={st.logo_url} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-medium">
                            {st.name}
                            {st.pro && <span className="ml-1.5 rounded-full bg-[var(--gold)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[var(--gold-foreground)]">Pro</span>}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {st.tagline || "Storefront"}{st.area ? ` · ${st.area}` : st.city ? ` · ${st.city}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-primary">View →</span>
                      </a>
                    ))}
                  </div>
                )}
                {m.products && m.products.length > 0 && (
                  <div className="w-full space-y-1.5">
                    {m.products.map((p) => (
                      <a
                        key={p.id}
                        href={`/s/${p.store?.slug ?? ""}/p/${p.slug}`}
                        className="flex items-center gap-2.5 rounded-2xl border border-border bg-background p-2 transition hover:border-primary"
                      >
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-medium">{p.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.store?.name}{p.store?.area ? ` · ${p.store.area}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold">{formatGHS(p.base_price, { currency: p.currency })}</span>
                      </a>
                    ))}
                    <a href="/discover" className="block rounded-xl bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground hover:bg-accent">
                      Browse all products →
                    </a>
                  </div>
                )}
                {m.go && (
                  <a href={m.go} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                    <Navigation className="h-3.5 w-3.5" /> Take me there →
                  </a>
                )}
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
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
            <div className="flex items-end gap-2 rounded-2xl border border-input bg-card px-3 py-2 focus-within:border-ring">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={productId ? "Ask about this product…" : "Ask anything…"}
                className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
