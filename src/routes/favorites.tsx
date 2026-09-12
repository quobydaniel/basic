import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

type FavProduct = {
  id: string;
  slug: string;
  title: string;
  base_price: number;
  currency: string;
  store: { slug: string; name: string; area: string | null; city: string | null } | null;
  product_media: { url: string }[];
};

export const Route = createFileRoute("/favorites")({
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user, loading } = useSession();

  const favorites = useQuery({
    queryKey: ["favorites", "list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: favs, error } = await supabase
        .from("favorites")
        .select("product_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (favs ?? []).map((f: { product_id: string }) => f.product_id);
      if (ids.length === 0) return [] as FavProduct[];
      const { data, error: pErr } = await supabase
        .from("products")
        .select("id, slug, title, base_price, currency, store:stores(slug, name, area, city), product_media(url)")
        .in("id", ids)
        .eq("status", "active");
      if (pErr) throw pErr;
      // preserve favorites order
      const byId = new Map((data ?? []).map((p: FavProduct) => [p.id, p]));
      return ids.map((id: string) => byId.get(id)).filter((p): p is FavProduct => !!p);
    },
  });

  return (
    <AppShell>
      <div className="p-4 md:p-8">
        <h1 className="font-display text-2xl">Favorites</h1>
        <p className="mt-1 text-sm text-muted-foreground">Saved products to chat about later.</p>

        {loading ? null : !user && (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
            <Heart className="mx-auto h-8 w-8 text-[var(--gold)]" />
            <p className="mt-3 text-sm">Sign in to save your favorite products.</p>
            <Link
              to="/auth"
              className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        )}

        {user && favorites.isLoading && (
          <p className="mt-8 text-sm text-muted-foreground">Loading favorites…</p>
        )}
        {user && favorites.error && (
          <p className="mt-8 text-sm text-destructive">{(favorites.error as Error).message}</p>
        )}

        {user && favorites.data && favorites.data.length === 0 && (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing saved yet — tap the heart on any product to keep it here.
            </p>
          </div>
        )}

        {user && favorites.data && favorites.data.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {favorites.data.map((p) => (
              <Link
                key={p.id}
                to="/s/$storeSlug/p/$productSlug"
                params={{ storeSlug: p.store?.slug ?? "", productSlug: p.slug }}
                className="group overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  {p.product_media?.[0] ? (
                    <img src={p.product_media[0].url} alt={p.title} className="h-full w-full object-cover transition group-hover:scale-105" />
                  ) : null}
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.store?.name}
                    {p.store?.area ? ` · ${p.store.area}` : p.store?.city ? ` · ${p.store.city}` : ""}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {p.currency} {Number(p.base_price).toFixed(0)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
