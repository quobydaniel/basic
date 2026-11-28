import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  CircleAlert,
  MessageCircle,
  Package,
  Pause,
  Play,
  Settings,
  Sparkles,
  PackageOpen,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard/autopilot")({
  component: AutopilotOps,
});

/* AI Autopilot operations workspace — the seller's control room for the
   store's AI clerk. Every control here writes a REAL backend state:
   stores.auto_pilot (store master, Pro only) and conversations.ai_enabled
   (per-chat pause). The engine re-checks both server-side on every run —
   this UI never pretends the AI is on when the server says otherwise. */
function AutopilotOps() {
  const { user } = useSession();
  const qc = useQueryClient();

  const store = useQuery({
    queryKey: ["my-store-plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, plan, auto_pilot, ai_name, ai_greeting, ai_persona")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as {
        id: string;
        name: string;
        plan: string;
        auto_pilot: boolean | null;
        ai_name: string | null;
        ai_greeting: string | null;
        ai_persona: string | null;
      } | null;
    },
  });

  if (!store.data) {
    return (
      <div className="p-4 pb-24 md:p-8">
        <h1 className="font-display text-3xl">AI Autopilot</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Create your store first — the autopilot operates on your storefront.
        </div>
      </div>
    );
  }

  const isPro = store.data.plan === "pro";

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">AI Autopilot</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your store's AI clerk — answering buyers, negotiating within your price floor, and
        confirming orders only with your approval.
      </p>

      {!isPro ? (
        <div className="mt-6 max-w-md rounded-3xl border border-gold/40 bg-gold/5 p-8 text-center">
          <Bot className="mx-auto h-10 w-10 text-gold" />
          <p className="mt-4 font-display text-2xl">Autopilot is a Pro feature</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The AI clerk answers buyers around the clock, negotiates within your price floor and
            drafts orders for your confirmation.
          </p>
          <p className="mt-4 rounded-xl bg-card px-4 py-3 text-xs text-muted-foreground">
            Ask the platform admin to switch{" "}
            <span className="font-medium text-foreground">{store.data.name}</span> to the Pro plan.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[340px_1fr]">
          {/* ── Left rail: master switch + identity ── */}
          <div className="space-y-5">
            <MasterSwitch store={store.data} />
            <IdentityCard store={store.data} />
            <WhatsAppConcept />
          </div>

          {/* ── Right: activity + conversations + alerts ── */}
          <div className="space-y-5">
            <ActivityFeed storeId={store.data.id} />
            <div className="grid gap-5 xl:grid-cols-2">
              <ConversationControls storeId={store.data.id} />
              <div className="space-y-5">
                <StockAlerts storeId={store.data.id} />
                <PendingOrders />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Store-wide master switch — writes stores.auto_pilot (real column) ── */
function MasterSwitch({
  store,
}: {
  store: { id: string; name: string; auto_pilot: boolean | null };
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const on = store.auto_pilot === true;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      // stores.auto_pilot ships in the seller-autopilot migration; the
      // generated types lag it, so the update rides the documented cast.
      const { error } = await (supabase as any)
        .from("stores")
        .update({ auto_pilot: !on })
        .eq("id", store.id);
      if (error) throw error;
      toast.success(
        !on
          ? "Autopilot ON — the AI clerk answers new buyers."
          : "Autopilot OFF — you reply to buyers yourself.",
      );
      qc.invalidateQueries({ queryKey: ["my-store-plan"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change autopilot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pearl-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span
              className={`h-2 w-2 rounded-full ${on ? "bg-success" : "bg-muted-foreground/40"}`}
            />
            Store-wide autopilot
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {on
              ? "The AI clerk greets buyers, answers questions and proposes orders for your confirmation."
              : "Paused — every buyer message waits for you in Chats."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={on}
          aria-label={on ? "Pause autopilot store-wide" : "Resume autopilot store-wide"}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-success" : "bg-muted"} disabled:opacity-60`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`}
          />
        </button>
      </div>
      <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-accent px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
        Orders are never created without your confirmation — proposals arrive in the chat and you
        tap to confirm. The engine also throttles itself server-side (10s per conversation).
      </p>
    </section>
  );
}

/* ── AI identity — read-only summary; editing lives in Settings ── */
function IdentityCard({
  store,
}: {
  store: { ai_name: string | null; ai_greeting: string | null; ai_persona: string | null };
}) {
  const name = store.ai_name || "The AI clerk";
  return (
    <section className="pearl-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-gold" /> AI identity
      </p>
      <dl className="mt-3 space-y-2 text-[13px]">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="truncate font-medium">{name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Greeting</dt>
          <dd className="mt-0.5 line-clamp-2 text-foreground/90">
            {store.ai_greeting || "— not set —"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">House rules</dt>
          <dd className="mt-0.5 line-clamp-3 text-foreground/90">
            {store.ai_persona || "— default voice —"}
          </dd>
        </div>
      </dl>
      <Link
        to="/dashboard/settings"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12px] font-semibold text-foreground hover:border-gold hover:text-gold"
      >
        <Settings className="h-3.5 w-3.5" /> Edit in Settings
      </Link>
    </section>
  );
}

/* ── Seller-to-AI WhatsApp — design/config surface only. The provider
   integration is NOT live; this card must never claim it is. ── */
function WhatsAppConcept() {
  return (
    <section className="pearl-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Phone className="h-4 w-4 text-gold" /> Command by WhatsApp
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        Soon: message your own autopilot from WhatsApp — "pause for lunch", "restock alert",
        "today's orders" — and it replies like a staff member.
      </p>
      <div className="mt-3 rounded-xl border border-dashed border-border px-3.5 py-3 text-[12px] text-muted-foreground">
        <p className="font-semibold text-foreground">Connection status</p>
        <p className="mt-0.5">
          Not yet available — the integration is in design. You'll connect and verify a number here
          when it ships.
        </p>
      </div>
    </section>
  );
}

/* ── AI activity — the autopilot's recent replies across the store ── */
function ActivityFeed({ storeId }: { storeId: string }) {
  const feed = useQuery({
    queryKey: ["autopilot-feed", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, body, created_at, metadata, conversation_id, conversation:conversations!inner(id, store_id, buyer:profiles!conversations_buyer_id_fkey(full_name))",
        )
        .eq("conversation.store_id", storeId)
        .eq("metadata->>ai", "true")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data as unknown as {
        id: string;
        body: string | null;
        created_at: string;
        conversation_id: string;
        conversation: { buyer: { full_name: string | null } | null } | null;
      }[];
    },
    staleTime: 20_000,
  });

  return (
    <section className="pearl-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4 text-gold" /> AI activity
      </p>
      {feed.isLoading ? (
        <p className="mt-4 text-[13px] text-muted-foreground">Loading…</p>
      ) : (feed.data ?? []).length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          No AI replies yet — they'll stream in here as the autopilot works.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {(feed.data ?? []).map((m) => (
            <li key={m.id} className="flex gap-3 py-2.5">
              <Link
                to="/dashboard/chats/$conversationId"
                params={{ conversationId: m.conversation_id }}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <p className="truncate text-[13px] font-medium text-foreground">
                  {m.conversation?.buyer?.full_name || "Buyer"}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">{m.body}</p>
              </Link>
              <span className="shrink-0 self-center text-[11px] text-muted-foreground">
                {new Date(m.created_at).toLocaleTimeString("en-GH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Per-chat pause — writes conversations.ai_enabled (the thread-header
   toggle's twin, surfaced at the ops desk) ── */
function ConversationControls({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const convos = useQuery({
    queryKey: ["autopilot-convos", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, ai_enabled, updated_at, buyer:profiles!conversations_buyer_id_fkey(full_name)")
        .eq("store_id", storeId)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as unknown as {
        id: string;
        ai_enabled: boolean | null;
        updated_at: string;
        buyer: { full_name: string | null } | null;
      }[];
    },
    staleTime: 15_000,
  });

  async function setAi(conversationId: string, next: boolean) {
    const { error } = await (supabase as any)
      .from("conversations")
      .update({ ai_enabled: next })
      .eq("id", conversationId);
    if (error) return toast.error(error.message);
    toast.success(next ? "AI on duty in this chat" : "AI paused in this chat — you reply yourself");
    qc.invalidateQueries({ queryKey: ["autopilot-convos", storeId] });
  }

  const rows = convos.data ?? [];
  return (
    <section className="pearl-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircle className="h-4 w-4 text-gold" /> Conversations
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">No buyer chats yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
              <Link
                to="/dashboard/chats/$conversationId"
                params={{ conversationId: c.id }}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <p className="truncate text-[13px] font-medium">{c.buyer?.full_name || "Buyer"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.ai_enabled === false ? "Paused — manual" : "AI on duty"}
                </p>
              </Link>
              <button
                onClick={() => setAi(c.id, c.ai_enabled === false)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  c.ai_enabled === false
                    ? "border-border text-muted-foreground hover:border-gold hover:text-gold"
                    : "border-success/40 text-success hover:bg-success/10"
                }`}
              >
                {c.ai_enabled === false ? (
                  <Play className="h-3 w-3" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
                {c.ai_enabled === false ? "Resume" : "Pause"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Stock alerts — real inventory from product_variants ≤ 5 ── */
function StockAlerts({ storeId }: { storeId: string }) {
  const alerts = useQuery({
    queryKey: ["autopilot-stock", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, title, inventory_qty, product:products!inner(id, title, slug, store_id)")
        .eq("product.store_id", storeId)
        .lte("inventory_qty", 5)
        .order("inventory_qty", { ascending: true })
        .limit(8);
      if (error) throw error;
      return data as unknown as {
        id: string;
        title: string;
        inventory_qty: number | null;
        product: { id: string; title: string; slug: string } | null;
      }[];
    },
    staleTime: 60_000,
  });

  const rows = alerts.data ?? [];
  return (
    <section className="pearl-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <PackageOpen className="h-4 w-4 text-gold" /> Stock alerts
      </p>
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">
          All stocked items are above 5 units.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-accent px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{v.product?.title}</p>
                <p className="text-[11px] text-muted-foreground">{v.title}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  (v.inventory_qty ?? 0) === 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-warning/15 text-warning"
                }`}
              >
                {(v.inventory_qty ?? 0) === 0 ? "Out" : `${v.inventory_qty} left`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Pending orders — proposals awaiting the seller's confirmation ── */
function PendingOrders() {
  const { user } = useSession();
  const pending = useQuery({
    queryKey: ["autopilot-pending", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: stores } = await supabase.from("stores").select("id").eq("owner_id", user!.id);
      const ids = (stores ?? []).map((s: any) => s.id);
      if (!ids.length) return { count: 0, total: 0 };
      const { data, error } = await supabase
        .from("orders")
        .select("id, total")
        .in("store_id", ids)
        .eq("status", "pending");
      if (error) throw error;
      return {
        count: (data ?? []).length,
        total: (data ?? []).reduce((s: number, o: any) => s + Number(o.total ?? 0), 0),
      };
    },
    staleTime: 30_000,
  });

  return (
    <section className="pearl-card p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Package className="h-4 w-4 text-gold" /> Awaiting confirmation
      </p>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="font-display text-3xl">{pending.data?.count ?? 0}</p>
          <p className="text-[12px] text-muted-foreground">
            {pending.data && pending.data.count > 0
              ? `orders · ${formatGHS(pending.data.total)} total`
              : "orders waiting"}
          </p>
        </div>
        <Link
          to="/dashboard/orders"
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12px] font-semibold hover:border-gold hover:text-gold"
        >
          Orders <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
