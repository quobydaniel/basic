// BASIC cart — a frontend collection, persisted to localStorage. Orders are
// NOT created here: checkout submits each line through the authoritative
// `place_order` RPC (server-priced, floor-checked, stock-locked, idempotent),
// the same server contract the AI concierge uses. Negotiable listings are
// chat-only by design — the seller sets the price in conversation.

import { useSyncExternalStore } from "react";

export type CartItem = {
  /** Stable identity: product + chosen variant. */
  key: string;
  product_id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  product_slug: string;
  title: string;
  image: string | null;
  unit_price: number;
  currency: string;
  /** 1–99 — the same bound place_order enforces server-side. */
  qty: number;
  variant_title: string | null;
  /** Per-product seller terms (products.delivery_available / payment_type). */
  delivery_available: boolean | null;
  payment_type: string | null;
};

const KEY = "basic:cart:v1";
const MAX_QTY = 99;

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

let items: CartItem[] = read();
const listeners = new Set<() => void>();

function emit() {
  items = [...items];
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* private mode — the in-memory cart still works for the session */
  }
  listeners.forEach((l) => l());
}

// Cross-tab sync: another tab editing the cart updates this one instantly.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue !== JSON.stringify(items)) {
      try {
        items = e.newValue ? (JSON.parse(e.newValue) as CartItem[]) : [];
        listeners.forEach((l) => l());
      } catch {
        /* ignore malformed storage writes */
      }
    }
  });
}

export function addToCart(item: Omit<CartItem, "key"> & { key?: string }) {
  const key = item.key ?? `${item.product_id}::${item.variant_title ?? ""}`;
  const existing = items.find((i) => i.key === key);
  if (existing) {
    setQty(key, Math.min(existing.qty + item.qty, MAX_QTY));
    return;
  }
  items = [...items, { ...item, key, qty: Math.max(1, Math.min(item.qty, MAX_QTY)) }];
  emit();
}

export function setQty(key: string, qty: number) {
  if (qty < 1) return removeFromCart(key);
  items = items.map((i) => (i.key === key ? { ...i, qty: Math.min(qty, MAX_QTY) } : i));
  emit();
}

export function removeFromCart(key: string) {
  items = items.filter((i) => i.key !== key);
  emit();
}

export function clearCartKeys(keys: string[]) {
  const drop = new Set(keys);
  items = items.filter((i) => !drop.has(i.key));
  emit();
}

export function clearCart() {
  items = [];
  emit();
}

export function cartCount(): number {
  return items.reduce((s, i) => s + i.qty, 0);
}

export function cartTotal(): number {
  return items.reduce((s, i) => s + i.unit_price * i.qty, 0);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return items;
}

/** Reactive cart state — re-renders on any cart mutation, in any tab. */
export function useCart() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
