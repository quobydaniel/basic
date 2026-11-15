-- apply-pending-2026-11-15-shorts.sql — storefront Shorts: persistent
-- short-form ads/videos sellers post about their store and products.
--
-- Unlike stories (24h statuses), shorts STAY UP — they are the store's
-- permanent showreel, played from the storefront's Shorts tab. Media
-- uploads go into the EXISTING product-media bucket under
-- {storeId}/shorts/… (first path segment = owned store id, covered by
-- the existing store-owner storage policies — no new bucket/policy).
--
-- 1) shorts — one row per short (video or image), optionally linking a
--    product so the viewer gets a "View product" chip.
-- 2) short_views — one view per viewer per short (PK pair), so the
--    seller dashboard can show view counts. Anonymous watching works;
--    only signed-in viewers are counted.
-- 3) short_likes — one like per viewer per short (PK pair), YouTube-
--    Shorts-style like with a toggle (insert/delete).
-- 4) store_short_stats(p_store) — SECURITY DEFINER counts (views +
--    likes per short) so the public feed can show numbers without
--    exposing viewer identity rows.
--
-- Run as postgres (Dashboard → SQL Editor) once. Idempotent — same guard
-- style as the c→k stack.

-- ---------- tables ----------
CREATE TABLE IF NOT EXISTS public.shorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caption text,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'video' CHECK (media_type IN ('image', 'video')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shorts_store_idx
  ON public.shorts (store_id, created_at);

CREATE TABLE IF NOT EXISTS public.short_views (
  short_id uuid NOT NULL REFERENCES public.shorts(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (short_id, viewer_id)
);

-- ---------- RLS ----------
ALTER TABLE public.shorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_views ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.shorts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shorts TO authenticated;
GRANT SELECT, INSERT ON public.short_views TO authenticated;

-- shorts: anyone can watch; only the store's people can post/edit/delete
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shorts' AND policyname='shorts_public_read') THEN
    CREATE POLICY "shorts_public_read" ON public.shorts
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shorts' AND policyname='shorts_store_insert') THEN
    CREATE POLICY "shorts_store_insert" ON public.shorts
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_store_member(store_id, auth.uid())
        AND seller_id = auth.uid()
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shorts' AND policyname='shorts_store_update') THEN
    CREATE POLICY "shorts_store_update" ON public.shorts
      FOR UPDATE TO authenticated
      USING (public.is_store_member(store_id, auth.uid()))
      WITH CHECK (public.is_store_member(store_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='shorts' AND policyname='shorts_store_delete') THEN
    CREATE POLICY "shorts_store_delete" ON public.shorts
      FOR DELETE TO authenticated
      USING (public.is_store_member(store_id, auth.uid()));
  END IF;

  -- short_views: your own rows, plus the store's people reading who
  -- watched (the view counts on the seller dashboard)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='short_views' AND policyname='short_views_read') THEN
    CREATE POLICY "short_views_read" ON public.short_views
      FOR SELECT TO authenticated
      USING (
        viewer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.shorts sh
          WHERE sh.id = short_views.short_id
            AND public.is_store_member(sh.store_id, auth.uid())
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='short_views' AND policyname='short_views_self_insert') THEN
    CREATE POLICY "short_views_self_insert" ON public.short_views
      FOR INSERT TO authenticated
      WITH CHECK (viewer_id = auth.uid());
  END IF;
END $$;

-- ---------- likes (YouTube-Shorts style toggle) ----------
CREATE TABLE IF NOT EXISTS public.short_likes (
  short_id uuid NOT NULL REFERENCES public.shorts(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (short_id, viewer_id)
);

ALTER TABLE public.short_likes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.short_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.short_likes TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='short_likes' AND policyname='short_likes_public_read') THEN
    CREATE POLICY "short_likes_public_read" ON public.short_likes
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='short_likes' AND policyname='short_likes_self_insert') THEN
    CREATE POLICY "short_likes_self_insert" ON public.short_likes
      FOR INSERT TO authenticated
      WITH CHECK (viewer_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='short_likes' AND policyname='short_likes_self_delete') THEN
    CREATE POLICY "short_likes_self_delete" ON public.short_likes
      FOR DELETE TO authenticated
      USING (viewer_id = auth.uid());
  END IF;
END $$;

-- ---------- public stats (counts only, never identity rows) ----------
-- One call gives the feed and the dashboard every short's view + like
-- counts. SECURITY DEFINER so anon buyers get numbers without any
-- SELECT on the identity-bearing tables.
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

GRANT EXECUTE ON FUNCTION public.store_short_stats(uuid) TO anon, authenticated;
