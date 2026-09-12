-- =========================================================
-- Phase 2: Seller-first marketplace schema (main)
-- =========================================================

DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('own', 'affiliate_internal', 'affiliate_external');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS type public.product_type NOT NULL DEFAULT 'own',
  ADD COLUMN IF NOT EXISTS allow_affiliates boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affiliate_commission_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(8,3),
  ADD COLUMN IF NOT EXISTS dimensions jsonb;

INSERT INTO public.categories (name, slug)
VALUES
  ('Fashion', 'fashion'),
  ('Beauty', 'beauty'),
  ('Electronics', 'electronics'),
  ('Home & Living', 'home-living'),
  ('Food & Drinks', 'food-drinks'),
  ('Services', 'services'),
  ('Digital', 'digital'),
  ('Health', 'health'),
  ('Kids', 'kids'),
  ('Art & Crafts', 'art-crafts')
ON CONFLICT (slug) DO NOTHING;

-- Affiliate listings
CREATE TABLE IF NOT EXISTS public.affiliate_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  custom_title text,
  custom_price numeric(12,2),
  commission_pct numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (affiliate_user_id, source_product_id)
);
GRANT SELECT ON public.affiliate_listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.affiliate_listings TO authenticated;
GRANT ALL ON public.affiliate_listings TO service_role;
ALTER TABLE public.affiliate_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Affiliate listings public when active"
  ON public.affiliate_listings FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "Affiliates manage their own listings"
  ON public.affiliate_listings FOR ALL TO authenticated
  USING (auth.uid() = affiliate_user_id) WITH CHECK (auth.uid() = affiliate_user_id);
CREATE TRIGGER affiliate_listings_set_updated_at BEFORE UPDATE ON public.affiliate_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_listing_id uuid NOT NULL REFERENCES public.affiliate_listings(id) ON DELETE CASCADE,
  visitor_id text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.affiliate_clicks TO anon, authenticated;
GRANT SELECT ON public.affiliate_clicks TO authenticated;
GRANT ALL ON public.affiliate_clicks TO service_role;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone logs affiliate click"
  ON public.affiliate_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Affiliate sees own clicks"
  ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.affiliate_listings al
                 WHERE al.id = affiliate_listing_id AND al.affiliate_user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_listing_id uuid NOT NULL REFERENCES public.affiliate_listings(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.affiliate_conversions TO authenticated;
GRANT ALL ON public.affiliate_conversions TO service_role;
ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Affiliate sees own conversions"
  ON public.affiliate_conversions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.affiliate_listings al
                 WHERE al.id = affiliate_listing_id AND al.affiliate_user_id = auth.uid()));

-- Conversations & messages
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_buyer integer NOT NULL DEFAULT 0,
  unread_seller integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_buyer_idx ON public.conversations(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_seller_idx ON public.conversations(seller_id, last_message_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE POLICY "Buyer starts a conversation"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "Participants update conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
CREATE TRIGGER conversations_set_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  CREATE TYPE public.message_kind AS ENUM ('text', 'image', 'system_order', 'system_delivery', 'ai_draft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind public.message_kind NOT NULL DEFAULT 'text',
  body text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON public.messages(conversation_id, created_at);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c
                 WHERE c.id = conversation_id
                   AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id)));
CREATE POLICY "Participants send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id))
    AND (sender_id IS NULL OR sender_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.touch_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        unread_buyer  = CASE WHEN NEW.sender_id = buyer_id  THEN unread_buyer  ELSE unread_buyer  + 1 END,
        unread_seller = CASE WHEN NEW.sender_id = seller_id THEN unread_seller ELSE unread_seller + 1 END,
        updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.touch_conversation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER messages_touch_conversation AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation();

-- Riders
CREATE TABLE IF NOT EXISTS public.riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_type text NOT NULL DEFAULT 'motorbike',
  license_plate text,
  phone text,
  current_lat numeric(9,6),
  current_lng numeric(9,6),
  is_online boolean NOT NULL DEFAULT false,
  is_approved boolean NOT NULL DEFAULT false,
  rating numeric(3,2) NOT NULL DEFAULT 5.0,
  completed_deliveries integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.riders TO anon, authenticated;
GRANT INSERT, UPDATE ON public.riders TO authenticated;
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Riders readable to anyone"
  ON public.riders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users create their own rider profile"
  ON public.riders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own rider profile"
  ON public.riders FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER riders_set_updated_at BEFORE UPDATE ON public.riders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Delivery requests + events
DO $$ BEGIN
  CREATE TYPE public.delivery_status AS ENUM ('open', 'assigned', 'picked_up', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.delivery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pickup_address text,
  dropoff_address text,
  pickup_lat numeric(9,6),
  pickup_lng numeric(9,6),
  dropoff_lat numeric(9,6),
  dropoff_lng numeric(9,6),
  distance_km numeric(6,2),
  offered_fee numeric(12,2) NOT NULL DEFAULT 0,
  status public.delivery_status NOT NULL DEFAULT 'open',
  rider_id uuid REFERENCES public.riders(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_requests_status_idx ON public.delivery_requests(status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.delivery_requests TO authenticated;
GRANT ALL ON public.delivery_requests TO service_role;
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read delivery requests"
  ON public.delivery_requests FOR SELECT TO authenticated
  USING (
    status = 'open'
    OR public.is_store_member(store_id, auth.uid())
    OR buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid())
  );
CREATE POLICY "Store members create delivery requests"
  ON public.delivery_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_store_member(store_id, auth.uid()));
CREATE POLICY "Rider or store updates delivery"
  ON public.delivery_requests FOR UPDATE TO authenticated
  USING (
    public.is_store_member(store_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid())
    OR (status = 'open' AND public.has_role(auth.uid(), 'rider'))
  );
CREATE TRIGGER delivery_requests_set_updated_at BEFORE UPDATE ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  status public.delivery_status NOT NULL,
  lat numeric(9,6),
  lng numeric(9,6),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_events_dr_idx ON public.delivery_events(delivery_request_id, created_at);
GRANT SELECT, INSERT ON public.delivery_events TO authenticated;
GRANT ALL ON public.delivery_events TO service_role;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read delivery events with parent"
  ON public.delivery_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.delivery_requests dr
                 WHERE dr.id = delivery_request_id
                   AND (public.is_store_member(dr.store_id, auth.uid())
                        OR dr.buyer_id = auth.uid()
                        OR EXISTS (SELECT 1 FROM public.riders r WHERE r.id = dr.rider_id AND r.user_id = auth.uid()))));
CREATE POLICY "Rider or store inserts delivery events"
  ON public.delivery_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.delivery_requests dr
                      WHERE dr.id = delivery_request_id
                        AND (public.is_store_member(dr.store_id, auth.uid())
                             OR EXISTS (SELECT 1 FROM public.riders r WHERE r.id = dr.rider_id AND r.user_id = auth.uid()))));

-- AI insights
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  action_url text,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_insights_store_idx ON public.ai_insights(store_id, created_at DESC);
GRANT SELECT, UPDATE ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store members read insights"
  ON public.ai_insights FOR SELECT TO authenticated
  USING (public.is_store_member(store_id, auth.uid()));
CREATE POLICY "Store members dismiss insights"
  ON public.ai_insights FOR UPDATE TO authenticated
  USING (public.is_store_member(store_id, auth.uid()));

-- Realtime
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_requests; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage: chat-attachments (participants only) — path <conversation_id>/<file>
CREATE POLICY "Chat attachments: participants read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND EXISTS (SELECT 1 FROM public.conversations c
                WHERE c.id::text = split_part(name, '/', 1)
                  AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id))
  );
CREATE POLICY "Chat attachments: participants upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND EXISTS (SELECT 1 FROM public.conversations c
                WHERE c.id::text = split_part(name, '/', 1)
                  AND (auth.uid() = c.buyer_id OR auth.uid() = c.seller_id))
  );
