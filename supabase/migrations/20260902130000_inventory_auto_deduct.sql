-- ============================================================================
-- Live inventory: stock is a variable that moves with every purchase.
-- When an order item is recorded, the matching variant's inventory_qty is
-- decremented automatically (works for chat-tagged orders, AI-placed orders,
-- and any future checkout). The seller is notified when stock crosses the
-- low (≤3) and sold-out (0) thresholds — the AI copilot reports the rest.
-- Safe to re-run (drops/recreates its own trigger).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.deduct_stock_on_purchase() RETURNS trigger AS $$
DECLARE
  o record;
  v record;
  prod record;
  store_owner uuid;
  prev_qty int;
  new_qty int;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN RETURN NEW; END IF;

  SELECT id, store_id INTO o FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Locate the variant to decrement:
  IF NEW.variant_id IS NOT NULL THEN
    SELECT * INTO v FROM public.product_variants WHERE id = NEW.variant_id;
  ELSIF NEW.variant_title IS NOT NULL AND NEW.variant_title <> '' THEN
    SELECT pv.* INTO v
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE p.store_id = o.store_id
      AND lower(p.title) = lower(NEW.product_title)
      AND lower(pv.title) = lower(NEW.variant_title)
    LIMIT 1;
  END IF;

  IF v.id IS NULL THEN
    SELECT * INTO prod FROM public.products
    WHERE store_id = o.store_id AND lower(title) = lower(NEW.product_title)
    LIMIT 1;
    IF NOT FOUND THEN RETURN NEW; END IF;
    SELECT * INTO v FROM public.product_variants
    WHERE product_id = prod.id AND lower(title) = 'default'
    LIMIT 1;
    IF v.id IS NULL THEN
      SELECT * INTO v FROM public.product_variants
      WHERE product_id = prod.id
      ORDER BY position
      LIMIT 1;
    END IF;
  END IF;

  IF v.id IS NULL THEN RETURN NEW; END IF;
  SELECT title INTO prod FROM public.products WHERE id = v.product_id;
  SELECT owner_id INTO store_owner FROM public.stores WHERE id = o.store_id;

  prev_qty := COALESCE(v.inventory_qty, 0);
  new_qty := GREATEST(prev_qty - NEW.quantity, 0);
  UPDATE public.product_variants SET inventory_qty = new_qty WHERE id = v.id;

  -- Threshold alerts — only fire on the crossing, never repeatedly.
  IF new_qty = 0 AND prev_qty > 0 THEN
    INSERT INTO public.notifications (user_id, kind, title, body, payload)
    VALUES (store_owner, 'stock', 'Sold out',
            prod.title || ' is out of stock.',
            jsonb_build_object('product_id', v.product_id));
  ELSIF new_qty <= 3 AND prev_qty > 3 THEN
    INSERT INTO public.notifications (user_id, kind, title, body, payload)
    VALUES (store_owner, 'stock', 'Low stock',
            prod.title || ' has only ' || new_qty || ' left.',
            jsonb_build_object('product_id', v.product_id));
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS order_items_deduct_stock ON public.order_items;
CREATE TRIGGER order_items_deduct_stock
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.deduct_stock_on_purchase();
