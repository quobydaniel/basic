import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, Copy, Instagram, Radio, MessageCircle, Facebook, Save, Share2, Wand2, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { generateMarketingPost } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/dashboard/ai")({
  component: AIStudio,
});

const CHANNELS = [
  { id: "instagram" as const, label: "Instagram", icon: Instagram, tint: "var(--terracotta)" },
  { id: "tiktok" as const, label: "TikTok", icon: Radio, tint: "var(--ink)" },
  { id: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle, tint: "var(--sage)" },
  { id: "facebook" as const, label: "Facebook", icon: Facebook, tint: "var(--gold)" },
];
type ChannelId = (typeof CHANNELS)[number]["id"];

function AIStudio() {
  const { user } = useSession();
  const store = useQuery({
    queryKey: ["my-store-plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, plan")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });
  const isPro = (store.data?.plan ?? "free") === "pro";
  if (!isPro) {
    return (
      <div className="p-4 pb-24 md:p-8">
        <h1 className="font-display text-3xl">AI Studio</h1>
        <div className="mx-auto mt-6 max-w-md rounded-3xl border border-[var(--gold)]/40 bg-[var(--gold)]/5 p-8 text-center">
          <Wand2 className="mx-auto h-10 w-10 text-[var(--gold)]" />
          <p className="mt-4 font-display text-2xl">AI Studio is a Pro feature</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Turn one product into a week of Instagram, TikTok, and WhatsApp posts — written for you. Upgrade your store to Pro to unlock it.
          </p>
          <p className="mt-4 rounded-xl bg-card px-4 py-3 text-xs text-muted-foreground">
            Ask the platform admin to switch <span className="font-medium text-foreground">{store.data?.name}</span> to the Pro plan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 md:p-8">
      <h1 className="font-display text-3xl">AI Studio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Turn one product into a week of posts. Pick a product, choose the channel, and BASIC writes it for you.
      </p>

      <MarketingPostGenerator />

      <div className="mt-10">
        <h2 className="font-display text-xl">Quick writers</h2>
        <p className="mt-1 text-sm text-muted-foreground">Free-form helpers for anything else.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Generator
            title="Product description"
            placeholder="Handwoven kente scarf in indigo and gold"
            system="You write short, warm product descriptions for a Ghanaian marketplace. 2-3 sentences, no emojis."
          />
          <Generator
            title="WhatsApp broadcast"
            placeholder="Weekend sale: 20% off all jewelry"
            system="You write concise, friendly WhatsApp broadcasts for Ghanaian shoppers. Under 300 characters, include a call to action."
          />
          <Generator
            title="Campaign idea"
            placeholder="Launching a new perfume line"
            system="You are a Ghanaian growth marketer. Suggest a 3-step launch campaign across IG, TikTok, and WhatsApp."
          />
          <Generator
            title="Product name ideas"
            placeholder="Ceramic mug, hand-glazed, matte black"
            system="You suggest 5 short, memorable product names for a Ghanaian brand. Return a numbered list."
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Marketing Post Generator                          */
/* -------------------------------------------------------------------------- */

function MarketingPostGenerator() {
  const { user } = useSession();
  const qc = useQueryClient();
  const runGenerate = useServerFn(generateMarketingPost);

  const [productId, setProductId] = useState<string>("");
  const [channel, setChannel] = useState<ChannelId>("instagram");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const store = useQuery({
    queryKey: ["my-store-id", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, plan")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const isPro = (store.data?.plan ?? "free") === "pro";

  const products = useQuery({
    queryKey: ["ai-products", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, title, base_price, currency, status, product_media(url, position)")
        .eq("store_id", store.data!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const history = useQuery({
    queryKey: ["ai-marketing-history", store.data?.id],
    enabled: !!store.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_generations")
        .select("id, created_at, input, output")
        .eq("store_id", store.data!.id)
        .eq("kind", "marketing_post")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const selectedProduct = useMemo(
    () => (products.data ?? []).find((p) => p.id === productId) ?? null,
    [products.data, productId],
  );
  const heroImage = useMemo(() => {
    const media = (selectedProduct?.product_media ?? []) as { url: string; position: number | null }[];
    return media.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]?.url ?? null;
  }, [selectedProduct]);

  async function onGenerate() {
    if (!productId) {
      toast.error("Pick a product first");
      return;
    }
    setBusy(true);
    setCaption("");
    try {
      const res = await runGenerate({ data: { product_id: productId, channel } });
      setCaption(res.caption ?? "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      if (msg.includes("429")) toast.error("Rate limit reached. Try again in a moment.");
      else if (msg.includes("402")) toast.error("AI credits exhausted. Add credits to continue.");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!store.data?.id || !caption.trim() || !selectedProduct) throw new Error("Nothing to save");
      const { error } = await supabase.from("ai_generations").insert({
        store_id: store.data.id,
        user_id: user!.id,
        kind: "marketing_post",
        input: { product_id: productId, product_title: selectedProduct.title, channel },
        output: { caption },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved to your library");
      qc.invalidateQueries({ queryKey: ["ai-marketing-history"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  function share() {
    if (!caption.trim()) return;
    const shareData: ShareData = {
      title: selectedProduct?.title ?? "New from my shop",
      text: caption,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard.writeText(caption);
      toast.success("Copied — paste it into the app");
    }
  }

  if (!store.data) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Create your store first to generate posts for your products.
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      {/* ----------- Left: controls ----------- */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-[var(--gold)]" />
          <p className="font-display text-lg">Marketing post generator</p>
        </div>

        {/* product picker */}
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Product
        </label>
        <select
          value={productId}
          onChange={(e) => { setProductId(e.target.value); setCaption(""); }}
          className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
        >
          <option value="">— Select a product —</option>
          {(products.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} {p.status !== "active" ? `(${p.status})` : ""}
            </option>
          ))}
        </select>

        {/* channel picker */}
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Channel
        </label>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHANNELS.map((c) => {
            const active = channel === c.id;
            return (
              <button
                key={c.id}
                onClick={() => { setChannel(c.id); setCaption(""); }}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <c.icon className="h-4 w-4" style={{ color: c.tint }} />
                {c.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={onGenerate}
          disabled={busy || !productId}
          className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Writing your post…</> : <><Sparkles className="h-4 w-4" /> Generate caption</>}
        </button>

        {/* History */}
        {(history.data ?? []).length > 0 && (
          <div className="mt-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <History className="h-3.5 w-3.5" /> Recent
            </div>
            <div className="space-y-2">
              {(history.data ?? []).map((h) => {
                const input = (h.input ?? {}) as { product_title?: string; channel?: string };
                const out = (h.output ?? {}) as { caption?: string };
                return (
                  <button
                    key={h.id}
                    onClick={() => { setCaption(out.caption ?? ""); }}
                    className="block w-full rounded-lg border border-border bg-background p-2.5 text-left text-xs hover:border-primary"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{input.product_title ?? "Post"}</span>
                      <span className="shrink-0 text-muted-foreground">{input.channel}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{out.caption}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ----------- Right: preview ----------- */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg">Preview</p>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs capitalize text-muted-foreground">{channel}</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-background">
          {heroImage ? (
            <img src={heroImage} alt={selectedProduct?.title ?? ""} className="aspect-square w-full object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center text-xs text-muted-foreground">
              {selectedProduct ? "No image yet" : "Pick a product to see the preview"}
            </div>
          )}
          <div className="p-3">
            {caption ? (
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={7}
                className="w-full resize-none rounded-lg border border-input bg-background p-2.5 text-sm outline-none focus:border-ring"
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {busy ? "Writing your post…" : "Your caption will appear here."}
              </p>
            )}
          </div>
        </div>

        {caption && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(caption); toast.success("Copied"); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm hover:bg-accent"
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
            <button
              onClick={share}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm hover:bg-accent"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save to library
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Free-form Generator                            */
/* -------------------------------------------------------------------------- */

function Generator({ title, placeholder, system }: { title: string; placeholder: string; system: string }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!input.trim()) return;
    setBusy(true);
    setOutput("");
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? "";
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: input },
          ],
        }),
      });
      if (res.status === 429) throw new Error("Rate limit reached. Try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits to continue.");
      if (!res.ok) throw new Error("AI request failed");
      const j = await res.json();
      setOutput(j.choices?.[0]?.message?.content?.trim() ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--gold)]" />
        <p className="font-display text-lg">{title}</p>
      </div>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="mt-3 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring"
      />
      <button
        onClick={run}
        disabled={busy || !input.trim()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : "Generate"}
      </button>
      {output && (
        <div className="mt-3 rounded-xl border border-border bg-background p-3">
          <p className="whitespace-pre-wrap text-sm">{output}</p>
          <button
            onClick={() => { navigator.clipboard.writeText(output); toast.success("Copied"); }}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      )}
    </div>
  );
}
