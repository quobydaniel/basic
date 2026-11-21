-- ============================================================
-- order-hardening-test.sql — integration asserts for Phase 1.
-- Run in the Supabase SQL editor AFTER apply-pending-2026-11-21-order-
-- hardening.sql. Fully transactional: everything ROLLS BACK — no data is
-- left behind, production rows are untouched (test rows use dedicated
-- test ids/names and are deleted before the rollback anyway).
--
-- Each check raises 'ASSERT FAILED: …' on failure; success prints a
-- single summary line. STATUS: runnable, verified only when executed.
-- ============================================================
BEGIN;

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_store uuid;
  v_prod uuid;
  v_variant uuid;
  v_order uuid;
  v_res jsonb;
  v_count int;
  v_err text;
BEGIN
  -- ── seed (rolled back at the end) ──────────────────────────────────
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES (v_user, 'hardening-test-a@test.local', 'x', now(), now(), now());
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    VALUES (v_other, 'hardening-test-b@test.local', 'x', now(), now(), now());
  -- profiles auto-created by the handle_new_user trigger on auth.users
  INSERT INTO public.stores (id, owner_id, name, slug, status, plan, auto_pilot)
    VALUES (v_store := gen_random_uuid(), v_user, 'Hardening Test Store',
            'hardening-test-' || substr(gen_random_uuid()::text, 1, 8), 'active', 'pro', true);
  INSERT INTO public.products (id, store_id, title, slug, base_price, currency, status, ai_min_price)
    VALUES (v_prod := gen_random_uuid(), v_store, 'Hardening Test Widget', 'hardening-test-widget', 100, 'GHS', 'active', 80);
  INSERT INTO public.product_variants (id, product_id, title, inventory_qty, position)
    VALUES (v_variant := gen_random_uuid(), v_prod, 'default', 3, 0);

  -- ── act as the buyer ────────────────────────────────────────────────
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = json_build_object('sub', v_user)::text;

  -- 1. Idempotency: two submissions, one order.
  SELECT public.place_order(v_store, v_prod, 2, 90, NULL, NULL, 'cash', NULL, 'chat', 'hardening-key-1', NULL) INTO v_res;
  ASSERT (v_res->>'order_number') IS NOT NULL, 'ASSERT FAILED: place_order did not return an order';
  ASSERT (v_res->>'total')::numeric = 180, 'ASSERT FAILED: server-computed total wrong (expected 90 x 2)';
  SELECT public.place_order(v_store, v_prod, 2, 90, NULL, NULL, 'cash', NULL, 'chat', 'hardening-key-1', NULL) INTO v_res;
  ASSERT (v_res->>'duplicate')::boolean IS TRUE, 'ASSERT FAILED: idempotent retry created a second order';
  SELECT id INTO v_order FROM public.orders WHERE idempotency_key = 'hardening-key-1';
  SELECT count(*) INTO v_count FROM public.orders WHERE idempotency_key = 'hardening-key-1';
  ASSERT v_count = 1, 'ASSERT FAILED: duplicate orders share the idempotency key';

  -- 2. Floor enforcement: 70 < ai_min_price 80 → rejected.
  BEGIN
    PERFORM public.place_order(v_store, v_prod, 1, 70, NULL, NULL, NULL, NULL, 'chat', 'hardening-key-2', NULL);
    RAISE EXCEPTION 'ASSERT FAILED: below-floor price was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERT FAILED%' THEN RAISE; END IF; -- expected rejection
  END;

  -- 3. Stock integrity: ordering 5 of 3 remaining (2 already taken) → rejected.
  BEGIN
    PERFORM public.place_order(v_store, v_prod, 5, 100, NULL, NULL, NULL, NULL, 'chat', 'hardening-key-3', NULL);
    RAISE EXCEPTION 'ASSERT FAILED: insufficient stock was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERT FAILED%' THEN RAISE; END IF;
  END;
  -- and the failed attempt left no order rows behind (atomic rollback):
  SELECT count(*) INTO v_count FROM public.orders WHERE idempotency_key = 'hardening-key-3';
  ASSERT v_count = 0, 'ASSERT FAILED: rejected order left rows behind';
  -- stock only deducted for the successful order (3 − 2 = 1):
  SELECT inventory_qty INTO v_count FROM public.product_variants WHERE id = v_variant;
  ASSERT v_count = 1, 'ASSERT FAILED: stock deduction wrong (expected 1)';

  -- 4. Buyer cannot place for another user directly.
  BEGIN
    SET LOCAL request.jwt.claims = json_build_object('sub', v_other)::text;
    PERFORM public.place_order(v_store, v_prod, 1, 100, NULL, NULL, NULL, NULL, 'chat', 'hardening-key-4', v_user);
    RAISE EXCEPTION 'ASSERT FAILED: outsider placed an order for another buyer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERT FAILED%' THEN RAISE; END IF;
  END;
  SET LOCAL request.jwt.claims = json_build_object('sub', v_user)::text;

  -- 5. Transition matrix (as the store owner): delivered → paid illegal etc.
  SET LOCAL request.jwt.claims = json_build_object('sub', v_user)::text;
  BEGIN
    UPDATE public.orders SET status = 'paid' WHERE id = v_order; -- allowed
    UPDATE public.orders SET status = 'pending' WHERE id = v_order;
    RAISE EXCEPTION 'ASSERT FAILED: paid → pending was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERT FAILED%' THEN RAISE; END IF;
  END;
  UPDATE public.orders SET status = 'delivered' WHERE id = v_order; -- paid → delivered OK
  BEGIN
    UPDATE public.orders SET status = 'fulfilled' WHERE id = v_order; -- delivered → fulfilled illegal
    RAISE EXCEPTION 'ASSERT FAILED: delivered → fulfilled was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERT FAILED%' THEN RAISE; END IF;
  END;

  -- 6. Unauthenticated cannot place orders.
  SET LOCAL role anon;
  SET LOCAL request.jwt.claims = '';
  BEGIN
    PERFORM public.place_order(v_store, v_prod, 1, 100, NULL, NULL, NULL, NULL, 'chat', 'hardening-key-5', NULL);
    RAISE EXCEPTION 'ASSERT FAILED: anon placed an order';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERT FAILED%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'ALL ORDER-HARDENING ASSERTS PASSED';
END $$;

ROLLBACK;
