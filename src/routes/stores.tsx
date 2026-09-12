import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MapPin, Store as StoreIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Reveal } from "@/components/motion";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/stores")({
  head: () => ({
    meta: [
      { title: "Storefronts — BASIC" },
      { name: "description", content: "Every independent storefront on BASIC, in one directory." },
    ],
  }),
  component: StoresPage,
});

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  banner_url: string | null;
  area: string | null;
  city: string | null;
  region: string | null;
  plan: string | null;
};

function StoresPage() {
  const stores = useQuery({
    queryKey: ["stores-directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, slug, name, tagline, logo_url, banner_url, area, city, region, plan")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as StoreRow[];
      rows.sort((a, b) => Number(b.plan === "pro") - Number(a.plan === "pro"));
      return rows;
    },
  });

  // One lightweight pass over products to count each house's listings.
  const counts = useQuery({
    queryKey: ["stores-directory-counts"],
    enabled: !!stores.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("store_id").eq("status", "active");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const sid = (row as { store_id: string }).store_id;
        map[sid] = (map[sid] ?? 0) + 1;
      }
      return map;
    },
  });

  const rows = stores.data ?? [];
  const location = (s: StoreRow) => [s.area, s.city || s.region].filter(Boolean).join(" · ") || "Ghana";

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pt-8 md:max-w-6xl md:px-8 md:pt-12">
        <p className="mb-1.5 flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.34em] text-muted-foreground">
          <span className="h-px w-6 bg-gold/60" aria-hidden />
          <StoreIcon className="h-3.5 w-3.5" /> The houses
        </p>
        <h1 className="font-display text-4xl md:text-5xl">Storefronts</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Every independent seller on BASIC, in one directory. Walk in, look around,
          and start a conversation.
        </p>
      </div>

      <div className="mt-8 grid gap-5 px-4 pb-8 sm:grid-cols-2 md:grid-cols-3 md:px-8">
        {stores.isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />
          ))}

        {rows.map((s, i) => (
          <Reveal key={s.id} delay={(i % 3) * 80}>
            <Link
              to="/s/$storeSlug"
              params={{ storeSlug: s.slug }}
              className="group block overflow-hidden rounded-2xl border border-border bg-card transition-all duration-500 hover:border-gold/50 hover:shadow-[0_24px_60px_-24px_oklch(0.80_0.11_85/0.35)]"
            >
              {/* Banner */}
              <div className="relative h-28 overflow-hidden bg-muted">
                {s.banner_url && (
                  <img
                    src={s.banner_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover opacity-90 transition-all duration-700 group-hover:scale-105 group-hover:opacity-100"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
              </div>

              <div className="relative px-5 pb-5">
                {/* Logo rides the banner edge */}
                {s.logo_url && (
                  <img
                    src={s.logo_url}
                    alt=""
                    loading="lazy"
                    className="absolute -top-7 left-5 h-14 w-14 rounded-2xl border-2 border-card object-cover shadow-[var(--shadow-soft)]"
                  />
                )}
                <div className="pt-9">
                  <p className="flex items-center gap-2 font-display text-xl leading-tight">
                    <span className="truncate transition-colors group-hover:text-gold">{s.name}</span>
                    {s.plan === "pro" && (
                      <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gold">
                        Pro
                      </span>
                    )}
                  </p>
                  {s.tagline && <p className="mt-0.5 line-clamp-1 text-[13px] italic text-muted-foreground">{s.tagline}</p>}
                  <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {location(s)}
                    </span>
                    <span>
                      {counts.data?.[s.id] ?? "…"} piece{(counts.data?.[s.id] ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    Visit storefront <ArrowUpRight className="h-3.5 w-3.5" />
                  </p>
                </div>
              </div>
            </Link>
          </Reveal>
        ))}

        {!stores.isLoading && rows.length === 0 && (
          <p className="col-span-full py-16 text-center text-sm text-muted-foreground">
            No storefronts open yet — the first houses are being fitted out.
          </p>
        )}
      </div>
    </AppShell>
  );
}
