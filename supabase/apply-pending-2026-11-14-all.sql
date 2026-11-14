-- apply-pending-2026-11-14-all.sql — the full c→j stack, re-runnable
--
-- Combines every pending migration from 2026-11-14 (c..j) into one script
-- that can be pasted as many times as needed: column adds use IF NOT
-- EXISTS, functions are CREATE OR REPLACE, triggers/policies DROP-then-
-- CREATE or are wrapped in DO blocks (Postgres has no CREATE POLICY IF
-- NOT EXISTS, so bare CREATE POLICY is never emitted).
--
-- State note: the first paste of this stack applied c–g before dying on a
-- malformed line in h (fixed); everything here therefore no-ops or
-- completes cleanly on any starting state.

-- ---------- c — chat presence: last-seen heartbeat ----------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_self_update'
  ) THEN
    CREATE POLICY profiles_self_update ON profiles
      FOR UPDATE TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- ---------- d — buyer names in the seller inbox ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_conversation_participants_select'
  ) THEN
    CREATE POLICY "profiles_conversation_participants_select" ON public.profiles
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE (c.buyer_id = profiles.id AND c.seller_id = auth.uid())
           OR (c.seller_id = profiles.id AND c.buyer_id = auth.uid())
      )
    );
  END IF;
END $$;

-- ---------- e — sellers can delete their own orders ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_store_delete'
  ) THEN
    CREATE POLICY "orders_store_delete" ON public.orders
    FOR DELETE TO authenticated
    USING (public.is_store_member(store_id, auth.uid()));
  END IF;
END $$;

-- ---------- f — order item lines for chat-created orders ----------
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND (o.buyer_id = auth.uid() OR public.is_store_member(o.store_id, auth.uid()))
  )
);

INSERT INTO public.order_items (order_id, variant_id, product_title, quantity, unit_price, total)
SELECT o.id,
       (SELECT pv.id FROM public.product_variants pv WHERE pv.product_id = c.product_id LIMIT 1),
       COALESCE(p.title, 'Order'),
       1,
       o.total,
       o.total
FROM public.orders o
JOIN public.conversations c ON c.order_id = o.id
LEFT JOIN public.products p ON p.id = c.product_id
WHERE o.source = 'chat'
  AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id);

-- ---------- g — AI proposals, price floors, persona ----------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_min_price NUMERIC(12,2);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_price_limit NUMERIC(12,2);
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_name TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_greeting TEXT;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS ai_persona TEXT;
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

-- ---------- h — reviews: verified purchases only ----------
CREATE OR REPLACE FUNCTION public.has_purchased(p_product uuid, p_buyer uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.products p ON p.id = p_product
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE o.buyer_id = p_buyer
      AND o.status <> 'cancelled'
      AND (
        pv.product_id = p.id
        OR (oi.variant_id IS NULL AND oi.product_title = p.title AND o.store_id = p.store_id)
      )
  );
$$;

DROP POLICY IF EXISTS "reviews_own_manage" ON public.reviews;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = 'reviews_buyers_insert'
  ) THEN
    CREATE POLICY "reviews_buyers_insert" ON public.reviews
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = buyer_id
        AND public.has_purchased(product_id, auth.uid())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = 'reviews_buyers_update'
  ) THEN
    CREATE POLICY "reviews_buyers_update" ON public.reviews
      FOR UPDATE TO authenticated
      USING (auth.uid() = buyer_id)
      WITH CHECK (
        auth.uid() = buyer_id
        AND public.has_purchased(product_id, auth.uid())
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' AND policyname = 'reviews_own_delete'
  ) THEN
    CREATE POLICY "reviews_own_delete" ON public.reviews
      FOR DELETE TO authenticated
      USING (auth.uid() = buyer_id);
  END IF;
END $$;

-- ---------- i — buyer plans + AI insight metering ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'shopper';

CREATE OR REPLACE FUNCTION public.guard_profile_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_plan ON public.profiles;
CREATE TRIGGER trg_guard_profile_plan
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_plan();

CREATE TABLE IF NOT EXISTS public.ai_insight_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  used int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.ai_insight_usage ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.ai_insight_usage TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_insight_usage' AND policyname = 'ai_usage_self'
  ) THEN
    CREATE POLICY "ai_usage_self" ON public.ai_insight_usage
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ---------- j — buyer cancel + delete on /orders ----------
CREATE OR REPLACE FUNCTION public.cancel_order_by_buyer(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id AND buyer_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be cancelled here — paid orders go through the seller';
  END IF;
  UPDATE public.orders SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_order_by_buyer(uuid) TO authenticated;

DROP POLICY IF EXISTS "orders_buyer_delete" ON public.orders;
CREATE POLICY "orders_buyer_delete" ON public.orders
  FOR DELETE TO authenticated
  USING (auth.uid() = buyer_id AND status IN ('pending', 'cancelled'));

-- To grant Premium to a buyer until billing is live:
--   UPDATE public.profiles SET plan = 'premium' WHERE id = '<user uuid>';

-- ---------- k — seller stories (WhatsApp-style 24h status) + buyer social ----------
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

CREATE INDEX IF NOT EXISTS stories_store_active_idx
  ON public.stories (store_id, created_at)
  WHERE expires_at > now();

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

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.stories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT SELECT ON public.story_reactions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_reactions TO authenticated;

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
