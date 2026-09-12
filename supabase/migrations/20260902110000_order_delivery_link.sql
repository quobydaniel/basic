-- ============================================================================
-- Order ↔ delivery system glue.
-- 1) When an order ships (status → 'shipped', home delivery), a
--    delivery_request is auto-opened so riders see it in their feed —
--    sellers no longer have to file it by hand.
-- 2) When the rider marks a delivery 'delivered', the order flips to
--    'delivered' and the buyer is notified (unlocking Confirm receipt).
-- Safe to re-run (drops/recreates its own triggers).
-- ============================================================================

-- ── 1. Shipping an order opens a rider request ─────────────────────────────
CREATE OR REPLACE FUNCTION public.open_delivery_on_ship() RETURNS trigger AS $$
DECLARE
  store_area text;
  buyer_area text;
BEGIN
  IF NEW.status = 'shipped'
     AND (NEW.fulfillment_type = 'delivery' OR NEW.fulfillment_type IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.delivery_requests dr
       WHERE dr.order_id = NEW.id AND dr.status <> 'cancelled'
     ) THEN

    SELECT NULLIF(trim(concat_ws(', ', s.area, s.city)), '') INTO store_area
    FROM public.stores s WHERE s.id = NEW.store_id;

    buyer_area := COALESCE(
      NEW.shipping_address->>'address',
      NEW.shipping_address->>'area',
      NEW.shipping_address->>'city',
      NULLIF(substring(NEW.notes FROM 'Delivery area: ([^·]+)'), ' ')
    );

    INSERT INTO public.delivery_requests (
      store_id, order_id, buyer_id, status, offered_fee,
      pickup_address, dropoff_address,
      notes
    ) VALUES (
      NEW.store_id, NEW.id, NEW.buyer_id, 'open', 15.00,
      COALESCE(store_area, 'Seller pickup point'),
      COALESCE(buyer_area, 'Buyer to confirm drop-off in chat'),
      concat_ws(' · ',
        CASE WHEN NEW.order_number IS NOT NULL THEN 'Order #' || NEW.order_number END,
        CASE WHEN NEW.payment_term = 'pay_on_delivery' THEN 'Collect payment on delivery (cash)' END,
        'Auto-created when the order shipped'
      )
    );
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS orders_open_delivery_ship ON public.orders;
CREATE TRIGGER orders_open_delivery_ship
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.open_delivery_on_ship();

-- ── 2. Rider marks delivered → order delivered + buyer notified ────────────
CREATE OR REPLACE FUNCTION public.sync_delivery_to_order() RETURNS trigger AS $$
DECLARE
  o record;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' AND NEW.order_id IS NOT NULL THEN
    SELECT id, buyer_id, order_number INTO o FROM public.orders WHERE id = NEW.order_id;
    IF o.id IS NOT NULL THEN
      UPDATE public.orders SET status = 'delivered' WHERE id = o.id AND status <> 'delivered';
      INSERT INTO public.notifications (user_id, kind, title, body, payload)
      VALUES (
        o.buyer_id,
        'order',
        'Your order was delivered',
        'Order #' || o.order_number || ' has been dropped off. Confirm receipt to let the seller know it arrived.',
        jsonb_build_object('order_id', o.id, 'order_number', o.order_number)
      );
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS delivery_sync_order_delivered ON public.delivery_requests;
CREATE TRIGGER delivery_sync_order_delivered
  AFTER UPDATE OF status ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_to_order();
