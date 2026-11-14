-- apply-pending-2026-11-14h.sql — reviews become verified-purchase-only
--
-- Until now ANY signed-in user could review ANY product: reviews_own_manage
-- allowed INSERT on buyer_id = auth.uid() alone. The UI now hides the review
-- form from non-buyers; this makes the database enforce it too.
--
-- 1) public.has_purchased(product, buyer) — one helper both policies reuse.
--    order_items has no product_id, so the purchase is matched through the
--    product's variants, or (for engine-created lines with a null variant_id)
--    through the title within the same store's orders. Cancelled orders were
--    never purchases.
-- 2) Replaces reviews_own_manage with:
--      INSERT/UPDATE → must be the author AND a real buyer of that product
--      DELETE        → author only (cleanup stays possible)
--
-- Run as postgres (Dashboard → SQL Editor) once. Idempotent.

CREATE OR REPLACE FUNCTION public.has_purchased(p_product uuid, p_buyer uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.products p ON p.id = p_product
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE o.buyer_id = p_buyer
      AND o.status <> 'cancelled'
      AND (
        pv.product_id = p.id
        OR (oi.variant_id IS NULL AND oi.product_title = p.title AND o.store_id = p.store_id)
      )
  );
$$;

DROP POLICY IF EXISTS "reviews_own_manage" ON public.reviews;

CREATE POLICY "reviews_buyers_insert" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = buyer_id
    AND public.has_purchased(product_id, auth.uid())
  );

CREATE POLICY "reviews_buyers_update" ON public.reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id)
  WITH CHECK (
    auth.uid() = buyer_id
    AND public.has_purchased(product_id, auth.uid())
  );

CREATE POLICY "reviews_own_delete" ON public.reviews
  FOR DELETE TO authenticated
  USING (auth.uid() = buyer_id);
