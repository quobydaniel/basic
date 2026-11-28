-- apply-pending-2026-11-14e.sql — sellers can delete their own orders
--
-- WHY: orders had SELECT/INSERT/UPDATE policies but no DELETE, so the
-- "Delete order" action on the seller dashboard fails with an RLS error.
-- order_items rows cascade automatically (order_items.order_id is ON
-- DELETE CASCADE, phase1_core).
--
-- Guardrails: the UI only offers delete for pending/cancelled orders and
-- confirms first; this policy scopes deletion to store members the same
-- way orders_store_manage scopes updates. Run as postgres (Dashboard →
-- SQL Editor) once.

CREATE POLICY "orders_store_delete" ON public.orders
FOR DELETE TO authenticated
USING (public.is_store_member(store_id, auth.uid()));

-- Rollback (if ever needed):
-- DROP POLICY IF EXISTS "orders_store_delete" ON public.orders;
