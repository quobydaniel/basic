-- apply-pending-2026-11-14f.sql — order item lines for chat-created orders
--
-- WHY: the seller's chat "Create order" flow inserts the order but its
-- order_items INSERT always failed RLS — order_items_insert only allowed
-- the BUYER (o.buyer_id = auth.uid()), while this insert runs as the
-- SELLER. Result: chat-created orders have no item lines, so the seller
-- dashboard shows "—" with no product image.
--
-- 1) Let store members add item lines to their store's orders (buyer path
--    unchanged). 2) Backfill item lines for chat-created orders that have
--    none, deriving title/variant from the conversation's product.
-- Run as postgres (Dashboard → SQL Editor) once.

-- 1) Store members may insert item lines on their own store's orders
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND (o.buyer_id = auth.uid() OR public.is_store_member(o.store_id, auth.uid()))
  )
);

-- 2) Backfill: every chat-created order missing its item line gets one
--    (1× <product title>, priced at the order total; variant linked when
--    the product has one, so the dashboard thumbnail resolves).
INSERT INTO public.order_items (order_id, variant_id, product_title, quantity, unit_price, total)
SELECT o.id,
       (SELECT pv.id FROM public.product_variants pv WHERE pv.product_id = c.product_id LIMIT 1),
       COALESCE(p.title, 'Order'),
       1,
       o.total,
       o.total
FROM public.orders o
JOIN public.conversations c ON c.order_id = o.id
LEFT JOIN public.products p ON p.id = c.product_id
WHERE o.source = 'chat'
  AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);

-- Rollback (if ever needed):
-- DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
-- CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated
--   WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()));
-- DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE source = 'chat');
