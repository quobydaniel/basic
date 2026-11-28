import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useCart, setQty, removeFromCart, cartCount, cartTotal } from "@/lib/cart";
import { formatGHS } from "@/lib/format";

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

/** Buyer cart — grouped by store so the one-order-per-item checkout reads
    honestly: every line becomes its own order through place_order. */
function CartPage() {
  const items = useCart();
  const count = cartCount();
  const total = cartTotal();

  const byStore = new Map<string, typeof items>();
  for (const item of items) {
    const group = byStore.get(item.store_id) ?? [];
    group.push(item);
    byStore.set(item.store_id, group);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-6 md:max-w-4xl md:px-8 md:py-10">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl md:text-4xl">Your cart</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {count === 0
                ? "Nothing here yet"
                : `${count} item${count === 1 ? "" : "s"} from ${byStore.size} store${byStore.size === 1 ? "" : "s"}`}
            </p>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="pearl-card flex flex-col items-center gap-4 px-6 py-14 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-gild/12 text-gild">
              <ShoppingBag className="h-7 w-7" strokeWidth={1.6} />
            </span>
            <div>
              <p className="font-display text-xl">Your cart is empty</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Discover Ghana-made finds and add them here.
              </p>
            </div>
            <Link
              to="/discover"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start shopping <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {[...byStore.values()].map((group) => (
              <section key={group[0].store_id} className="pearl-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <Link
                    to="/s/$storeSlug"
                    params={{ storeSlug: group[0].store_slug }}
                    className="text-sm font-semibold text-foreground hover:text-gold"
                  >
                    {group[0].store_name}
                  </Link>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Orders are created per item
                  </span>
                </div>
                <ul className="divide-y divide-border">
                  {group.map((item) => (
                    <li key={item.key} className="flex gap-3 px-4 py-4">
                      <Link
                        to="/s/$storeSlug/p/$productSlug"
                        params={{ storeSlug: item.store_slug, productSlug: item.product_slug }}
                        className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted"
                      >
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/s/$storeSlug/p/$productSlug"
                          params={{ storeSlug: item.store_slug, productSlug: item.product_slug }}
                          className="line-clamp-2 text-sm font-medium text-foreground hover:text-gold"
                        >
                          {item.title}
                          {item.variant_title ? (
                            <span className="text-muted-foreground"> · {item.variant_title}</span>
                          ) : null}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {item.delivery_available ? "Delivery available" : "Meet seller / pickup"}
                          {item.payment_type ? ` · ${paymentLabel(item.payment_type)}` : ""}
                        </p>
                        <div className="mt-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center rounded-full border border-border">
                            <button
                              onClick={() => setQty(item.key, item.qty - 1)}
                              aria-label={`Reduce ${item.title} quantity`}
                              className="grid h-8 w-8 place-items-center rounded-l-full text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-8 text-center text-sm font-semibold">
                              {item.qty}
                            </span>
                            <button
                              onClick={() => setQty(item.key, item.qty + 1)}
                              aria-label={`Increase ${item.title} quantity`}
                              className="grid h-8 w-8 place-items-center rounded-r-full text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-sm font-bold text-gold">
                            {formatGHS(item.unit_price * item.qty, { currency: item.currency })}
                          </p>
                          <button
                            onClick={() => removeFromCart(item.key)}
                            aria-label={`Remove ${item.title} from cart`}
                            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {/* Summary + checkout */}
            <div className="pearl-card p-5">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-semibold text-foreground">{formatGHS(total)}</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                Delivery and payment terms follow each seller's listing. Checkout creates one order
                per item through BASIC's server-side ordering — prices and stock are verified by the
                server at confirmation.
              </p>
              <Link
                to="/checkout"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Checkout · {formatGHS(total)} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function paymentLabel(term: string | null): string {
  switch (term) {
    case "on_delivery":
      return "Pay on delivery";
    case "escrow":
      return "Escrow";
    case "before_delivery":
      return "Pay before delivery";
    default:
      return "Settled with seller";
  }
}
