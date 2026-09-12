-- Admin console migration — super-admin /admin support.
-- Adds: store plans (free/pro), runtime AI model config table, admin RLS
-- policies, and the guarded admin_list_users() function (emails live in
-- auth.users, outside RLS reach).

-- 1. Store plans -----------------------------------------------------------
CREATE TYPE public.store_plan AS ENUM ('free', 'pro');

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS plan public.store_plan NOT NULL DEFAULT 'free';

-- 2. AI model configuration (runtime-editable model registry) ---------------
CREATE TABLE IF NOT EXISTS public.ai_model_config (
  fn_name    text PRIMARY KEY CHECK (fn_name IN (
    'generateListingFromPhotos','draftChatReplies',
    'generateMarketingPost','computeStoreInsights','assistantChat')),
  model_id   text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_model_config TO authenticated;
GRANT ALL ON public.ai_model_config TO service_role;
ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_model_config_select" ON public.ai_model_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_model_config_write" ON public.ai_model_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Admin RLS on existing tables (second net under requireAdmin fns) -------
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "stores_admin_update" ON public.stores
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "products_admin_update" ON public.products
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Admin-only user list (emails live in auth.users, outside RLS reach) ----
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  roles text[],
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden — admin only';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email, p.full_name,
    COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = u.id), '{}'),
    u.created_at
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
