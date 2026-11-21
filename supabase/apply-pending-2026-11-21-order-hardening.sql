-- ============================================================
-- 2026-11-21 — PHASE 1 ORDER HARDENING
-- Financial integrity: authoritative order creation, stock integrity,
-- status transition matrix, idempotency, RLS tightening.
--
-- Apply AFTER pulling the frontend that calls place_order (the confirm
-- flows detect a missing RPC and fall back to the legacy client insert
-- until this migration runs; after it runs, the legacy insert path is
-- closed by the policy drops below).
-- Idempotent where possible; the policy drops are no-ops on re-run.
-- ============================================================

-- ---------- 1. Idempotency key on orders ----------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------- 2. Authoritative order creation ----------
-- place_order: the ONLY way orders should be created from now on.
-- SECURITY DEFINER so it can validate with full authority, but every path
-- inside checks auth.uid() and membership — no service-role shortcut.
--   • Buyer self-service: caller IS the buyer (any authenticated user).
--   • Seller confirmation: caller is a store member, p_buyer_id = the
--     conversation's buyer.
--   • Price: p_unit_price (negotiated) must be > 0 and >= ai_min_price.
--     NULL = canonical catalog price.
--   • Stock: locks the variant row FOR UPDATE, rejects insufficient qty.
--     The deduct trigger then fires INSIDE this transaction (atomic —
--     insufficient stock rolls the whole order back).
--   • Idempotency: same key returns the original order (duplicate: true).
CREATE OR REPLACE FUNCTION public.place_order(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity int,
  p_unit_price numeric DEFAULT NULL,
  p_variant_title text DEFAULT NULL,
  p_delivery text DEFAULT NULL,
  p_payment text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_source text DEFAULT 'chat',
  p_idempotency_key text DEFAULT NULL,
  p_buyer_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store record;
  v_prod record;
  v_variant record;
  v_buyer uuid;
  v_unit numeric;
  v_total numeric;
  v_order record;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 99 THEN
    RAISE EXCEPTION 'invalid quantity';
  END IF;

  -- Idempotency: a repeated submission returns the original order.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.orders WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('order_id', v_existing, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO v_store FROM public.stores
    WHERE id = p_store_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store not available';
  END IF;

  SELECT * INTO v_prod FROM public.products
    WHERE id = p_product_id AND store_id = p_store_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not available';
  END IF;

  -- Actor: the buyer themselves, or a store member confirming on behalf
  -- of a buyer (AI proposal confirmation / seller recap creation).
  IF p_buyer_id IS NOT NULL AND p_buyer_id <> v_uid THEN
    IF NOT public.is_store_member(p_store_id, v_uid) THEN
      RAISE EXCEPTION 'not authorized to create this order';
    END IF;
    v_buyer := p_buyer_id;
  ELSE
    v_buyer := v_uid;
  END IF;

  -- Price: negotiated price must be positive and respect the seller floor.
  v_unit := COALESCE(p_unit_price, v_prod.base_price);
  IF v_unit IS NULL OR v_unit <= 0 OR v_unit > 10000000 THEN
    RAISE EXCEPTION 'invalid price';
  END IF;
  IF v_prod.ai_min_price IS NOT NULL AND v_unit < v_prod.ai_min_price THEN
    RAISE EXCEPTION 'price is below the seller floor';
  END IF;
  v_total := round(v_unit * p_quantity, 2);

  -- Variant resolution — mirrors deduct_stock_on_purchase so validation
  -- and deduction always agree on the same row.
  IF p_variant_title IS NOT NULL AND p_variant_title <> '' THEN
    SELECT * INTO v_variant FROM public.product_variants
      WHERE product_id = p_product_id AND lower(title) = lower(p_variant_title)
      LIMIT 1;
  END IF;
  IF v_variant.id IS NULL THEN
    SELECT * INTO v_variant FROM public.product_variants
      WHERE product_id = p_product_id AND lower(title) = 'default'
      LIMIT 1;
  END IF;
  IF v_variant.id IS NULL THEN
    SELECT * INTO v_variant FROM public.product_variants
      WHERE product_id = p_product_id
      ORDER BY position
      LIMIT 1;
  END IF;

  -- Stock: lock the row (serializes concurrent purchases), then validate.
  -- The deduct trigger (AFTER INSERT on order_items) fires inside this same
  -- transaction, so insufficient stock rolls the ENTIRE order back.
  IF v_variant.id IS NOT NULL THEN
    PERFORM 1 FROM public.product_variants WHERE id = v_variant.id FOR UPDATE;
    IF COALESCE(v_variant.inventory_qty, 0) < p_quantity THEN
      RAISE EXCEPTION 'insufficient stock — only % left', COALESCE(v_variant.inventory_qty, 0);
    END IF;
  END IF;

  INSERT INTO public.orders (
    store_id, buyer_id, status, subtotal, total, currency, source,
    fulfillment_type, payment_term, notes, idempotency_key
  ) VALUES (
    p_store_id, v_buyer, 'pending', v_total, v_total,
    COALESCE(v_prod.currency, v_store.currency, 'GHS'),
    COALESCE(p_source, 'chat'),
    CASE WHEN p_delivery IS NOT NULL THEN 'delivery' ELSE 'meet_in_person' END,
    NULLIF(p_payment, ''),
    NULLIF(p_notes, ''),
    p_idempotency_key
  ) RETURNING * INTO v_order;

  INSERT INTO public.order_items (order_id, variant_id, product_title, quantity, unit_price, total)
  VALUES (v_order.id, v_variant.id, v_prod.title, p_quantity, v_unit, v_total);

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'total', v_total,
    'quantity', p_quantity,
    'duplicate', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_order(uuid, uuid, int, numeric, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, uuid, int, numeric, text, text, text, text, text, text, uuid) TO authenticated;

-- ---------- 3. Stock integrity — reject, don't clamp ----------
-- BEFORE INSERT trigger mirroring deduct_stock_on_purchase's variant
-- resolution: locks the variant row and REJECTS insufficient stock instead
-- of flooring to zero. Deduction itself stays with the existing AFTER
-- trigger (one deduction mechanism, untouched).
CREATE OR REPLACE FUNCTION public.enforce_stock_before_item_insert() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v record;
  prod record;
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN RETURN NEW; END IF;

  SELECT id, store_id INTO o FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

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

  IF v.id IS NULL THEN RETURN NEW; END IF; -- product without variants: nothing to enforce

  PERFORM 1 FROM public.product_variants WHERE id = v.id FOR UPDATE;
  IF COALESCE(v.inventory_qty, 0) < NEW.quantity THEN
    RAISE EXCEPTION 'insufficient stock — only % left of %', COALESCE(v.inventory_qty, 0), NEW.product_title;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_enforce_stock ON public.order_items;
CREATE TRIGGER order_items_enforce_stock
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stock_before_item_insert();

-- ---------- 4. Order status transition matrix ----------
-- The app's own flows define the legal moves; terminal states are terminal.
-- Buyer status changes only happen via the existing RPCs (cancel_order_by_
-- buyer, confirm_order_delivery) — those definer updates pass this matrix.
CREATE OR REPLACE FUNCTION public.enforce_order_status_transition() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  -- Terminal states never reopen.
  IF OLD.status IN ('cancelled', 'refunded') THEN
    RAISE EXCEPTION 'order % is % — terminal state', OLD.order_number, OLD.status;
  END IF;

  -- Legal transitions (from the app's real workflows):
  IF NOT (
    (OLD.status = 'pending'   AND NEW.status IN ('paid','fulfilled','shipped','delivered','cancelled','refunded')) OR
    (OLD.status = 'paid'      AND NEW.status IN ('fulfilled','shipped','delivered','cancelled','refunded')) OR
    (OLD.status = 'fulfilled' AND NEW.status IN ('shipped','delivered','cancelled','refunded')) OR
    (OLD.status = 'shipped'   AND NEW.status IN ('delivered','refunded')) OR
    (OLD.status = 'delivered' AND NEW.status IN ('refunded'))
  ) THEN
    RAISE EXCEPTION 'invalid status transition % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_transition ON public.orders;
CREATE TRIGGER orders_enforce_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

-- ---------- 5. RLS tightening ----------
-- Every client order-creation path now goes through place_order (definer).
-- Direct INSERT by buyers/sellers is closed; membership reads stay.
DROP POLICY IF EXISTS "orders_buyer_create" ON public.orders;
DROP POLICY IF EXISTS "orders_store_create" ON public.orders;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

-- Seller status updates keep their policy (orders_store_manage) — the
-- transition trigger above now constrains WHAT they can change.

-- ---------- 6. EXECUTE hygiene ----------
-- Trigger helper and self-gated RPCs were over-granted to anon; the
-- functions still self-guard, but anon never needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.deduct_stock_on_purchase() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_confirm_user(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_order_by_buyer(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_order_delivery(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_purchased(uuid, uuid) FROM anon;
