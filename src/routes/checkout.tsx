import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Loader2,
  MapPin,
  ShoppingBag,
  Truck,
  User,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useCart, setQty, removeFromCart, cartTotal, type CartItem } from "@/lib/cart";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { paymentLabel } from "@/routes/cart";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

type CheckoutAddress = {
  full_name: string;
  phone: string;
  region: string;
  city: string;
  area: string;
  street: string;
};

const ADDRESS_KEY = "basic:checkout:address";

type PerItemChoice = Record<string, { delivery: boolean; payment: string | null }>;

type OrderResult = {
  item: CartItem;
  ok: boolean;
  orderNumber?: string;
  total?: number;
  error?: string;
};

const STEPS = ["Address", "Delivery", "Payment", "Review"] as const;

/** Buyer checkout — address → delivery → payment → review → confirmation.
    Each cart line becomes its own order through the authoritative
    `place_order` RPC: the server re-checks price floors, stock and
    idempotency, so the client can never invent a price or oversell. */
function CheckoutPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const items = useCart();
  const total = cartTotal();

  const [step, setStep] = useState(0);
  const [address, setAddress] = useState<CheckoutAddress>(() => {
    try {
      const raw = localStorage.getItem(ADDRESS_KEY);
      return raw
        ? (JSON.parse(raw) as CheckoutAddress)
        : { full_name: "", phone: "", region: "", city: "", area: "", street: "" };
    } catch {
      return { full_name: "", phone: "", region: "", city: "", area: "", street: "" };
    }
  });
  const [choices, setChoices] = useState<PerItemChoice>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.key,
        {
          delivery: i.delivery_available === true,
          payment: i.payment_type,
        },
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<OrderResult[] | null>(null);

  const anyDelivery = items.some((i) => choices[i.key]?.delivery);

  function updateChoice(key: string, patch: Partial<PerItemChoice[string]>) {
    setChoices((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  }

  function saveAddress(next: CheckoutAddress) {
    setAddress(next);
    try {
      localStorage.setItem(ADDRESS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }

  function addressValid(): boolean {
    if (!address.full_name.trim() || !address.phone.trim()) return false;
    if (anyDelivery && (!address.region.trim() || !address.city.trim())) return false;
    return true;
  }

  function deliveryText(): string {
    const where = [address.area, address.city, address.region].filter(Boolean).join(", ");
    return `Deliver to ${address.full_name.trim()} · ${address.phone.trim()}${where ? ` · ${where}` : ""}${address.street.trim() ? ` · ${address.street.trim()}` : ""}`;
  }

  async function placeOrders() {
    if (!user || busy) return;
    setBusy(true);
    // One idempotency key per line per attempt: a confirmed submission
    // re-returns the original order; a failed line can be retried fresh.
    const attemptKeys = Object.fromEntries(items.map((i) => [i.key, crypto.randomUUID()]));
    const out: OrderResult[] = [];
    for (const item of items) {
      const choice = choices[item.key] ?? { delivery: false, payment: item.payment_type };
      try {
        // place_order ships in the pending order-hardening SQL — until the
        // generated types regen, the RPC rides the documented `as any` cast
        // pattern (BACKEND-CONTRACT §8).
        const { data, error } = await (supabase as any).rpc("place_order", {
          p_store_id: item.store_id,
          p_product_id: item.product_id,
          p_quantity: item.qty,
          p_unit_price: item.unit_price,
          p_variant_title: item.variant_title,
          p_delivery: choice.delivery ? deliveryText() : null,
          p_payment: choice.payment,
          p_notes: notes.trim() || null,
          p_source: "cart",
          p_idempotency_key: attemptKeys[item.key],
        });
        if (error) throw error;
        const res = (data ?? {}) as { order_number?: string; total?: number; duplicate?: boolean };
        out.push({
          item,
          ok: true,
          orderNumber: res.order_number,
          total: res.total,
        });
      } catch (e) {
        out.push({
          item,
          ok: false,
          error: e instanceof Error ? e.message : "Order could not be placed",
        });
      }
    }
    setResults(out);
    // Successful lines leave the cart; failed lines stay with their reason.
    const okKeys = out.filter((r) => r.ok).map((r) => r.item.key);
    if (okKeys.length) {
      for (const key of okKeys) removeFromCart(key);
    }
    setBusy(false);
  }

  /* ── Confirmation screen ── */
  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
          <div className="pearl-card p-6 text-center md:p-10">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/12 text-success">
              <CheckCircle2 className="h-8 w-8" strokeWidth={1.6} />
            </span>
            <h1 className="mt-4 font-display text-3xl">
              {failed.length === 0 ? "Order placed" : "Almost there"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {failed.length === 0
                ? "The seller has been notified and will confirm your order shortly."
                : `${ok.length} of ${results.length} orders placed. The rest need attention below.`}
            </p>

            {ok.length > 0 && (
              <ul className="mt-6 space-y-2 text-left">
                {ok.map((r) => (
                  <li key={r.item.key} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">Order {r.orderNumber}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {r.item.title} × {r.item.qty}
                      </p>
                    </div>
                    <p className="ml-3 shrink-0 text-sm font-bold text-gold">
                      {formatGHS(r.total ?? r.item.unit_price * r.item.qty, { currency: r.item.currency })}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {failed.length > 0 && (
              <ul className="mt-4 space-y-2 text-left">
                {failed.map((r) => (
                  <li key={r.item.key} className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{r.item.title}</p>
                        <p className="mt-0.5 flex items-start gap-1.5 text-[12px] text-destructive">
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {r.error}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          removeFromCart(r.item.key);
                          setResults((prev) => (prev ?? []).filter((p) => p.item.key !== r.item.key));
                        }}
                        className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                to="/orders"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Track my orders <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/discover"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:border-gold hover:text-gold"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ── Empty cart ── */
  if (items.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
          <div className="pearl-card flex flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gild/12 text-gild">
              <ShoppingBag className="h-7 w-7" strokeWidth={1.6} />
            </span>
            <p className="font-display text-xl">Nothing to check out</p>
            <Link
              to="/discover"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Discover products <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ── Sign-in gate ── */
  if (!user) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
          <div className="pearl-card flex flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gild/12 text-gild">
              <User className="h-7 w-7" strokeWidth={1.6} />
            </span>
            <div>
              <p className="font-display text-xl">Sign in to check out</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your cart is saved on this device and waits for you.
              </p>
            </div>
            <Link
              to="/auth"
              search={{ mode: "shop" as const }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <button
          onClick={() => (step === 0 ? navigate({ to: "/cart" }) : setStep((s) => Math.max(0, s - 1)))}
          className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {step === 0 ? "Back to cart" : STEPS[step - 1]}
        </button>
        <h1 className="font-display text-3xl md:text-4xl">Checkout</h1>

        {/* Step rail */}
        <ol className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] ${
                  i < step
                    ? "border-success bg-success text-success-foreground"
                    : i === step
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-border text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={i === step ? "text-foreground" : "text-muted-foreground"}>{label}</span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-border md:w-8" />}
            </li>
          ))}
        </ol>

        {/* ── STEP 1 — delivery address ── */}
        {step === 0 && (
          <section className="pearl-card mt-6 p-5 md:p-6">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-gold" /> Contact & delivery address
            </p>
            {anyDelivery ? (
              <p className="mt-1 text-[12px] text-muted-foreground">
                Some items in your cart are delivered — a Ghana address is required.
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-muted-foreground">
                Your cart is meet-in-person — we still need a name and phone for the seller.
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Full name" value={address.full_name} onChange={(v) => saveAddress({ ...address, full_name: v })} placeholder="Ama Mensah" />
              <Field label="Phone" value={address.phone} onChange={(v) => saveAddress({ ...address, phone: v })} placeholder="024 000 0000" type="tel" />
              <Field label="Region" value={address.region} onChange={(v) => saveAddress({ ...address, region: v })} placeholder="Greater Accra" />
              <Field label="City / Town" value={address.city} onChange={(v) => saveAddress({ ...address, city: v })} placeholder="Accra" />
              <Field label="Area" value={address.area} onChange={(v) => saveAddress({ ...address, area: v })} placeholder="Osu" />
              <Field label="Street / landmark" value={address.street} onChange={(v) => saveAddress({ ...address, street: v })} placeholder="Oxford Street, near the junction" />
            </div>
            <button
              onClick={() => {
                if (!addressValid()) {
                  toast.error(anyDelivery ? "Name, phone, region and city are required" : "Name and phone are required");
                  return;
                }
                setStep(1);
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Continue to delivery <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        )}

        {/* ── STEP 2 — delivery method per item ── */}
        {step === 1 && (
          <section className="pearl-card mt-6 p-5 md:p-6">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4 text-gold" /> How should each item reach you?
            </p>
            <ul className="mt-4 divide-y divide-border">
              {items.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {item.delivery_available
                        ? "This seller offers delivery"
                        : "Meet the seller / pickup only"}
                    </p>
                  </div>
                  {item.delivery_available ? (
                    <div className="flex shrink-0 rounded-full border border-border p-0.5">
                      {[
                        { label: "Delivery", value: true },
                        { label: "Meet", value: false },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => updateChoice(item.key, { delivery: opt.value })}
                          data-active={choices[item.key]?.delivery === opt.value}
                          className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-muted-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
                      Meet seller
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {anyDelivery && (
              <p className="mt-3 rounded-xl bg-accent px-3.5 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
                Delivering to <span className="font-semibold text-foreground">{address.full_name}</span> ·{" "}
                {[address.area, address.city, address.region].filter(Boolean).join(", ") || "address incomplete"}
              </p>
            )}
            <button
              onClick={() => setStep(2)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Continue to payment <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        )}

        {/* ── STEP 3 — payment terms per item ── */}
        {step === 2 && (
          <section className="pearl-card mt-6 p-5 md:p-6">
            <p className="text-sm font-semibold">Payment terms</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Each seller sets how payment happens. BASIC never charges your card
              directly — terms are agreed with the seller.
            </p>
            <ul className="mt-4 divide-y divide-border">
              {items.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-[12px] text-muted-foreground">{item.store_name}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[12px] font-semibold text-gold">
                    {paymentLabel(choices[item.key]?.payment ?? item.payment_type)}
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setStep(3)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Review order <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        )}

        {/* ── STEP 4 — review & confirm ── */}
        {step === 3 && (
          <section className="pearl-card mt-6 p-5 md:p-6">
            <p className="text-sm font-semibold">Review</p>
            <ul className="mt-4 divide-y divide-border">
              {items.map((item) => (
                <li key={item.key} className="flex items-center gap-3 py-3.5">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {item.image && <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-[12px] text-muted-foreground">
                      ×{item.qty} · {choices[item.key]?.delivery ? "Delivery" : "Meet seller"} ·{" "}
                      {paymentLabel(choices[item.key]?.payment ?? item.payment_type)}
                    </p>
                    <button
                      onClick={() => setQty(item.key, item.qty - 1)}
                      className="mt-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-gold">
                    {formatGHS(item.unit_price * item.qty, { currency: item.currency })}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <label htmlFor="checkout-notes" className="text-[12px] font-semibold text-muted-foreground">
                Note to sellers (optional)
              </label>
              <textarea
                id="checkout-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Delivery landmarks, colour preference, best time to call…"
                className="pearl-input mt-1.5 w-full px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Total across {items.length} order{items.length === 1 ? "" : "s"}</span>
              <span className="font-display text-2xl text-foreground">{formatGHS(total)}</span>
            </div>
            <button
              onClick={placeOrders}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Placing orders…
                </>
              ) : (
                <>
                  Confirm · {formatGHS(total)}
                </>
              )}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Prices and stock are verified by the server when each order is
              created. If an item sold out or changed price, that line fails
              without touching the rest.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pearl-input mt-1.5 w-full px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
      />
    </label>
  );
}
