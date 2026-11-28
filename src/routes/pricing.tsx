// Billing & pricing — the gem icon's destination. Free vs Premium for BOTH
// personas, never mixed on screen: buyers see buyer plans, sellers see seller
// plans. No payment rail yet, so CTAs reserve a plan over WhatsApp and the
// page says so honestly.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Gem, Minus, Sparkles, Store as StoreIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Premium plans — BASIC" }] }),
  component: PricingPage,
});

const WHATSAPP_NUMBER = "233500000000";
const reserveLink = (plan: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hello BASIC, I'd like to reserve the ${plan} plan. My name is `)}`;

type PlanFeature = { label: string; ok: boolean; alt?: string };

// ---------------------------------------------------------------- seller plans
const SELLER_PLANS: { key: string; name: string; price: string; cadence: string; blurb: string; cta: string; highlight: boolean; features: PlanFeature[] }[] = [
  {
    key: "starter",
    name: "Starter",
    price: "GH₵0",
    cadence: "free forever",
    blurb: "Everything you need to open your doors on BASIC.",
    cta: "Included free",
    highlight: false,
    features: [
      { label: "List up to 10 products", ok: true },
      { label: "Chat with buyers", ok: true },
      { label: "Call & WhatsApp buttons", ok: true },
      { label: "Order tracking & buyer confirmation", ok: true },
      { label: "AI listing writer", ok: false },
      { label: "AI reply drafts in chat", ok: false },
      { label: "24/7 store AI assistant", ok: false },
      { label: "AI Studio marketing posts", ok: false },
      { label: "Featured placement", ok: false },
      { label: "Storefront theming", ok: false },
      { label: "Advanced sales analytics", ok: false },
      { label: "Verified store badge", ok: false },
      { label: "Priority support", ok: false },
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "GH₵45",
    cadence: "per month",
    blurb: "The full AI toolkit — your store sells while you sleep.",
    cta: "Reserve Pro",
    highlight: true,
    features: [
      { label: "List up to 10 products", ok: true, alt: "Unlimited products" },
      { label: "Chat with buyers", ok: true },
      { label: "Call & WhatsApp buttons", ok: true },
      { label: "Order tracking & buyer confirmation", ok: true },
      { label: "AI listing writer", ok: true },
      { label: "AI reply drafts in chat", ok: true },
      { label: "24/7 store AI assistant", ok: true },
      { label: "AI Studio marketing posts", ok: true },
      { label: "Featured placement", ok: true },
      { label: "Storefront theming", ok: true },
      { label: "Advanced sales analytics", ok: true },
      { label: "Verified store badge", ok: false },
      { label: "Priority support", ok: false },
    ],
  },
  {
    key: "elite",
    name: "Elite",
    price: "GH₵99",
    cadence: "per month",
    blurb: "For brands ready to own their category.",
    cta: "Reserve Elite",
    highlight: false,
    features: [
      { label: "List up to 10 products", ok: true, alt: "Unlimited products" },
      { label: "Chat with buyers", ok: true },
      { label: "Call & WhatsApp buttons", ok: true },
      { label: "Order tracking & buyer confirmation", ok: true },
      { label: "AI listing writer", ok: true },
      { label: "AI reply drafts in chat", ok: true },
      { label: "24/7 store AI assistant", ok: true },
      { label: "AI Studio marketing posts", ok: true },
      { label: "Featured placement", ok: true, alt: "Top-of-category placement" },
      { label: "Storefront theming", ok: true, alt: "Storefront theming + custom banner" },
      { label: "Advanced sales analytics", ok: true },
      { label: "Verified store badge", ok: true },
      { label: "Priority support", ok: true },
    ],
  },
];

// ----------------------------------------------------------------- buyer plans
const BUYER_PLANS: { key: string; name: string; price: string; cadence: string; blurb: string; cta: string; highlight: boolean; features: PlanFeature[] }[] = [
  {
    key: "shopper",
    name: "Shopper",
    price: "GH₵0",
    cadence: "free forever",
    blurb: "Shop everything on BASIC — no fees, ever.",
    cta: "Included free",
    highlight: false,
    features: [
      { label: "Unlimited browsing & chat", ok: true },
      { label: "Order tracking & confirmations", ok: true },
      { label: "Favorites & recently viewed", ok: true },
      { label: "AI shopping assistant", ok: true },
      { label: "Price-drop alerts on saved items", ok: false },
      { label: "Assistant remembers your taste", ok: false },
      { label: "Early access to Pro store drops", ok: false },
      { label: "5% back in BASIC credits", ok: false },
      { label: "Priority support", ok: false },
    ],
  },
  {
    key: "premium",
    name: "Premium",
    price: "GH₵15",
    cadence: "per month",
    blurb: "For serious shoppers — deals find you first.",
    cta: "Reserve Premium",
    highlight: true,
    features: [
      { label: "Unlimited browsing & chat", ok: true },
      { label: "Order tracking & confirmations", ok: true },
      { label: "Favorites & recently viewed", ok: true },
      { label: "AI shopping assistant", ok: true },
      { label: "Price-drop alerts on saved items", ok: true },
      { label: "Assistant remembers your taste", ok: true },
      { label: "Early access to Pro store drops", ok: true },
      { label: "5% back in BASIC credits", ok: true },
      { label: "Priority support", ok: false },
    ],
  },
  {
    key: "premium-yearly",
    name: "Premium Yearly",
    price: "GH₵150",
    cadence: "per year · 2 months free",
    blurb: "All Premium perks, one payment a year.",
    cta: "Reserve Yearly",
    highlight: false,
    features: [
      { label: "Unlimited browsing & chat", ok: true },
      { label: "Order tracking & confirmations", ok: true },
      { label: "Favorites & recently viewed", ok: true },
      { label: "AI shopping assistant", ok: true },
      { label: "Price-drop alerts on saved items", ok: true },
      { label: "Assistant remembers your taste", ok: true },
      { label: "Early access to Pro store drops", ok: true },
      { label: "5% back in BASIC credits", ok: true },
      { label: "Priority support", ok: true },
    ],
  },
];

function PricingPage() {
  const { user } = useSession();

  // Default the persona by what the visitor actually is — a store owner lands
  // on seller plans, everyone else on buyer plans. Persona separation: the
  // two plan families are never shown together.
  const myStore = useQuery({
    queryKey: ["pricing-my-store", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, plan").eq("owner_id", user!.id).limit(1);
      return (data as any[] | null)?.[0] ?? null;
    },
  });
  const isSeller = !!myStore.data;
  const [tab, setTab] = useState<"buyers" | "sellers" | null>(null);
  const active: "buyers" | "sellers" = tab ?? (isSeller ? "sellers" : "buyers");

  const plans = active === "sellers" ? SELLER_PLANS : BUYER_PLANS;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pt-6 md:max-w-4xl md:px-8 md:pt-10">
        {/* Hero */}
        <div className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-gild/40 bg-gild/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gild">
            <Gem className="h-3.5 w-3.5" /> BASIC Premium
          </p>
          <h1 className="mt-4 font-display text-4xl leading-tight md:text-5xl">
            Free to shop. Free to sell.
            <span className="block text-gild">Premium when you're ready.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Every BASIC account starts free. Upgrade for the AI toolkit, alerts and perks — cancel anytime.
          </p>
        </div>

        {/* Persona toggle — one family at a time */}
        <div className="mx-auto mt-6 grid w-full max-w-xs grid-cols-2 gap-1 rounded-full border border-border bg-card p-1 text-sm">
          {(["buyers", "sellers"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-active={active === t}
              className="flex items-center justify-center gap-1.5 rounded-full py-2 font-medium data-[active=true]:bg-gild data-[active=true]:text-gild-foreground"
            >
              {t === "buyers" ? "For buyers" : (<><StoreIcon className="h-3.5 w-3.5" /> For sellers</>)}
            </button>
          ))}
        </div>

        {/* Plan cards */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const current = active === "sellers" && isSeller && p.key === "pro" && (myStore.data as any)?.plan === "pro";
            return (
              <div
                key={p.key}
                className={`relative flex flex-col rounded-3xl border p-5 ${
                  p.highlight
                    ? "border-gild/60 bg-gradient-to-b from-gild/10 via-card to-card shadow-[0_0_40px_-12px_var(--gild)]"
                    : "border-border bg-card"
                }`}
              >
                {(p.highlight || current) && (
                  <p className="absolute -top-2.5 left-5 rounded-full bg-gild px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gild-foreground">
                    {current ? "Your current plan" : "Most popular"}
                  </p>
                )}
                <p className="font-display text-xl">{p.name}</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-display text-3xl">{p.price}</span>
                  <span className="text-xs text-muted-foreground">{p.cadence}</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{p.blurb}</p>
                <ul className="mt-4 flex-1 space-y-2">
                  {p.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-2 text-xs leading-snug">
                      {f.ok ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gild" strokeWidth={2.5} />
                      ) : (
                        <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={f.ok ? "text-foreground" : "text-muted-foreground/60"}>{f.alt ?? f.label}</span>
                    </li>
                  ))}
                </ul>
                {p.cta.startsWith("Reserve") ? (
                  <a
                    href={reserveLink(`${p.name} (${active === "sellers" ? "seller" : "buyer"})`)}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-5 inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
                      p.highlight ? "bg-gild text-gild-foreground" : "border border-gild text-gild"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> {p.cta}
                  </a>
                ) : (
                  <p className="mt-5 rounded-full border border-border py-2.5 text-center text-sm font-medium text-muted-foreground">
                    {p.cta}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Compare table — benefits side by side */}
        <h2 className="mt-12 font-display text-2xl">Compare every benefit</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {active === "sellers" ? "Seller feature" : "Buyer benefit"}
                </th>
                {plans.map((p) => (
                  <th key={p.key} className="px-4 py-3 text-center">
                    <span className={`block text-xs font-semibold ${p.highlight ? "text-gild" : ""}`}>{p.name}</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">{p.price}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans[0].features.map((row, ri) => (
                <tr key={row.label} className="border-b border-border/50 last:border-b-0">
                  <td className="px-4 py-2.5 text-xs">{row.label}</td>
                  {plans.map((p) => {
                    const f = p.features[ri];
                    return (
                      <td key={p.key} className="px-4 py-2.5 text-center text-xs">
                        {f.ok ? (
                          <span className="inline-flex items-center justify-center gap-1 text-gild">
                            <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                            {f.alt && (
                              <span className="text-[10px] font-medium">
                                {f.alt.length > 20 ? f.alt.slice(0, 18) + "…" : f.alt}
                              </span>
                            )}
                          </span>
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* No payment rail yet — say so, and give the next step */}
        <div className="mt-8 rounded-2xl border border-gild/30 bg-gild/5 p-4 text-center">
          <p className="text-sm font-medium">Mobile money & card billing are launching soon.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Reserving a plan today is free — you'll be switched on the moment billing goes live, with your first month on us.
          </p>
          {active === "sellers" && !isSeller && (
            <Link
              to="/auth"
              search={{ mode: "sell" as const }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <StoreIcon className="h-4 w-4" /> Open a free store first
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
