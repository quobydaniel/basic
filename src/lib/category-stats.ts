// Active-listing stats per category, shared by every category browser
// (mega menu, discover pills). Powers the "hide it until something exists"
// rule: categories with zero active products stay invisible to buyers while
// sellers still see the full tree in their dashboard.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCategoryStats() {
  return useQuery({
    queryKey: ["category-product-stats"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("category_id, product_media(url)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(300);
      const images: Record<string, string> = {};
      const counts: Record<string, number> = {};
      for (const p of (data ?? []) as any[]) {
        if (!p.category_id) continue;
        counts[p.category_id] = (counts[p.category_id] ?? 0) + 1;
        if (!images[p.category_id] && p.product_media?.[0]?.url) images[p.category_id] = p.product_media[0].url;
      }
      return { counts, images };
    },
  });
}

// Active listings for a category including everything filed under its
// sub-collections.
export function rollupCount(
  catId: string,
  all: { id: string; parent_id: string | null }[],
  counts: Record<string, number>,
): number {
  let total = counts[catId] ?? 0;
  for (const c of all) {
    if (c.parent_id === catId) total += counts[c.id] ?? 0;
  }
  return total;
}
