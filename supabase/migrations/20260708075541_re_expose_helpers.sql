-- Grant EXECUTE on SECURITY DEFINER helpers used by RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) TO anon, authenticated;

-- Ensure anon can SELECT on publicly-browsable tables (policies already gate rows)
GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_media TO anon;
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.collections TO anon;
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT ON public.shipping_zones TO anon;
GRANT SELECT ON public.shipping_rates TO anon;
