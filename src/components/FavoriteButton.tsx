// FavoriteButton — optimistic toggle on the favorites table. Hidden when
// signed out (button navigates to /auth instead via `requireAuth`).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";

async function fetchFavoriteIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from("favorites").select("product_id");
  if (error) throw error;
  return new Set((data ?? []).map((r: { product_id: string }) => r.product_id));
}

export function useFavoriteIds() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["favorites", "ids", user?.id],
    queryFn: fetchFavoriteIds,
    enabled: !!user,
    staleTime: 60_000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: async ({ productId, favorited }: { productId: string; favorited: boolean }) => {
      if (favorited) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("product_id", productId);
        if (error) throw error;
      } else {
        if (!user) throw new Error("Sign in to save favorites");
        const { error } = await supabase
          .from("favorites")
          .insert({ product_id: productId, user_id: user.id });
        if (error) throw error;
      }
    },
    onMutate: async ({ productId, favorited }) => {
      await qc.cancelQueries({ queryKey: ["favorites", "ids"] });
      const prev = qc.getQueryData<Set<string>>(["favorites", "ids", user?.id]);
      const next = new Set(prev ?? []);
      if (favorited) next.delete(productId);
      else next.add(productId);
      qc.setQueryData(["favorites", "ids", user?.id], next);
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["favorites", "ids", user?.id], ctx.prev);
      toast.error(e.message.includes("row-level") ? "Sign in to save favorites" : e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}

export function FavoriteButton({
  productId,
  size = "md",
}: {
  productId: string;
  size?: "sm" | "md";
}) {
  const { data: ids } = useFavoriteIds();
  const toggle = useToggleFavorite();
  const favorited = ids?.has(productId) ?? false;
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate({ productId, favorited });
      }}
      className="grid place-items-center rounded-full bg-background/80 p-1.5 backdrop-blur transition hover:scale-110"
    >
      <Heart
        className={`${dim} transition ${favorited ? "fill-[var(--gold)] text-[var(--gold)]" : "text-foreground/70"}`}
      />
    </button>
  );
}
