-- apply-pending-2026-11-14j.sql — buyer cancel + delete on /orders
--
-- 1) cancel_order_by_buyer: the buyer can pull a PENDING order outright
--    (nothing captured yet). SECURITY DEFINER + buyer-only + pending-only —
--    deliberately an RPC, not an UPDATE policy, so a buyer can never edit
--    price/status to anything else. Paid+ orders still go through the
--    seller's confirm/decline card in chat. The status trigger fires, so
--    order_events gets the cancelled step and the track timeline updates.
-- 2) orders_buyer_delete: buyers hard-delete their own pending/cancelled
--    orders (list hygiene). Row-level USING keeps paid/delivered history
--    undeletable. order_items/order_events rows cascade automatically.
--
-- Run as postgres (Dashboard → SQL Editor) once. Idempotent.

CREATE OR REPLACE FUNCTION public.cancel_order_by_buyer(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id AND buyer_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be cancelled here — paid orders go through the seller';
  END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_order_by_buyer(uuid) TO authenticated;

DROP POLICY IF EXISTS "orders_buyer_delete" ON public.orders;
CREATE POLICY "orders_buyer_delete" ON public.orders
  FOR DELETE TO authenticated
  USING (auth.uid() = buyer_id AND status IN ('pending', 'cancelled'));
