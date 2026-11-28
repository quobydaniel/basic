import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Compass, Store as StoreIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/following")({
  head: () => ({ meta: [{ title: "Followed stores — BASIC" }] }),
  component: FollowingPage,
});

// store_followers was created outside the migration files (dashboard-first),
// so the generated types don't know it yet — the storefront uses the same
// `as any` cast. Confirmed columns: id, store_id, follower_id.
function FollowingPage() {
  const { user } = useSession();
  const qc = useQueryClient();

  const follows = useQuery({
    queryKey: ["store-followers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("store_followers")
        .select("id, store_id")
        .eq("follower_id", user!.id);
      if (error) throw error;
      return data as { id: string; store_id: string }[];
    },
  });

  const stores = useQuery({
    queryKey: ["followed-stores", (follows.data ?? []).map((f) => f.store_id).join(",")],
    enabled: (follows.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (follows.data ?? []).map((f) => f.store_id);
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, slug, plan, status")
        .in("id", ids);
      if (error) throw error;
      // Keep the follow order (most recently followed first is unknown without
      // created_at; alphabetical is honest and stable).
      return (
        data as { id: string; name: string; slug: string; plan: string; status: string }[]
      ).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const unfollow = useMutation({
    mutationFn: async (store_id: string) => {
      const follow = (follows.data ?? []).find((f) => f.store_id === store_id);
      if (!follow) throw new Error("Follow record missing");
      const { error } = await (supabase as any)
        .from("store_followers")
        .delete()
        .eq("id", follow.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unfollowed");
      qc.invalidateQueries({ queryKey: ["store-followers"] });
      qc.invalidateQueries({ queryKey: ["followed-stores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
          <StoreIcon className="h-8 w-8 text-muted-foreground" />
          <h1 className="font-display text-2xl">Followed stores</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Sign in to keep the businesses you love one tap away.
          </p>
          <Link
            to="/auth"
            className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  const rows = stores.data ?? [];

  return (
    <AppShell>
      <div className="px-4 pt-4 pb-16 md:px-8 md:pt-8">
        <h1 className="font-display text-3xl">Followed stores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The storefronts you follow. Seller stories surface on their storefront profile ring.
        </p>

        {follows.isLoading && (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        )}
        {follows.error && (
          <p className="py-12 text-center text-sm text-destructive">
            Failed to load: {(follows.error as Error).message}
          </p>
        )}

        {rows.length === 0 && !follows.isLoading && (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-6 py-16 text-center">
            <Compass className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium">You're not following any stores yet.</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Find a business you like and hit Follow on its storefront — it will appear here.
            </p>
            <Link to="/stores" className="mt-2 text-sm font-medium text-gold hover:underline">
              Browse stores →
            </Link>
          </div>
        )}

        {rows.length > 0 && (
          <ul className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
            {rows.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 border-b px-4 py-3.5 last:border-b-0 md:px-5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <StoreIcon className="h-4 w-4 shrink-0 text-gold" />
                    <span className="truncate">{s.name}</span>
                    {s.plan === "pro" && (
                      <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold">
                        Pro
                      </span>
                    )}
                    {s.status !== "active" && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                        {s.status}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">/s/{s.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Link
                    to="/s/$storeSlug"
                    params={{ storeSlug: s.slug }}
                    className="rounded-full border border-gold/40 bg-gold/10 px-3.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/20"
                  >
                    Visit
                  </Link>
                  <button
                    onClick={() => unfollow.mutate(s.id)}
                    disabled={unfollow.isPending}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-50"
                  >
                    Unfollow
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
