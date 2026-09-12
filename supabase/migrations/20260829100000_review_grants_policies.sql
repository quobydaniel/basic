-- Code-review fixes: grants + policies the runtime needs but the original
-- migrations never provided. Found by security review 2026-08-29.

-- 1. Admin role management: user_roles had SELECT-only grant for authenticated,
--    so adminSetUserRole insert/delete always failed with permission denied.
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- 2. computeStoreInsights: ai_insights had no INSERT grant and no INSERT
--    policy, so insights were silently never persisted. Store members may
--    insert insights for their own stores.
GRANT INSERT ON public.ai_insights TO authenticated;

CREATE POLICY "ai_insights_store_insert" ON public.ai_insights
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id
        AND (s.owner_id = auth.uid() OR public.is_store_member(s.id, auth.uid()))
    )
  );

-- 3. Admin platform stats: orders/products had no admin SELECT policy, so the
--    admin overview only counted the admin's own rows. Read-only, admin-gated.
CREATE POLICY "orders_admin_read" ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "products_admin_read" ON public.products
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "stores_admin_read" ON public.stores
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
