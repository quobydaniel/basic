// BASIC AURUM — desktop navigation (approved reference composition).
// Row 1: centred serif brand with gold flourish (+ tagline, left).
// Row 2: dark-glass nav capsule (left, gold active pill) + circular glass
// utilities (right). Discover opens the three-column mega-menu under the
// capsule. All destinations, notifications and account actions reuse the
// existing functionality. Discover page itself stays original.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Compass,
  Store,
  MessageCircle,
  Package,
  Crown,
  Search,
  Heart,
  User,
  LogOut,
  Settings,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Clock3,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Flame,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { useCategoryStats } from "@/lib/category-stats";
import { formatGHS } from "@/lib/format";
import { NotificationBell } from "@/components/NotificationBell";

type Cat = { id: string; slug: string; name: string; parent_id: string | null };

const NAV = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/discover", label: "Discover", icon: Compass, mega: true },
  { to: "/stores", label: "Stores", icon: Store },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/orders", label: "Orders", icon: Package },
];

const CAPSULE_ITEM =
  "flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors";
const CAPSULE_IDLE = `${CAPSULE_ITEM} text-foreground/80 hover:bg-white/[0.08] hover:text-foreground`;
const CAPSULE_ACTIVE = `${CAPSULE_ITEM} bg-[var(--gold)] text-[var(--gold-foreground)] shadow-[0_6px_18px_-6px_rgba(198,163,106,0.7)]`;

export function PearlHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [megaOpen, setMegaOpen] = useState(false);
  const megaRef = useRef<HTMLDivElement>(null);

  // Close the mega-menu on Escape + outside click + route change.
  useEffect(() => {
    if (!megaOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMegaOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(e.target as Node)) setMegaOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [megaOpen]);

  useEffect(() => {
    setMegaOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-gold/15 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55">
      {/* ── ROW 1 — tagline (left) + centred brand with gold flourish ── */}
      <div className="relative flex justify-center px-4 pt-3">
        <p className="absolute left-4 top-1/2 hidden -translate-y-1/2 text-[12px] tracking-wide text-muted-foreground md:left-8 md:block">
          Shop Smarter. Live Better.
        </p>
        <Link to="/" className="group inline-flex flex-col items-center">
          <span className="font-display text-[26px] font-semibold leading-none uppercase tracking-[0.35em] text-foreground transition-colors group-hover:text-gold md:text-[30px]">
            BASIC
          </span>
          <span className="mt-1.5 h-px w-44 bg-gradient-to-r from-transparent via-gold to-transparent transition-all duration-500 group-hover:w-64" />
        </Link>
      </div>

      {/* ── ROW 2 — capsule (left) + utilities (right) ── */}
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 pb-2.5 pt-1.5 md:px-8">
        <div ref={megaRef} className="relative hidden min-w-0 items-center lg:flex">
          <nav
            aria-label="Primary"
            className="aurum-capsule flex items-center gap-1 rounded-full border border-white/12 bg-white/[0.06] px-2 py-1.5 backdrop-blur-xl"
          >
            {NAV.map(({ to, label, icon: Icon, exact, mega }) => {
              const active = exact ? pathname === to : pathname.startsWith(to);
              if (mega) {
                return (
                  <div key={to} className="relative">
                    <button
                      onClick={() => setMegaOpen((v) => !v)}
                      onMouseEnter={() => setMegaOpen(true)}
                      aria-expanded={megaOpen}
                      aria-haspopup="true"
                      data-active={pathname.startsWith(to)}
                      className={pathname.startsWith(to) ? CAPSULE_ACTIVE : CAPSULE_IDLE}
                    >
                      <Icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
                      {label}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${megaOpen ? "rotate-180" : ""}`}
                        strokeWidth={1.7}
                      />
                    </button>
                    <PearlMegaDiscover open={megaOpen} onClose={() => setMegaOpen(false)} />
                  </div>
                );
              }
              return (
                <Link key={to} to={to} data-active={active} className={active ? CAPSULE_ACTIVE : CAPSULE_IDLE}>
                  <Icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
                  {label}
                </Link>
              );
            })}
            {/* Premium — crown in gold, never loud */}
            <Link to="/pricing" data-active={pathname.startsWith("/pricing")} className={CAPSULE_IDLE}>
              <Crown className="h-[15px] w-[15px] text-gold" strokeWidth={1.7} />
              <span className="text-gold">Premium</span>
            </Link>
          </nav>
        </div>

        {/* ── RIGHT — search · favorites · notifications · account ── */}
        <div className="flex shrink-0 items-center gap-2.5">
          <HeaderSearch />
          <Link
            to="/favorites"
            aria-label="Favorites"
            data-active={pathname.startsWith("/favorites")}
            className="aurum-icon-btn grid h-11 w-11 place-items-center text-foreground/90 hover:text-gold data-[active=true]:text-gold"
          >
            <Heart className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </Link>
          <div className="hidden sm:block">
            <NotificationBell variant="aurum" />
          </div>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

/* Header search — submits into the existing Discover search (?q=). */
function HeaderSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/discover", search: q.trim() ? { q: q.trim() } : {} });
        setQ("");
      }}
      role="search"
      className="relative hidden md:block"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-muted-foreground" strokeWidth={1.7} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search BASIC..."
        aria-label="Search BASIC"
        className="aurum-icon-btn h-11 w-40 rounded-full pl-10 pr-4 text-[13px] text-foreground outline-none transition-all placeholder:text-muted-foreground focus:w-56 focus:border-gold lg:w-48"
      />
    </form>
  );
}

/* Account menu — real profile data + existing destinations + sign out. */
function AccountMenu() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const profile = useQuery({
    queryKey: ["pearl-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      return (data as { full_name: string | null; avatar_url: string | null } | null) ?? null;
    },
  });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  async function signOut() {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  const name = profile.data?.full_name || user?.email?.split("@")[0] || "Account";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => (user ? setOpen((v) => !v) : navigate({ to: "/auth" }))}
        aria-label={user ? `Account — ${name}` : "Sign in"}
        aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] pl-1.5 pr-2.5 backdrop-blur transition-colors hover:border-gold/50"
      >
        {profile.data?.avatar_url ? (
          <img src={profile.data.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gild/15 text-[13px] font-bold text-gild">
            {user ? initial : <User className="h-4 w-4" strokeWidth={1.7} />}
          </span>
        )}
        <span className="hidden max-w-[110px] truncate text-[13px] font-semibold text-foreground md:block">
          {user ? name : "Sign in"}
        </span>
        {user && (
          <ChevronDown
            className={`hidden h-3.5 w-3.5 text-muted-foreground transition-transform md:block ${open ? "rotate-180" : ""}`}
            strokeWidth={1.7}
          />
        )}
      </button>

      {open && user && (
        <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-gold/25 bg-popover/95 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
          <nav className="py-1.5 text-[13px]">
            <MenuLink to="/account" icon={User} label="Profile" onGo={() => setOpen(false)} />
            <MenuLink to="/orders" icon={ShoppingBag} label="My orders" onGo={() => setOpen(false)} />
            <MenuLink to="/favorites" icon={Heart} label="Favorites" onGo={() => setOpen(false)} />
            <MenuLink to="/account" icon={Settings} label="Account settings" onGo={() => setOpen(false)} />
            <MenuLink to="/account" icon={Sparkles} label="Switch role" onGo={() => setOpen(false)} />
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2.5 border-t border-border/60 px-4 py-2.5 text-left text-foreground transition-colors hover:bg-accent hover:text-gold"
            >
              <LogOut className="h-[15px] w-[15px] text-muted-foreground" strokeWidth={1.7} />
              Sign out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon: Icon, label, onGo }: { to: string; icon: any; label: string; onGo: () => void }) {
  return (
    <Link
      to={to}
      onClick={onGo}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-foreground transition-colors hover:bg-accent hover:text-gold"
    >
      <Icon className="h-[15px] w-[15px] text-muted-foreground" strokeWidth={1.7} />
      {label}
    </Link>
  );
}

/* Discover mega-menu — three columns over dark frosted glass.
   Column 1: real categories. Column 2: real published products.
   Column 3: existing destinations only. */
function PearlMegaDiscover({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cats = useQuery({
    queryKey: ["cats"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, slug, name, parent_id").order("position");
      return (data ?? []) as Cat[];
    },
  });
  const stats = useCategoryStats();
  const trending = useQuery({
    queryKey: ["pearl-trending"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, store:stores(slug, name), product_media(url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60);
      return ((data ?? []) as any[]).filter((p) => p.product_media?.[0]?.url).slice(0, 3);
    },
    staleTime: 60_000,
  });

  // Top-level categories with live inventory, deduped (the table repeats
  // parent names across trees).
  const seen = new Set<string>();
  const categories = (cats.data ?? [])
    .filter((c) => !c.parent_id)
    .filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((c) => (stats.data?.counts ?? {})[c.id] !== undefined)
    .slice(0, 12);

  if (!open) return null;

  return (
    <div
      className="absolute left-0 top-full z-50 w-[760px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-gold/25 bg-popover/95 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      role="menu"
      aria-label="Discover menu"
    >
      <div className="grid grid-cols-[210px_1fr_200px]">
        {/* Column 1 — categories */}
        <div className="border-r border-border/60 py-3">
          <p className="flex items-center gap-2 px-4 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.8} />
            Categories
          </p>
          <ul className="max-h-[380px] overflow-y-auto">
            <li>
              <Link
                to="/discover"
                onClick={onClose}
                className="flex items-center justify-between px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent hover:text-gold"
              >
                All products
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  to="/discover"
                  search={{ category: c.slug }}
                  onClick={onClose}
                  className="flex items-center justify-between px-4 py-2 text-[13px] text-foreground/85 transition-colors hover:bg-accent hover:text-gold"
                >
                  <span className="truncate">{c.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 2 — trending picks (real products) */}
        <div className="border-r border-border/60 p-4">
          <p className="flex items-center gap-2 pb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            <Flame className="h-3.5 w-3.5" strokeWidth={1.8} />
            Trending Picks
          </p>
          {(trending.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Loading the latest finds…</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {(trending.data ?? []).map((p: any) => (
                <Link
                  key={p.id}
                  to="/s/$storeSlug/p/$productSlug"
                  params={{ storeSlug: p.store?.slug ?? "", productSlug: p.slug }}
                  onClick={onClose}
                  className="group/p overflow-hidden rounded-xl border border-gold/25 bg-card transition-all hover:border-gold/60 hover:shadow-lg"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img
                      src={p.product_media[0].url}
                      alt={p.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover/p:scale-105"
                    />
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-1 text-[12px] font-medium text-foreground">{p.title}</p>
                    <p className="mt-0.5 text-[12px] font-bold text-gold">
                      {formatGHS(p.base_price, { currency: p.currency })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Column 3 — quick access (existing destinations only) */}
        <div className="p-4">
          <p className="flex items-center gap-2 pb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
            <Zap className="h-3.5 w-3.5" strokeWidth={1.8} />
            Quick Access
          </p>
          <ul className="space-y-1">
            <QuickLink to="/stores" icon={Store} label="Popular stores" onGo={onClose} />
            <QuickLink to="/discover" icon={Clock3} label="New arrivals" onGo={onClose} />
            <QuickLink to="/discover" icon={TrendingUp} label="Trending products" onGo={onClose} />
            <QuickLink to="/favorites" icon={Heart} label="Your favorites" onGo={onClose} />
          </ul>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, onGo }: { to: string; icon: any; label: string; onGo: () => void }) {
  return (
    <li>
      <Link
        to={to}
        onClick={onGo}
        className="flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] text-foreground transition-colors hover:bg-accent hover:text-gold"
      >
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-gild/12 text-gild">
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <span className="flex-1">{label}</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>
    </li>
  );
}
