import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Loader2,
  MapPin,
  Truck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { formatGHS } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { placeOrder } from "@/services/orders";
import { paymentLabel } from "@/lib/order-terms";

export const Route = createFileRoute("/order/$storeSlug/$productSlug")({
  validateSearch: (search: Record<string, unknown>) => ({
    v: typeof search.v === "string" ? search.v : undefined,
    qty: typeof search.qty === "number" ? Math.max(1, Math.min(search.qty, 99)) : undefined,
  }),
  component: DirectOrderPage,
});

/* PAGE 7 — Direct Order Initiation. No shopping cart: the buyer lands here
   from a product's BUY NOW with the item, variation and quantity already in
   hand, confirms buyer + delivery info, reviews, and the order is created
   through the server-authoritative `place_order` RPC. Where the backend
   needs the seller's confirmation (AI proposal flow), the pending status is
   stated plainly on the confirmation screen. */
function DirectOrderPage() {
  const { storeSlug, productSlug } = Route.useParams();
  const { v: preselectedVariant, qty: preselectedQty } = Route.useSearch();
  const { user } = useSession();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [variantTitle, setVariantTitle] = useState<string | null>(preselectedVariant ?? null);
  const [qty, setQty] = useState(preselectedQty ?? 1);
  const [wantsDelivery, setWantsDelivery] = useState<boolean | null>(null);
  const [address, setAddress] = useState(() => {
    try {
      const raw = localStorage.getItem("basic:checkout:address");
      return raw
        ? (JSON.parse(raw) as Address)
        : { full_name: "", phone: "", region: "", city: "", area: "", street: "" };
    } catch {
      return { full_name: "", phone: "", region: "", city: "", area: "", street: "" };
    }
  });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; orderNumber: string; total: number; duplicate: boolean }
    | { ok: false; error: string }
    | null
  >(null);

  const product = useQuery({
    queryKey: ["order-product", storeSlug, productSlug],
    queryFn: async () => {
      const { data: store, error: se } = await supabase
        .from("stores")
        .select("id, slug, name, currency")
        .eq("slug", storeSlug)
        .eq("status", "active")
        .maybeSingle();
      if (se) throw se;
      if (!store) throw notFound();
      const { data: p, error: pe } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, delivery_available, payment_type, product_media(url), product_variants(id, title, price, inventory_qty)")
        .eq("store_id", store.id)
        .eq("slug", productSlug)
        .eq("status", "active")
        .maybeSingle();
      if (pe) throw pe;
      if (!p) throw notFound();
      return { store, product: p };
    },
  });

  const store = product.data?.store;
  const item = product.data?.product;
  const variants = (item?.product_variants ?? []) as {
    id: string;
    title: string;
    price: number | null;
    inventory_qty: number | null;
  }[];
  const currentVariant = variants.find((x) => x.title === variantTitle) ?? variants[0];
  const unitPrice = currentVariant?.price ?? item?.base_price ?? 0;
  const stockQty = variants.length
    ? variants.reduce((s, v) => s + Number(v.inventory_qty ?? 0), 0)
    : Number((item as any)?.inventory_qty ?? 10);
  const maxQty = Math.max(1, Math.min(stockQty || 99, 99));
  const currency = item?.currency ?? store?.currency ?? "GHS";
  const deliveryAvailable = (item as any)?.delivery_available === true;
  const paymentTerm = (item as any)?.payment_type ?? null;
  // Delivery defaults to the seller's terms until the buyer chooses.
  const deliver = wantsDelivery ?? deliveryAvailable;

  type Address = {
    full_name: string;
    phone: string;
    region: string;
    city: string;
    area: string;
    street: string;
  };

  function saveAddress(next: Address) {
    setAddress(next);
    try {
      localStorage.setItem("basic:checkout:address", JSON.stringify(next));
    } catch {
      /* private mode */
    }
  }

  function addressValid(): boolean {
    if (!address.full_name.trim() || !address.phone.trim()) return false;
    if (deliver && (!address.region.trim() || !address.city.trim())) return false;
    return true;
  }

  function deliveryText(): string {
    const where = [address.area, address.city, address.region].filter(Boolean).join(", ");
    return `Deliver to ${address.full_name.trim()} · ${address.phone.trim()}${where ? ` · ${where}` : ""}${address.street.trim() ? ` · ${address.street.trim()}` : ""}`;
  }

  async function confirmOrder() {
    if (!user || !store || !item || busy) return;
    setBusy(true);
    try {
      const res = await placeOrder({
        store_id: store.id,
        product_id: item.id,
        quantity: qty,
        unit_price: unitPrice,
        variant_title: currentVariant?.title ?? null,
        delivery: deliver ? deliveryText() : null,
        payment: paymentTerm,
        notes: notes.trim() || null,
        source: "buy_now",
        idempotency_key: crypto.randomUUID(),
      });
      setResult({
        ok: true,
        orderNumber: res.order_number,
        total: res.total,
        duplicate: res.duplicate,
      });
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Order could not be placed" });
    } finally {
      setBusy(false);
    }
  }

  /* ── Confirmation / pending status ── */
  if (result) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
          <div className="pearl-card p-6 text-center md:p-10">
            {result.ok ? (
              <>
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/12 text-success">
                  <CheckCircle2 className="h-8 w-8" strokeWidth={1.6} />
                </span>
                <h1 className="mt-4 font-display text-3xl">
                  {result.duplicate ? "Order already placed" : "Order placed"}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Order {result.orderNumber} · {formatGHS(result.total, { currency })} — the seller
                  will confirm shortly. You'll see updates in Orders and Chats.
                </p>
              </>
            ) : (
              <>
                <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-destructive/10 text-destructive">
                  <CircleAlert className="h-8 w-8" strokeWidth={1.6} />
                </span>
                <h1 className="mt-4 font-display text-3xl">Order didn't go through</h1>
                <p className="mt-1.5 text-sm text-destructive">{result.error}</p>
                <button
                  onClick={() => setResult(null)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Back to review
                </button>
              </>
            )}
            {result.ok && (
              <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                  to="/orders"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Track my order <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/s/$storeSlug"
                  params={{ storeSlug }}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground hover:border-gold hover:text-gold"
                >
                  Back to store
                </Link>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  /* ── Loading / missing ── */
  if (product.isLoading) {
    return (
      <AppShell>
        <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }
  if (!store || !item) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 text-center md:px-8">
          <p className="font-display text-2xl">Product unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">It may have sold out or been archived.</p>
          <Link
            to="/discover"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Discover products <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </AppShell>
    );
  }

  const STEPS = ["Item", "Delivery", "Review"] as const;
  const total = unitPrice * qty;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <button
          onClick={() => (step === 0 ? navigate({ to: "/s/$storeSlug/p/$productSlug", params: { storeSlug, productSlug } }) : setStep((s) => Math.max(0, s - 1)))}
          className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {step === 0 ? "Back to product" : STEPS[step - 1]}
        </button>
        <h1 className="font-display text-3xl md:text-4xl">Place your order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Direct order from <Link to="/s/$storeSlug" params={{ storeSlug }} className="font-medium text-foreground hover:text-gold">{store.name}</Link> — no basket, one item, one order.
        </p>

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

        {/* ── STEP 1 — confirm item, variation, quantity ── */}
        {step === 0 && (
          <section className="pearl-card mt-6 p-5 md:p-6">
            <div className="flex gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                {item.product_media?.[0]?.url && (
                  <img src={item.product_media[0].url} alt={item.title} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-display text-lg leading-snug">{item.title}</p>
                <p className="mt-0.5 text-sm font-bold text-gold">{formatGHS(unitPrice, { currency })}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {stockQty === 0 ? "Sold out" : stockQty <= 5 ? `Only ${stockQty} left` : "In stock"}
                </p>
              </div>
            </div>

            {variants.length > 1 && (
              <div className="mt-4">
                <p className="text-[12px] font-semibold text-muted-foreground">Variation</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVariantTitle(v.title)}
                      data-active={currentVariant?.id === v.id}
                      className="rounded-full border border-border px-4 py-1.5 text-sm data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                    >
                      {v.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-accent px-4 py-3">
              <div>
                <p className="text-[12px] text-muted-foreground">Quantity</p>
                <div className="mt-1 flex items-center rounded-full border border-border bg-card">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    aria-label="Reduce quantity"
                    className="grid h-8 w-8 place-items-center rounded-l-full text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    −
                  </button>
                  <span className="w-9 text-center text-sm font-semibold">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    aria-label="Increase quantity"
                    className="grid h-8 w-8 place-items-center rounded-r-full text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="font-display text-2xl">{formatGHS(total, { currency })}</p>
            </div>

            <p className="mt-3 text-[12px] text-muted-foreground">
              Payment: {paymentLabel(paymentTerm)} · {deliveryAvailable ? "Delivery available" : "Meet seller / pickup"}
            </p>

            {!user ? (
              <Link
                to="/auth"
                search={{ mode: "shop" as const }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Sign in to continue <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                onClick={() => setStep(1)}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </section>
        )}

        {/* ── STEP 2 — buyer info + delivery ── */}
        {step === 1 && (
          <section className="pearl-card mt-6 p-5 md:p-6">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4 text-gold" /> How should it reach you?
            </p>
            {deliveryAvailable ? (
              <div className="mt-3 flex rounded-full border border-border p-0.5">
                {[
                  { label: "Delivery", value: true },
                  { label: "Meet seller / pickup", value: false },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setWantsDelivery(opt.value)}
                    data-active={deliver === opt.value}
                    className="flex-1 rounded-full px-3 py-2 text-[13px] font-semibold text-muted-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-accent px-3.5 py-2.5 text-[13px] text-muted-foreground">
                This seller doesn't offer delivery — you'll meet or pick up.
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Full name" value={address.full_name} onChange={(v2) => saveAddress({ ...address, full_name: v2 })} placeholder="Ama Mensah" />
              <Field label="Phone" value={address.phone} onChange={(v2) => saveAddress({ ...address, phone: v2 })} placeholder="024 000 0000" type="tel" />
              {deliver && (
                <>
                  <Field label="Region" value={address.region} onChange={(v2) => saveAddress({ ...address, region: v2 })} placeholder="Greater Accra" />
                  <Field label="City / Town" value={address.city} onChange={(v2) => saveAddress({ ...address, city: v2 })} placeholder="Accra" />
                  <Field label="Area" value={address.area} onChange={(v2) => saveAddress({ ...address, area: v2 })} placeholder="Osu" />
                  <Field label="Street / landmark" value={address.street} onChange={(v2) => saveAddress({ ...address, street: v2 })} placeholder="Oxford Street" />
                </>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor="order-notes" className="text-[12px] font-semibold text-muted-foreground">
                Note to the seller (optional)
              </label>
              <textarea
                id="order-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Colour preference, best time to call…"
                className="pearl-input mt-1.5 w-full px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
            <button
              onClick={() => {
                if (!addressValid()) {
                  toast.error(deliver ? "Name, phone, region and city are required" : "Name and phone are required");
                  return;
                }
                setStep(2);
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Review order <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        )}

        {/* ── STEP 3 — review + confirm ── */}
        {step === 2 && (
          <section className="pearl-card mt-6 p-5 md:p-6">
            <p className="text-sm font-semibold">Review</p>
            <ul className="mt-3 space-y-2 text-[13px]">
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Item</span>
                <span className="text-right font-medium">
                  {item.title}
                  {currentVariant && variants.length > 1 ? ` · ${currentVariant.title}` : ""} × {qty}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Fulfilment</span>
                <span className="text-right font-medium">
                  {deliver
                    ? `Delivery — ${[address.area, address.city].filter(Boolean).join(", ")}`
                    : "Meet seller / pickup"}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Contact</span>
                <span className="text-right font-medium">{address.full_name} · {address.phone}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted-foreground">Payment</span>
                <span className="text-right font-medium">{paymentLabel(paymentTerm)}</span>
              </li>
            </ul>
            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-display text-2xl">{formatGHS(total, { currency })}</span>
            </div>
            <button
              onClick={confirmOrder}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Placing order…
                </>
              ) : (
                <>Confirm order</>
              )}
            </button>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              Prices and stock are verified by the server when the order is
              created. Sellers confirm orders before fulfilment — you'll see the
              status move in Orders.
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
