import { supabase } from "@/integrations/supabase/client";

/**
 * Find or create a conversation between the current buyer and a store seller.
 * Returns conversation id.
 */
export async function openConversation(params: {
  buyerId: string;
  sellerId: string;
  storeId: string;
  productId?: string | null;
  orderId?: string | null;
}): Promise<string> {
  const { buyerId, sellerId, storeId, productId = null, orderId = null } = params;

  // Try find existing
  let q = supabase
    .from("conversations" as any)
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("seller_id", sellerId)
    .eq("store_id", storeId)
    .limit(1);
  if (productId) q = q.eq("product_id", productId);
  const { data: found } = await q;
  if (found && found.length) return (found[0] as any).id;

  const { data, error } = await supabase
    .from("conversations" as any)
    .insert({
      buyer_id: buyerId,
      seller_id: sellerId,
      store_id: storeId,
      product_id: productId,
      order_id: orderId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id;
}
