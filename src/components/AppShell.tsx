import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, Search, MessageCircle, Package, User, Heart, Bike, ShieldCheck, ArrowUpRight, Store, ChevronRight } from "lucide-react";
import { useSession } from "@/lib/session";
import { FloatingBuyerAssistant } from "@/components/FloatingBuyerAssistant";
import { LocationPicker } from "@/components/LocationPicker";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { useCategoryStats, rollupCount } from "@/lib/category-stats";
import { formatGHS } from "@/lib/format";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

// Obsidian — buyer tabs. Same IA as the original shell; presentation is
// after-dark luxury: icons hush to ivory, the active tab wears a gold pin.
const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Search", icon: Search },
  { to: "/chat", label: "Chats", icon: MessageCircle },
  { to: "/orders", label: "Orders", icon: Package },
  { to: "/account", label: "Account", icon: User },
] as const;

export function AppShell({
  children,
  productId,
  noFooter = false,
}: {
  children: ReactNode;
  productId?: string;
  noFooter?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Chat is an app-like surface: full-height messenger, no footer and no
  // bottom tab bar — the conversation list is the navigation there.
  const isChat = pathname.startsWith("/chat");
  const showAssistant =
    !pathname.startsWith("/chat") && !pathname.startsWith("/account");
  const context: "home" | "discover" | "product" | "orders" | "favorites" =
    pathname.startsWith("/discover") ? "discover"
    : pathname.startsWith("/s/") ? "product"
    : pathname.startsWith("/orders") ? "orders"
    : pathname.startsWith("/favorites") ? "favorites"
    : "home";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <main className={`mx-auto max-w-2xl md:max-w-6xl ${isChat ? "pb-0" : "pb-28 md:pb-16"}`}>{children}</main>
      {!isChat && !noFooter && <SiteFooter />}
      {!isChat && <BottomTabBar />}
      {showAssistant && <FloatingBuyerAssistant productId={productId} context={context} />}
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-2xl px-4 md:max-w-6xl md:px-8">
        {/* Upper masthead — brand centered, utility split left/right */}
        <div className="flex items-center justify-between py-4">
          <div className="flex flex-1 items-center gap-1">
            {/* ── PARKED — nav redesign in progress. Uncomment to re-place. ──
            <LocationPicker />
            <Link
              to="/favorites"
              className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-accent hover:text-gold"
              aria-label="Favorites"
            >
              <Heart className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </Link>
            ── end parked ── */}
            <ThemeToggle />
            <NotificationBell />
          </div>

          <Link to="/" className="group flex flex-col items-center">
            <span className="font-display text-[26px] leading-none tracking-[0.32em] text-foreground transition-colors group-hover:text-gold md:text-3xl">
              BASIC
            </span>
            <span className="mt-1.5 h-px w-16 bg-gradient-to-r from-transparent via-gold to-transparent transition-all duration-500 group-hover:w-28" />
          </Link>

          <div className="flex flex-1 items-center justify-end gap-1">
            <Link
              to="/discover"
              className="grid h-9 w-9 place-items-center rounded-full text-foreground/80 hover:bg-accent md:hidden"
              aria-label="Search"
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </Link>
            {/* ── PARKED — nav redesign in progress. Uncomment to re-place. ──
            <AccountLink />
            ── end parked ── */}
          </div>
        </div>

        {/* Lower masthead — letterspaced links with drawing gold rules */}
        <nav aria-label="Desktop" className="hidden items-center justify-center gap-10 pb-3 md:flex">
          <DesktopLink to="/" label="Home" />
          <MegaCollections />
          <DesktopLink to="/chat" label="Chat" />
          <DesktopLink to="/orders" label="Orders" />
          {/* Stores → /stores: the buyer-facing directory — browse, search
              and follow every seller storefront on BASIC. Sellers reach their
              own store via the store icon in the masthead cluster. */}
          <DesktopLink to="/stores" label="Stores" />
          <Link to="/pricing" className="gold-rule pb-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-gold transition-opacity hover:opacity-80">
            ✦ Premium
          </Link>
        </nav>
      </div>
    </header>
  );
}

function DesktopLink({ to, label }: { to: string; label: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className="gold-rule pb-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-gold"
      data-active={active}
    >
      {label}
    </Link>
  );
}

/* AccountLink — kept intact for the nav redesign; currently parked out of
   the masthead. Drop it into whichever slot the new layout gives auth. */
function AccountLink() {
  const { user } = useSession();
  return (
    <Link
      to={user ? "/account" : "/auth"}
      className="hidden items-center gap-2 rounded-full border border-border bg-transparent px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/90 transition-all hover:border-gold hover:text-gold md:flex"
    >
      <User className="h-3.5 w-3.5" strokeWidth={1.8} />
      {user ? "Account" : "Sign in"}
    </Link>
  );
}
void AccountLink;

function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 backdrop-blur-lg md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className="relative flex flex-col items-center gap-1 py-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground data-[active=true]:text-foreground"
                data-active={active}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.1 : 1.6} />
                {label}
                {active && (
                  <span className="absolute top-0 h-[2px] w-8 rounded-full bg-gradient-to-r from-transparent via-gold to-transparent" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* Obsidian footer — a quiet colophon on charcoal, gold hairlines. */
function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
        <div>
          <Link to="/" className="inline-block">
            <span className="font-display text-xl leading-none tracking-[0.32em] text-foreground">B A S I C</span>
            <span className="mt-1.5 block h-px w-14 bg-gradient-to-r from-transparent via-gold to-transparent" />
          </Link>
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Objects of consequence from Ghana's independent makers. Presented
            properly, delivered with care.
          </p>
        </div>
        <FooterCol title="House" links={[["/discover", "Discover"], ["/stores", "Stores"], ["/chat", "Conversations"], ["/orders", "Orders"], ["/favorites", "Favorites"]]} />
        <FooterCol title="Company" links={[["/about", "About BASIC"], ["/contact", "Contact us"]]} />
        <FooterCol
          title="Professionals"
          links={[["/auth?mode=sell", "Consign with us", Store], ["/rider", "Deliver with BASIC", Bike], ["/quoby", "Admin console", ShieldCheck]]}
        />
      </div>
      <div className="border-t border-border/40">
        <p className="mx-auto max-w-6xl px-4 py-4 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 md:px-8">
          © 2026 BASIC — Accra
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string, any?][] }) {
  return (
    <div>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">{title}</p>
      <ul className="space-y-2">
        {links.map(([to, label, Icon]) => (
          <li key={to}>
            <Link to={to} className="group inline-flex items-center gap-1.5 text-[13px] text-foreground/80 transition-colors hover:text-gold">
              {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-gold" />}
              {label}
              <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Collections mega-menu — Temu-style category browser: a left rail of
   departments with a Featured home view, and a right panel of circular
   category tiles. Tiles get their imagery from the newest product in each
   category (no per-category images exist), and the two best-selling
   sub-collections in view wear a HOT badge. */
function MegaCollections() {
  const [hovered, setHovered] = useState<string | null>(null); // null = Featured
  const [open, setOpen] = useState(false);
  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, slug, name, parent_id").order("position");
      return (data ?? []) as { id: string; slug: string; name: string; parent_id: string | null }[];
    },
  });
  // One products pass → cover image + listing count per category.
  const stats = useCategoryStats();
  // Real products for the mega-menu "Top picks" row: newest active listings
  // with a photo, so the panel always shows something nice per department.
  const topProducts = useQuery({
    queryKey: ["mega-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, slug, title, base_price, compare_at_price, currency, category_id, store:stores(slug, name), product_media(url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(120);
      return ((data ?? []) as any[]).filter((p) => p.product_media?.[0]?.url);
    },
    staleTime: 60_000,
  });
  const all = cats.data ?? [];
  const images = stats.data?.images ?? {};
  const counts = stats.data?.counts ?? {};
  // The categories table contains duplicate parent names — show each once.
  // Buyers only see departments with live inventory anywhere in their tree
  // (the "hide until a seller or product exists" rule); sellers keep the
  // full tree in their dashboard.
  const seenParents = new Set<string>();
  const parents = all
    .filter((c) => {
      if (c.parent_id) return false;
      const key = c.name.trim().toLowerCase();
      if (seenParents.has(key)) return false;
      seenParents.add(key);
      return true;
    })
    .filter((p) => rollupCount(p.id, all, counts) > 0);
  const subsOf = (parentId: string) =>
    all.filter((c) => c.parent_id === parentId && (counts[c.id] ?? 0) > 0);
  // Top products for a department: anything in the parent itself or one of
  // its sub-collections. Deals surface first, then newest.
  const prodsIn = (parentId: string) => {
    const ids = new Set([parentId, ...all.filter((c) => c.parent_id === parentId).map((c) => c.id)]);
    return (topProducts.data ?? [])
      .filter((p: any) => ids.has(p.category_id))
      .sort((a: any, b: any) => Number(b.compare_at_price ?? 0) - Number(a.compare_at_price ?? 0))
      .slice(0, 4);
  };
  const productCard = (p: any) => (
    <a
      key={p.id}
      href={`/s/${p.store?.slug}/p/${p.slug}`}
      onClick={() => setOpen(false)}
      className="group/p overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-gold/60"
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
        <img src={p.product_media[0].url} alt={p.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover/p:scale-105" />
      </div>
      <div className="p-2">
        <p className="line-clamp-1 text-xs font-medium">{p.title}</p>
        <div className="mt-0.5 flex items-baseline justify-between gap-1">
          <span className="text-[11px] font-semibold text-gold">{formatGHS(p.base_price, { currency: p.currency })}</span>
          {p.compare_at_price != null && (
            <span className="text-[10px] text-muted-foreground line-through">{formatGHS(p.compare_at_price, { currency: p.currency })}</span>
          )}
        </div>
        <p className="line-clamp-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{p.store?.name}</p>
      </div>
    </a>
  );
  const active = hovered ? parents.find((p) => p.id === hovered) ?? null : null;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname.startsWith("/discover");

  // Featured view: the busiest sub-collections across the whole house.
  // Capped at one row so the Trending products below stay inside the panel.
  const featured = useMemo(() => {
    return all
      .filter((c) => c.parent_id)
      .map((c) => ({ ...c, count: counts[c.id] ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [all, counts]);
  const hotIn = (rows: { id: string; count?: number }[]) =>
    new Set([...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 2).filter((r) => (r.count ?? 0) > 0).map((r) => r.id));

  const tile = (c: { id: string; slug: string; name: string; count?: number }, hot: boolean) => (
    <Link key={c.id} to="/discover" search={{ category: c.slug }} onClick={() => setOpen(false)} className="group/tile flex flex-col items-center gap-2">
      <div className="relative w-full">
        <div className="aspect-square w-full overflow-hidden rounded-full border border-border/70 bg-muted transition-transform duration-300 group-hover/tile:scale-[1.05]">
          {images[c.id] ? (
            <img src={images[c.id]} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-gold/10 font-display text-2xl text-gold">{c.name.charAt(0)}</span>
          )}
        </div>
        {hot && (
          <span className="absolute -right-1 -top-1 rounded-full bg-[var(--gold)] px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.08em] text-[var(--gold-foreground)] shadow-md">
            HOT
          </span>
        )}
      </div>
      <span className="line-clamp-2 text-center text-[11px] leading-tight text-foreground/80 transition-colors group-hover/tile:text-gold">{c.name}</span>
    </Link>
  );

  return (
    <div className="group relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        to="/discover"
        onClick={() => setOpen(false)}
        className="gold-rule pb-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground transition-colors group-hover:text-foreground data-[active=true]:text-gold"
        data-active={isActive}
      >
        Categories
      </Link>
      {/* Panel — hover opens it; any click inside closes it after navigating */}
      <div className={`absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 transition-all duration-300 ${open ? "visible opacity-100" : "invisible opacity-0"}`}>
        <div className="grid w-[920px] grid-cols-[240px_1fr] overflow-hidden rounded-2xl border border-gold/25 bg-popover shadow-[0_40px_90px_-30px_oklch(0_0_0/0.8)]">
          {/* Departments rail */}
          <ul className="max-h-[560px] overflow-y-auto border-r border-border/60 py-2">
            <li>
              <button
                onMouseEnter={() => setHovered(null)}
                onFocus={() => setHovered(null)}
                onClick={() => setHovered(null)}
                data-hovered={hovered === null}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-accent data-[hovered=true]:bg-accent data-[hovered=true]:text-gold"
              >
                Featured
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
            {parents.map((p) => (
              <li key={p.id}>
                <button
                  onMouseEnter={() => setHovered(p.id)}
                  onFocus={() => setHovered(p.id)}
                  onClick={() => setHovered(p.id)}
                  data-hovered={active?.id === p.id}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] text-foreground/85 transition-colors hover:bg-accent data-[hovered=true]:bg-accent data-[hovered=true]:font-medium data-[hovered=true]:text-gold"
                >
                  <span className="truncate">{p.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
          {/* Tile panel */}
          <div className="max-h-[560px] overflow-y-auto p-5">
            {active ? (
              <>
                <Link
                  to="/discover"
                  search={{ category: active.slug }}
                  onClick={() => setOpen(false)}
                  className="mb-4 inline-flex items-center gap-1.5 font-display text-lg text-foreground transition-colors hover:text-gold"
                >
                  All {active.name} <ArrowUpRight className="h-4 w-4 text-gold" />
                </Link>
                {subsOf(active.id).length > 0 && (
                  <div className="grid grid-cols-5 gap-x-4 gap-y-4">
                    {subsOf(active.id)
                      .map((c) => ({ ...c, count: counts[c.id] ?? 0 }))
                      .sort((a, b) => b.count - a.count)
                      .map((c) => tile(c, hotIn(subsOf(active.id)).has(c.id)))}
                  </div>
                )}
                {prodsIn(active.id).length > 0 && (
                  <>
                    <p className={`flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground ${subsOf(active.id).length > 0 ? "mt-5" : "mb-3"}`}>
                      <span className="h-px w-5 bg-gold/60" /> Top picks in {active.name}
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {prodsIn(active.id).map(productCard)}
                    </div>
                  </>
                )}
                {subsOf(active.id).length === 0 && prodsIn(active.id).length === 0 && (
                  <p className="text-sm text-muted-foreground">Everything in {active.name} lives on one shelf —</p>
                )}
              </>
            ) : (
              <>
                <p className="mb-4 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="h-px w-5 bg-gold/60" /> Featured · what Ghana is buying
                </p>
                <div className="grid grid-cols-5 gap-x-4 gap-y-4">
                  {featured.map((c) => tile(c, hotIn(featured).has(c.id)))}
                </div>
                {(topProducts.data ?? []).length > 0 && (
                  <>
                    <p className="mb-3 mt-5 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      <span className="h-px w-5 bg-gold/60" /> Trending now
                    </p>
                    <div className="grid grid-cols-4 gap-3">
                      {(topProducts.data ?? []).slice(0, 4).map(productCard)}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
