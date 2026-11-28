-- apply-pending-2026-11-14d.sql — buyer names in the seller inbox
--
-- WHY: profiles RLS only allows reading your own profile
-- (profiles_select_own, phase1_core), so when a seller's inbox fetches
-- buyer profiles (ChatList: profiles.in("id", buyer_ids)) it gets zero
-- rows and every conversation falls back to "Buyer" with a monogram
-- avatar. Same gate blocks the thread header's buyer name/presence.
--
-- FIX: let conversation participants read EACH OTHER'S profile. Scoped
-- strictly to shared conversations (buyer ↔ seller) — profiles carry
-- phone numbers, so this must NOT become a public read. Run as postgres
-- (Dashboard → SQL Editor) once.

CREATE POLICY "profiles_conversation_participants_select" ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.buyer_id = profiles.id AND c.seller_id = auth.uid())
       OR (c.seller_id = profiles.id AND c.buyer_id = auth.uid())
  )
);

-- Rollback (if ever needed):
-- DROP POLICY IF EXISTS "profiles_conversation_participants_select" ON public.profiles;
