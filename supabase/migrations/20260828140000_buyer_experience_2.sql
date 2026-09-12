-- Buyer Experience 2.0 — chat-first pivot.
-- Favorites, location cascade (region/city/area + GhanaPostGPS), fulfillment
-- choice (meet/shop/delivery) + payment terms (on/before delivery, escrow).
-- Cart system is DEAD in the UI; carts/cart_items tables stay but unused.

-- 1. Favorites ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites_select_own" ON public.favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "favorites_insert_own" ON public.favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "favorites_delete_own" ON public.favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. Location reference (region → city → area) --------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL,
  city text NOT NULL,
  area text,
  UNIQUE (region, city, area)
);
GRANT SELECT ON public.locations TO anon, authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locations_read_all" ON public.locations
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.locations (region, city, area) VALUES
  ('Greater Accra', 'Accra', 'Osu'),
  ('Greater Accra', 'Accra', 'Madina'),
  ('Greater Accra', 'Accra', 'Adenta'),
  ('Greater Accra', 'Accra', 'East Legon'),
  ('Greater Accra', 'Accra', 'Achimota'),
  ('Greater Accra', 'Accra', 'Kaneshie'),
  ('Greater Accra', 'Accra', 'Dansoman'),
  ('Greater Accra', 'Accra', 'Spintex'),
  ('Greater Accra', 'Tema', 'Community 1'),
  ('Greater Accra', 'Tema', 'Community 25'),
  ('Greater Accra', 'Madina', 'Central'),
  ('Greater Accra', 'Adenta', 'Central'),
  ('Ashanti', 'Kumasi', 'Adum'),
  ('Ashanti', 'Kumasi', 'Asafo'),
  ('Ashanti', 'Kumasi', 'KNUST'),
  ('Ashanti', 'Kumasi', 'Suame'),
  ('Ashanti', 'Obuasi', 'Central'),
  ('Central', 'Cape Coast', 'Kotokuraba'),
  ('Central', 'Winneba', 'Central'),
  ('Western', 'Takoradi', 'Market Circle'),
  ('Western', 'Sekondi', 'Central'),
  ('Eastern', 'Koforidua', 'Central'),
  ('Volta', 'Ho', 'Central'),
  ('Northern', 'Tamale', 'Central'),
  ('Upper East', 'Bolgatanga', 'Central'),
('Upper West', 'Wa', 'Central')
ON CONFLICT DO NOTHING;

-- 3. Store location cascade + payment terms + WhatsApp ------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS ghana_post_gps text,
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS payment_terms text[] NOT NULL DEFAULT ARRAY['pay_on_delivery']::text[];

-- 4. Orders: fulfillment + payment terms --------------------------------------
CREATE TYPE public.fulfillment_type AS ENUM ('meet_in_person', 'visit_shop', 'delivery');
CREATE TYPE public.payment_term AS ENUM ('pay_on_delivery', 'pay_before_delivery', 'escrow');

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_type public.fulfillment_type,
  ADD COLUMN IF NOT EXISTS payment_term public.payment_term;

-- Sellers create orders from chat (buyer keeps read access via buyer_id)
CREATE POLICY "orders_store_create" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (public.is_store_member(store_id, auth.uid()));

-- 5. Category seed: sub-categories for the top-level chips --------------------
INSERT INTO public.categories (slug, name, parent_id, position)
SELECT s.slug, s.name, p.id, s.pos
FROM (VALUES
  ('fashion-womens', 'Women''s', 'fashion', 1),
  ('fashion-mens', 'Men''s', 'fashion', 2),
  ('fashion-shoes', 'Shoes', 'fashion', 3),
  ('fashion-accessories', 'Accessories', 'fashion', 4),
  ('beauty-skincare', 'Skincare', 'beauty', 1),
  ('beauty-hair', 'Hair', 'beauty', 2),
  ('home-furniture', 'Furniture', 'home-living', 1),
  ('home-decor', 'Decor', 'home-living', 2),
  ('home-kitchen', 'Kitchen', 'home-living', 3),
  ('food-packaged', 'Packaged Food', 'food-drinks', 1),
  ('food-drinks-bottled', 'Drinks', 'food-drinks', 2),
  ('electronics-phones', 'Phones', 'electronics', 1),
  ('electronics-audio', 'Audio', 'electronics', 2),
  ('art-paintings', 'Paintings', 'art-crafts', 1),
  ('art-ceramics', 'Ceramics', 'art-crafts', 2),
  ('health-wellness', 'Wellness', 'health', 1),
  ('kids-clothing', 'Kids Clothing', 'kids', 1),
  ('kids-toys', 'Toys', 'kids', 2)
) AS s(slug, name, parent_slug, pos)
JOIN public.categories p ON p.slug = s.parent_slug
ON CONFLICT (slug) DO NOTHING;
