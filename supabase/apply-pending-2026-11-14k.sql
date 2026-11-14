-- apply-pending-2026-11-14k.sql — seller stories (WhatsApp-style 24h status)
-- + buyer social glue, and storage for story media.
--
-- 1) stories — a seller posts short photo/video "statuses" tied to their
--    store, optionally linking a product. Auto-expire after 24h like
--    WhatsApp status: every query filters expires_at > now(), so nothing
--    is ever deleted to "hide" old stories (a future cleanup job is
--    optional, not required).
-- 2) story_views — who watched what (PK pair = one view per viewer per
--    story). Sellers read counts for their stories; viewers read their own
--    rows so the tray ring can go "seen".
-- 3) story_reactions — one emoji per viewer per story (PK pair), publicly
--    countable so buyers see the love on a story.
-- 4) Story media uploads go into the EXISTING product-media bucket under
--    {storeId}/stories/… — the store-owner storage policies already cover
--    that path shape (first folder segment = owned store id), so no new
--    bucket or storage policy is needed.
--
-- Run as postgres (Dashboard → SQL Editor) once. Idempotent — same guard
-- style as the combined c→j stack.

-- ---------- tables ----------
CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  caption text,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Plain index — a partial WHERE expires_at > now() predicate is illegal
-- here: now() is STABLE and index predicates demand IMMUTABLE functions.
CREATE INDEX IF NOT EXISTS stories_store_idx
  ON public.stories (store_id, created_at);

CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS public.story_reactions (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '❤️',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

-- ---------- RLS ----------
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.stories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT SELECT ON public.story_reactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_reactions TO authenticated;

-- stories: anyone can watch; only the store's people can post/edit/delete
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stories' AND policyname='stories_public_read') THEN
    CREATE POLICY "stories_public_read" ON public.stories
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stories' AND policyname='stories_store_insert') THEN
    CREATE POLICY "stories_store_insert" ON public.stories
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_store_member(store_id, auth.uid())
        AND seller_id = auth.uid()
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stories' AND policyname='stories_store_update') THEN
    CREATE POLICY "stories_store_update" ON public.stories
      FOR UPDATE TO authenticated
      USING (public.is_store_member(store_id, auth.uid()))
      WITH CHECK (public.is_store_member(store_id, auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stories' AND policyname='stories_store_delete') THEN
    CREATE POLICY "stories_store_delete" ON public.stories
      FOR DELETE TO authenticated
      USING (public.is_store_member(store_id, auth.uid()));
  END IF;

  -- story_views: your own rows, plus a store's people reading who watched
  -- their stories (view counts on the dashboard)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_views' AND policyname='story_views_read') THEN
    CREATE POLICY "story_views_read" ON public.story_views
      FOR SELECT TO authenticated
      USING (
        viewer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.stories s
          WHERE s.id = story_views.story_id
            AND public.is_store_member(s.store_id, auth.uid())
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_views' AND policyname='story_views_self_insert') THEN
    CREATE POLICY "story_views_self_insert" ON public.story_views
      FOR INSERT TO authenticated
      WITH CHECK (
        viewer_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.stories s
          WHERE s.id = story_views.story_id
            AND s.expires_at > now()
        )
      );
  END IF;

  -- story_reactions: everyone sees counts, you own your reaction
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_reactions' AND policyname='story_reactions_public_read') THEN
    CREATE POLICY "story_reactions_public_read" ON public.story_reactions
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_reactions' AND policyname='story_reactions_self') THEN
    CREATE POLICY "story_reactions_self" ON public.story_reactions
      FOR ALL TO authenticated
      USING (viewer_id = auth.uid())
      WITH CHECK (viewer_id = auth.uid());
  END IF;
END $$;
