import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import { Sparkles, X, Send, Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { assistantChat } from "@/lib/ai.functions";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How can I get my first sale this week?",
  "Write a launch caption for Instagram",
  "What should I price a handmade tote?",
  "How do I request a rider for an order?",
];

/* Seller-side personalized suggestions — grounded in the store's live data:
   pending orders and low/ out-of-stock stock turn into concrete prompts. */
function useSellerSuggestions(open: boolean) {
  const { user } = useSession();
  const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => {
    setExtra([]);
    if (!open || !user) return;
    let dead = false;
    (async () => {
      try {
        const { data: stores } = await supabase
          .from("stores")
          .select("id")
          .eq("owner_id", user.id)
          .limit(5);
        const storeIds = (stores ?? []).map((s: { id: string }) => s.id);
        if (!storeIds.length || dead) return;
        const [{ count: pendingOrders }, { data: stockRows }] = await Promise.all([
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .in("store_id", storeIds)
            // order_status enum: pending = awaiting payment (the tracker's
            // "Placed" step). "placed" is not an enum value — the query
            // errored 22P02 and pending orders never surfaced in chips.
            .eq("status", "pending"),
          supabase
            .from("products")
            .select("title, product_variants(inventory_qty)")
            .in("store_id", storeIds)
            .eq("status", "active")
            .limit(60),
        ]);
        if (dead) return;
        const soldOut = (stockRows ?? [])
          .map((p: any) => ({
            title: p.title as string,
            qty: (p.product_variants ?? []).reduce(
              (s: number, v: any) => s + Number(v.inventory_qty ?? 0),
              0,
            ),
          }))
          .filter((p) => p.qty <= 3);
        const out: string[] = [];
        if (pendingOrders) out.push(`Help me handle my ${pendingOrders} pending order${pendingOrders === 1 ? "" : "s"}`);
        if (soldOut[0]) out.push(`Write a restock note for ${soldOut[0].title}`);
        else if (stockRows?.[0]) out.push(`Write a promo post for ${stockRows[0].title}`);
        setExtra(out.slice(0, 2));
      } catch {
        if (!dead) setExtra([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, [open, user?.id]);
  return extra;
}

export function FloatingAIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chat = useServerFn(assistantChat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Which dashboard screen the seller is on — "Orders", "Products", …
  const screen = pathname.split("/").filter(Boolean).slice(1).join(" / ") || "Dashboard";
  const sellerChips = useSellerSuggestions(open);
  const suggestions = sellerChips.length > 0 ? [...sellerChips, ...SUGGESTIONS.slice(0, 4 - sellerChips.length)] : SUGGESTIONS;
  // Ping ring greets first-timers only.
  const [firstTimeUsed] = useState(() => {
    try {
      return localStorage.getItem("basic:assistant-used") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    try { localStorage.setItem("basic:assistant-used", "1"); } catch {}
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await chat({ data: { messages: next, page_context: screen, page_path: pathname.slice(0, 300) } });
      setMessages([...next, { role: "assistant", content: res.reply ?? "" }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Assistant unavailable";
      if (msg.includes("429")) toast.error("Slow down — the assistant is catching its breath.");
      else if (msg.includes("402")) toast.error("AI credits exhausted. Add credits to keep chatting.");
      else toast.error(msg);
      // Roll the failed user turn back so they can retry
      setMessages(messages);
      setInput(clean);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        aria-label={open ? "Close assistant" : "Open BASIC assistant"}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] transition hover:scale-[1.03] active:scale-95 md:bottom-6 md:right-6"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        {!open && !firstTimeUsed && (
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
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-primary/10 to-transparent px-4 py-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-base leading-tight">BASIC assistant</p>
              <p className="text-[11px] text-muted-foreground">Ask about your store, sales, or copy</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="ml-auto grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="New conversation"
                title="New conversation"
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hi 👋 I can help with product ideas, pricing, captions, or figuring out what to do next in BASIC.
                </p>
                <div className="grid gap-2">
                  {sellerChips.length > 0 && (
                    <p className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                      <Sparkles className="h-3 w-3" /> For your store
                    </p>
                  )}
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:border-primary hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                      : "max-w-[92%] whitespace-pre-wrap text-sm text-foreground"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            )}
          </div>

          {/* Composer */}
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
                placeholder="Ask anything…"
                className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
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
