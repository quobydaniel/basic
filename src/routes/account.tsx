import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Bike, ChevronRight, Gem, Heart, LogOut, MessageCircle, Package, Sparkles, Store as StoreIcon, User } from "lucide-react";
import { AppShell, SiteFooter } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — BASIC" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, phone, avatar_url").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const roles = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      return (data ?? []).map((r: { role: string }) => r.role);
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (profile.data) { setFullName(profile.data.full_name ?? ""); setPhone(profile.data.phone ?? ""); }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").upsert({ id: user!.id, full_name: fullName, phone });
      if (error) throw error;
    },
    onSuccess: () => { setDirty(false); toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/", replace: true });
  }

  const isSeller = (roles.data ?? []).includes("seller") || (roles.data ?? []).includes("admin");
  const isRider = (roles.data ?? []).includes("rider");

  const myStore = useQuery({
    queryKey: ["my-store-plan", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("slug, name, plan").eq("owner_id", user!.id).maybeSingle();
      return (data ?? null) as { slug: string; name: string; plan: string | null } | null;
    },
  });
  const isProSeller = myStore.data?.plan === "pro";

  const initials = (profile.data?.full_name || user?.email || "?")
    .split(/[\s@.]+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const quickTiles = [
    { to: "/favorites", icon: Heart, label: "Favorites", hint: "Saved products" },
    { to: "/orders", icon: Package, label: "Orders", hint: "Track deliveries" },
    { to: "/chat", icon: MessageCircle, label: "Chats", hint: "Conversations" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pt-6 md:max-w-3xl md:px-8 md:pt-10">
        {loading ? null : !user ? (
          <div className="mt-10 rounded-3xl border border-border bg-card p-8 text-center">
            <p className="font-display text-2xl">Sign in to BASIC</p>
            <p className="mt-1 text-sm text-muted-foreground">Save favorites, track orders, and open your own storefront.</p>
            <Link to="/auth" className="mt-5 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              Sign in or create account
            </Link>
          </div>
        ) : (
          <>
            {/* ── Profile hero ── */}
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-gold/80 to-gold/40 font-display text-xl text-[var(--gold-foreground)] ring-2 ring-gold/40">
                {profile.data?.avatar_url ? <img src={profile.data.avatar_url} alt="" className="h-full w-full object-cover" /> : initials || <User className="h-7 w-7" />}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-display text-2xl leading-tight">{profile.data?.full_name || user.email}</h1>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
              <button
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-red-500/50 hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
            {(roles.data ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(roles.data ?? []).map((r) => (
                  <span key={r} className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                    {r}
                  </span>
                ))}
              </div>
            )}

            {/* ── Quick access tiles ── */}
            <p className="mb-3 mt-8 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              <span className="h-px w-5 bg-gold/60" /> Quick access
            </p>
            <div className="grid grid-cols-3 gap-3">
              {quickTiles.map((t) => (
                <Link key={t.to} to={t.to} className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-5 text-center transition-colors hover:border-gold/50">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-gold/12 text-gold transition-transform group-hover:scale-110">
                    <t.icon className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
                  </span>
                </Link>
              ))}
            </div>

            {/* ── Premium — plan-aware banner ── */}
            <p className="mb-3 mt-8 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              <span className="h-px w-5 bg-gold/60" /> Premium
            </p>
            {isSeller ? (
              <div className="overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/15 via-card to-card">
                <div className="flex items-start gap-3 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold"><Gem className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    {isProSeller ? (
                      <>
                        <p className="flex flex-wrap items-center gap-2 font-display text-base">
                          Pro seller <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">Active</span>
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {myStore.data?.name ?? "Your store"} carries the full AI toolkit — listing writer, reply drafts, store assistant, theming.
                        </p>
                        <Link to="/dashboard" className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gold hover:underline">
                          Open dashboard <ChevronRight className="h-3 w-3" />
                        </Link>
                      </>
                    ) : (
                      <>
                        <p className="flex flex-wrap items-center gap-2 font-display text-base">
                          Pro seller <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Free plan</span>
                        </p>
                        <ul className="mt-1.5 grid gap-1 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
                          <li>✦ AI listing writer</li>
                          <li>✦ AI reply drafts in chat</li>
                          <li>✦ 24/7 store AI assistant</li>
                          <li>✦ Featured placement</li>
                        </ul>
                        <Link to="/pricing" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gold-foreground transition-shadow hover:shadow-[0_0_24px_-6px_var(--gold)]">
                          Upgrade to Pro <ChevronRight className="h-3 w-3" />
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/15 via-card to-card">
                <div className="flex items-start gap-3 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold"><Gem className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base">BASIC Premium <span className="ml-1 rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">For buyers</span></p>
                    <ul className="mt-1.5 grid gap-1 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
                      <li>✦ Price-drop alerts on saved items</li>
                      <li>✦ AI assistant remembers your taste</li>
                      <li>✦ Early access to Pro store drops</li>
                      <li>✦ 5% back in BASIC credits</li>
                    </ul>
                    <Link to="/pricing" className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gold-foreground transition-shadow hover:shadow-[0_0_24px_-6px_var(--gold)]">
                      Go Premium <ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* ── Workspace ── */}
            {(isSeller || isRider) && (
              <>
                <p className="mb-3 mt-8 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="h-px w-5 bg-gold/60" /> Workspace
                </p>
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  {isSeller && <Row to="/dashboard" icon={<StoreIcon className="h-4 w-4" />} label="Seller dashboard" hint="Your stores & orders" />}
                  {isRider && <Row to="/rider" icon={<Bike className="h-4 w-4" />} label="Rider app" hint="Delivery tasks" />}
                </div>
              </>
            )}
            {!isSeller && (
              <Link to="/auth" search={{ mode: "sell" as const }} className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3.5 text-sm transition-colors hover:border-gold/50">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"><StoreIcon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block">Open a storefront</span>
                  <span className="block text-xs text-muted-foreground">Sell on BASIC — free to launch</span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )}

            {/* ── Your details ── */}
            <p className="mb-3 mt-8 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              <span className="h-px w-5 bg-gold/60" /> Your details
            </p>
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Full name</span>
                  <input
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setDirty(true); }}
                    placeholder="Ama Boateng"
                    className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-gold/60"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Phone</span>
                  <input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
                    placeholder="+233 …"
                    className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-gold/60"
                  />
                </label>
              </div>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending || !dirty}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" /> {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>

            <button
              onClick={signOut}
              className="mb-6 mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-400"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </>
        )}
      </div>

      {/* The site footer lives here and ONLY here — Account is the house-keeping
          page; every other surface stays content-first (Jiji/Temu pattern). */}
      <SiteFooter />
    </AppShell>
  );
}

function Row({ to, icon, label, hint }: { to: any; icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 text-sm last:border-b-0 hover:bg-accent">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
