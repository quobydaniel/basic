-- Order status tracking + buyer delivery confirmation.
-- 1) order_events: automatic history of status changes (trigger-maintained).
-- 2) orders.buyer_confirmed_at: buyer taps "Confirm receipt" on a delivered order.
-- 3) confirm_order_delivery(p_order_id): SECURITY DEFINER RPC — buyer-only,
--    delivered-only; notifies the store owner.

-- ---------------------------------------------------------------- order_events
CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON public.order_events (order_id, created_at);

ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_events_read" ON public.order_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
      WHERE o.id = order_id AND s.owner_id = auth.uid()
    )
  );

-- History is maintained by triggers only; no client insert/update/delete.
REVOKE INSERT, UPDATE, DELETE ON public.order_events FROM authenticated, anon;

-- --------------------------------------------------------- status-change trigger
CREATE OR REPLACE FUNCTION public.log_order_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_events (order_id, status) VALUES (NEW.id, NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_events (order_id, status) VALUES (NEW.id, NEW.status);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS orders_log_event_ins ON public.orders;
CREATE TRIGGER orders_log_event_ins
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_event();

DROP TRIGGER IF EXISTS orders_log_event_upd ON public.orders;
CREATE TRIGGER orders_log_event_upd
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_event();

-- ------------------------------------------------- buyer confirmation of receipt
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.buyer_id IS NULL OR o.buyer_id <> auth.uid() THEN RAISE EXCEPTION 'Not your order'; END IF;
  IF o.status <> 'delivered' THEN RAISE EXCEPTION 'Only delivered orders can be confirmed'; END IF;
  IF o.buyer_confirmed_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.orders SET buyer_confirmed_at = now() WHERE id = p_order_id;

  INSERT INTO public.notifications (user_id, kind, title, body, payload)
    SELECT s.owner_id,
           'order',
           'Buyer confirmed delivery',
           'Order #' || o.order_number || ' was confirmed received by the buyer.',
           jsonb_build_object('order_id', o.id, 'order_number', o.order_number)
    FROM public.stores s WHERE s.id = o.store_id;
END $$;

REVOKE ALL ON FUNCTION public.confirm_order_delivery(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_delivery(uuid) TO authenticated;

-- Backfill: seed events for orders that already have a status so existing
-- orders get a timeline on first load after this migration.
INSERT INTO public.order_events (order_id, status, created_at)
SELECT o.id, o.status, o.updated_at
FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_events e WHERE e.order_id = o.id);
