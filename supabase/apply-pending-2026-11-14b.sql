-- ============================================================
-- BASIC — pending SQL #2 (2026-11-14) — chat auto-pilot + admin helpers
-- Run in the Supabase SQL editor (Dashboard → SQL → paste → Run).
-- Safe to re-run: every statement is idempotent (CREATE OR REPLACE / guarded).
-- ============================================================


-- ------------------------------------------------------------
-- 1) basic_autopilot_send — the AI auto-reply delivery hatch
-- ------------------------------------------------------------
-- WHY: messages RLS requires sender_id = auth.uid(), so a buyer's session
-- can never post a message AS the seller. Auto-pilot previously only replied
-- while the seller's own browser was open (thread effect + dashboard
-- heartbeat). With this RPC the BUYER's client can trigger the AI and land
-- the reply in the thread as the seller — so stores answer buyers even when
-- the seller is offline.
--
-- SAFETY (all enforced inside, SECURITY DEFINER):
--   • caller must be a participant of the conversation
--   • the store must be Pro with auto_pilot ON
--   • the thread's newest message must be from the buyer (no double-fire,
--     no loop: once the AI has replied, a second call refuses)
--   • conversation row is locked FOR UPDATE, so two racing triggers
--     serialize — the loser sees the winner's message and bails
--   • kind restricted to text / system_order; body capped at 2000 chars
-- The existing touch_conversation + notification triggers fire on the
-- insert, so unread counters and buyer notifications keep working.

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

REVOKE ALL ON FUNCTION public.basic_autopilot_send(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.basic_autopilot_send(uuid, text, text, jsonb) TO authenticated;


-- ------------------------------------------------------------
-- 2) admin_confirm_user — admin console: confirm a signup's email
-- ------------------------------------------------------------
-- Signup requires email confirmation (mailer_autoconfirm = false). QA /
-- support accounts created with addresses nobody can open (e.g. test
-- signups) would be stuck. An admin (user_roles.role = 'admin') can now
-- confirm them directly. Same guard style as admin_list_users.

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

REVOKE ALL ON FUNCTION public.admin_confirm_user(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_user(text) TO authenticated;


-- ------------------------------------------------------------
-- 3) (carried from apply-pending-2026-11-14.sql — re-run safe)
--    profiles public names: column-scoped anon grant + select policy.
--    Included so THIS file alone is enough if it wasn't run yet.
-- ------------------------------------------------------------
GRANT SELECT (id, full_name, avatar_url) ON TABLE public.profiles TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policy_name = 'profiles_basic_names_public'
  ) THEN
    CREATE POLICY profiles_basic_names_public ON public.profiles
      FOR SELECT TO anon USING (true);
  END IF;
END $$;
