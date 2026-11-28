-- apply-pending-2026-11-14g.sql — AI proposals, price floors, message resolution
--
-- 1) products.ai_min_price — the seller's listing-time discount limit: the
--    AI may never agree below this price when negotiating.
-- 2) conversations.ai_price_limit — a per-chat floor the seller sets in the
--    thread (overrides the product floor for that conversation).
-- 3) conversations.ai_enabled — per-chat AI control (tri-state):
--      NULL  = follow the store master switch (AI answers NEW customers)
--      true  = seller opted THIS chat in (AI answers regardless)
--      false = seller paused the AI for this chat (never answers here)
--    The thread header's Auto-pilot button writes this; the dashboard
--    Auto-reply AI switch writes stores.auto_pilot (store-wide master).
-- 4) participants_update_messages — the seller's Confirm/Decline on an AI
--    proposal card marks the proposal message resolved (metadata update).
--    Messages had only read/insert policies.
--
-- Run as postgres (Dashboard → SQL Editor) once. Idempotent.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_min_price NUMERIC(12,2);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_price_limit NUMERIC(12,2);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN;

-- AI persona settings (Settings → AI assistant). The auto-pilot prompt
-- reads these: identity name, first-contact greeting, personality rules.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_name TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_greeting TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_persona TEXT;
-- AI shopkeeper character shown on the storefront assistant (Pro): one of
-- the ids from src/lib/ai-characters.ts ("akua", "kofi", ...).
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_character TEXT;

DROP POLICY IF EXISTS "participants_update_messages" ON public.messages;
CREATE POLICY "participants_update_messages" ON public.messages
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
);

-- Rollback (if ever needed):
-- ALTER TABLE public.products DROP COLUMN IF EXISTS ai_min_price;
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS ai_price_limit;
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS ai_enabled;
-- ALTER TABLE public.stores DROP COLUMN IF EXISTS ai_name;
-- ALTER TABLE public.stores DROP COLUMN IF EXISTS ai_greeting;
-- ALTER TABLE public.stores DROP COLUMN IF EXISTS ai_persona;
-- ALTER TABLE public.stores DROP COLUMN IF EXISTS ai_character;
-- DROP POLICY IF EXISTS "participants_update_messages" ON public.messages;
