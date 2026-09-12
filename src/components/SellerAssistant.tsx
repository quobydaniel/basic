// AI seller assistant — a Pro side-panel of the seller inbox that works FOR
// the store owner: describes products for listings, tracks orders, spots low
// stock and drafts buyer replies. Grounded in the store's real catalog and
// orders (sellerAssistant server fn enforces ownership + Pro server-side).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Lock, Send, Sparkles, Store as StoreIcon, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { sellerAssistant } from "@/lib/ai.functions";

type Turn = { role: "user" | "assistant"; content: string };

const QUICK = [
  "Describe a product for my listing",
  "Track my orders",
  "Check for low stock",
  "How are my sales going?",
];

export function SellerAssistant({ onDone }: { onDone: () => void }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const run = useServerFn(sellerAssistant);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const store = useQuery({
    queryKey: ["assistant-my-store", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, plan")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; name: string; plan: string } | null;
    },
  });

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, busy]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || !store.data) return;
    setInput("");
    const next: Turn[] = [...messages, { role: "user", content: body }];
    setMessages(next);
    setBusy(true);
    try {
      const { reply } = await run({ data: { store_id: store.data.id, messages: next.slice(-20) } });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI unavailable");
      setMessages((m) => m.slice(0, -1)); // drop the turn so it can be retried
      setInput(body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
        <button onClick={onDone} className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent md:hidden" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-full border border-gold/40 bg-[var(--gold)]/10">
          <Sparkles className="h-5 w-5 text-[var(--gold)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">AI seller assistant</p>
          <p className="text-[11px] text-muted-foreground">{store.data ? `Working for ${store.data.name}` : "…"}</p>
        </div>
        <button onClick={onDone} className="hidden h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent md:grid" aria-label="Close assistant">
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Body */}
      {!store.isLoading && !store.data && (
        <EmptyCard icon={<StoreIcon className="h-6 w-6 text-muted-foreground" />} title="Open a store first">
          <p className="mt-1 text-sm text-muted-foreground">The AI assistant works out of your store — listings, orders, buyers.</p>
          <button onClick={() => navigate({ to: "/auth", search: { mode: "sell" as const } })} className="mt-5 rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-semibold text-[var(--gold-foreground)] hover:brightness-110">
            Start selling
          </button>
        </EmptyCard>
      )}
      {store.data && store.data.plan !== "pro" && (
        <EmptyCard icon={<Lock className="h-6 w-6 text-[var(--gold)]" />} title="A Pro feature">
          <p className="mt-1 text-sm text-muted-foreground">
            The AI assistant chats for you — describing products, tracking orders and drafting replies. Upgrade {store.data.name} to Pro to switch it on.
          </p>
          <button onClick={() => navigate({ to: "/dashboard/ai" })} className="mt-5 rounded-full bg-[var(--gold)] px-5 py-2.5 text-sm font-semibold text-[var(--gold-foreground)] hover:brightness-110">
            Upgrade to Pro
          </button>
        </EmptyCard>
      )}
      {store.data && store.data.plan === "pro" && (
        <>
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
            <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
              {messages.length === 0 && (
                <div className="mt-4 text-center">
                  <p className="font-display text-xl">Your right hand, on autopilot.</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    I know your catalog, your orders and your buyer conversations. Ask me to describe a product, track an
                    order, check stock or draft a reply.
                  </p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[14px] leading-snug shadow-sm ${
                      m.role === "user"
                        ? "rounded-br-md bg-[var(--gold)] text-[var(--gold-foreground)]"
                        : "rounded-bl-md border border-border/60 bg-card text-foreground"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-2.5">
                    <Sparkles className="h-4 w-4 animate-pulse text-[var(--gold)]" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick chips */}
          {messages.length === 0 && (
            <div className="border-t border-border bg-card/60 px-3 py-2">
              <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto">
                {QUICK.map((qq) => (
                  <button
                    key={qq}
                    onClick={() => send(qq)}
                    className="whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-gold/50 hover:text-foreground"
                  >
                    {qq}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-border bg-background px-3 pt-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto flex max-w-2xl items-end gap-1.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask your assistant…"
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-3xl border border-input bg-card px-4 py-2.5 text-[15px] outline-none focus:border-ring"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || busy}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] transition hover:brightness-110 disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4">
      <div className="max-w-sm rounded-3xl border border-dashed border-border p-10 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted">{icon}</div>
        <p className="mt-4 font-display text-xl">{title}</p>
        {children}
      </div>
    </div>
  );
}
