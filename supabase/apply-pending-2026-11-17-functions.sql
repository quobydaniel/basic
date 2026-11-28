-- apply-pending-2026-11-17-functions.sql
-- The 7 functions missing from the live DB (probed 2026-11-17).
-- CREATE OR REPLACE — safe to re-run. Tables/policies already applied.
-- Run in Supabase SQL Editor, then hard-refresh the app.

-- ===== from supabase/apply-pending-2026-11-14b.sql =====
CREATE OR REPLACE FUNCTION public.basic_autopilot_send(
  p_conversation_id uuid,
  p_body text,
  p_kind text DEFAULT 'text',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_convo        record;
  v_last_sender  uuid;
  v_msg_id       uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 OR length(p_body) > 2000 THEN
    RAISE EXCEPTION 'invalid message body';
  END IF;
  IF p_kind NOT IN ('text', 'system_order') THEN
    RAISE EXCEPTION 'invalid message kind';
  END IF;

  -- Lock the conversation row: serializes concurrent auto-replies.
  SELECT c.*, s.plan AS store_plan, s.auto_pilot AS store_auto_pilot
    INTO v_convo
    FROM public.conversations c
    JOIN public.stores s ON s.id = c.store_id
    WHERE c.id = p_conversation_id
    FOR UPDATE OF c;

  IF v_convo IS NULL THEN
    RAISE EXCEPTION 'conversation not found';
  END IF;
  IF auth.uid() <> v_convo.buyer_id AND auth.uid() <> v_convo.seller_id THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  IF v_convo.store_plan <> 'pro' OR v_convo.store_auto_pilot IS NOT TRUE THEN
    RAISE EXCEPTION 'auto-pilot is not enabled for this store';
  END IF;

  -- Only answer when the newest message is the buyer's (or thread is empty).
  SELECT m.sender_id INTO v_last_sender
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
    ORDER BY m.created_at DESC
    LIMIT 1;
  IF v_last_sender IS NOT NULL AND v_last_sender <> v_convo.buyer_id THEN
    RAISE EXCEPTION 'nothing to reply to';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, kind, body, metadata)
  VALUES (p_conversation_id, v_convo.seller_id, p_kind::public.message_kind, p_body, p_metadata)
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.basic_autopilot_send TO authenticated, anon;

-- ===== from supabase/apply-pending-2026-11-14b.sql =====
CREATE OR REPLACE FUNCTION public.admin_confirm_user(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE auth.users
     SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at         = now()
   WHERE lower(email) = lower(p_email);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_confirm_user TO authenticated, anon;

-- ===== from supabase/apply-pending-2026-11-14h.sql =====
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
GRANT EXECUTE ON FUNCTION public.has_purchased TO authenticated, anon;

-- ===== from supabase/apply-pending-2026-11-14i.sql =====
CREATE OR REPLACE FUNCTION public.guard_profile_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE NOTICE 'profile plan change blocked for non-admin %', auth.uid();
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END;
$$;
GRANT EXECUTE ON FUNCTION public.guard_profile_plan TO authenticated, anon;

-- ===== from supabase/apply-pending-2026-11-14j.sql =====
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
GRANT EXECUTE ON FUNCTION public.cancel_order_by_buyer TO authenticated, anon;

-- ===== from supabase/apply-pending-2026-11-15-shorts.sql =====
CREATE OR REPLACE FUNCTION public.store_short_stats(p_store uuid)
RETURNS TABLE (short_id uuid, views bigint, likes bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT sh.id,
         (SELECT count(*) FROM public.short_views v WHERE v.short_id = sh.id),
         (SELECT count(*) FROM public.short_likes l WHERE l.short_id = sh.id)
  FROM public.shorts sh
  WHERE sh.store_id = p_store;
$$;
GRANT EXECUTE ON FUNCTION public.store_short_stats TO authenticated, anon;

-- ===== from supabase/apply-pending-2026-11-14.sql =====
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


-- ============================================================
-- 20260902140000_store_kyc.sql
-- ============================================================
-- Seller KYC (Know Your Customer) verification.
-- kyc_verified: set by an ADMIN after checking the seller's government ID —
-- powers the gold "Verified" badge on the storefront.
-- kyc_submitted_at: when the seller last submitted ID documents (for the
-- upcoming in-app KYC submission flow).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;



-- ============================================================
-- 20261114120000_profiles_public_names.sql  (added 2026-11-14)
-- ============================================================
-- Review author names on storefronts. `reviews` has NO foreign key to
-- `profiles`, so the `buyer:profiles(full_name)` embed 400'd and reviews
-- never rendered. The UI now looks names up by id — this grant makes the
-- lookup work for signed-out visitors.
--
-- Column-scoped on purpose: `phone` and anything else sensitive stay
-- hidden. anon gains read access to id / full_name / avatar_url ONLY.
GRANT SELECT (id, full_name, avatar_url) ON TABLE public.profiles TO anon;

-- Row visibility for signed-out visitors (existing authenticated policies
-- are untouched — permissive policies OR together).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_basic_names_public'
  ) THEN
    CREATE POLICY profiles_basic_names_public ON public.profiles
      FOR SELECT TO anon USING (true);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.deduct_stock_on_purchase TO authenticated, anon;

-- Verify (should return 7 rows):
-- SELECT proname FROM pg_proc WHERE proname IN ('basic_autopilot_send','admin_confirm_user','has_purchased','guard_profile_plan','cancel_order_by_buyer','store_short_stats','deduct_stock_on_purchase');