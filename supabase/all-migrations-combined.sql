
-- ============================================================
-- MIGRATION: 20260707094524_phase1_core.sql
-- ============================================================
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('buyer', 'seller', 'staff', 'admin');
CREATE TYPE public.store_status AS ENUM ('active', 'paused', 'suspended');
CREATE TYPE public.product_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'fulfilled', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE public.payment_status AS ENUM ('pending', 'success', 'failed', 'refunded');
CREATE TYPE public.payment_channel AS ENUM ('card', 'mobile_money', 'bank', 'ussd', 'qr', 'other');
CREATE TYPE public.channel_kind AS ENUM ('meta', 'tiktok', 'whatsapp');
CREATE TYPE public.channel_status AS ENUM ('disconnected', 'connected', 'error');
CREATE TYPE public.discount_type AS ENUM ('percentage', 'fixed', 'free_shipping');
CREATE TYPE public.store_member_role AS ENUM ('owner', 'manager', 'staff');

-- =========================================================
-- SHARED updated_at trigger fn
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'en',
  currency_pref TEXT NOT NULL DEFAULT 'GHS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- USER_ROLES + has_role
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========================================================
-- New-user trigger: profile + default buyer role
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'buyer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- STORES + members
-- =========================================================
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  currency TEXT NOT NULL DEFAULT 'GHS',
  country TEXT NOT NULL DEFAULT 'GH',
  status public.store_status NOT NULL DEFAULT 'active',
  paystack_public_key TEXT,
  paystack_subaccount_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_public_read_active" ON public.stores FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "stores_owner_all" ON public.stores FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "stores_admin_all" ON public.stores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX stores_owner_idx ON public.stores(owner_id);

CREATE TABLE public.store_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.store_member_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_members TO authenticated;
GRANT ALL ON public.store_members TO service_role;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_members_select_own" ON public.store_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));
CREATE POLICY "store_members_owner_manage" ON public.store_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));

-- Helper: is current user staff/owner of a store
CREATE OR REPLACE FUNCTION public.is_store_member(_store_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store_id AND s.owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.store_members m WHERE m.store_id = _store_id AND m.user_id = _user_id);
$$;

-- =========================================================
-- CATEGORIES + COLLECTIONS
-- =========================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  icon TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories_admin_write" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);
GRANT SELECT ON public.collections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collections_public_read" ON public.collections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "collections_store_manage" ON public.collections FOR ALL TO authenticated
  USING (public.is_store_member(store_id, auth.uid())) WITH CHECK (public.is_store_member(store_id, auth.uid()));
CREATE TRIGGER trg_collections_updated BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- PRODUCTS + VARIANTS + MEDIA
-- =========================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status public.product_status NOT NULL DEFAULT 'draft',
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  collection_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'GHS',
  weight_grams INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_public_read_active" ON public.products FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY "products_store_read_all" ON public.products FOR SELECT TO authenticated USING (public.is_store_member(store_id, auth.uid()));
CREATE POLICY "products_store_manage" ON public.products FOR ALL TO authenticated
  USING (public.is_store_member(store_id, auth.uid())) WITH CHECK (public.is_store_member(store_id, auth.uid()));
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX products_store_idx ON public.products(store_id);
CREATE INDEX products_category_idx ON public.products(category_id);
CREATE INDEX products_status_idx ON public.products(status);

CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT,
  title TEXT,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(12,2),
  inventory_qty INT NOT NULL DEFAULT 0,
  track_inventory BOOLEAN NOT NULL DEFAULT true,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "variants_public_read" ON public.product_variants FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'active'));
CREATE POLICY "variants_store_read" ON public.product_variants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_store_member(p.store_id, auth.uid())));
CREATE POLICY "variants_store_manage" ON public.product_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_store_member(p.store_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_store_member(p.store_id, auth.uid())));
CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX variants_product_idx ON public.product_variants(product_id);

CREATE TABLE public.product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT,
  kind TEXT NOT NULL DEFAULT 'image',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_media TO authenticated;
GRANT ALL ON public.product_media TO service_role;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media_public_read" ON public.product_media FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'active'));
CREATE POLICY "media_store_manage" ON public.product_media FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_store_member(p.store_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.is_store_member(p.store_id, auth.uid())));
CREATE INDEX media_product_idx ON public.product_media(product_id);

-- =========================================================
-- CARTS
-- =========================================================
CREATE TABLE public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT ALL ON public.carts TO service_role;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carts_own" ON public.carts FOR ALL TO authenticated
  USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);
CREATE TRIGGER trg_carts_updated BEFORE UPDATE ON public.carts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart_items_own" ON public.cart_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.buyer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.buyer_id = auth.uid()));

-- =========================================================
-- ORDERS
-- =========================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL UNIQUE DEFAULT ('SL' || to_char(now(), 'YYMMDD') || lpad(floor(random()*100000)::text, 5, '0')),
  status public.order_status NOT NULL DEFAULT 'pending',
  currency TEXT NOT NULL DEFAULT 'GHS',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  contact_email TEXT,
  contact_phone TEXT,
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_buyer_read" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = buyer_id);
CREATE POLICY "orders_buyer_create" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = buyer_id);
CREATE POLICY "orders_store_read" ON public.orders FOR SELECT TO authenticated USING (public.is_store_member(store_id, auth.uid()));
CREATE POLICY "orders_store_manage" ON public.orders FOR UPDATE TO authenticated USING (public.is_store_member(store_id, auth.uid()));
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX orders_store_idx ON public.orders(store_id);
CREATE INDEX orders_buyer_idx ON public.orders(buyer_id);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_title TEXT NOT NULL,
  variant_title TEXT,
  sku TEXT,
  quantity INT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR public.is_store_member(o.store_id, auth.uid()))));
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()));

CREATE TABLE public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_events_read" ON public.order_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR public.is_store_member(o.store_id, auth.uid()))));

-- =========================================================
-- PAYMENTS
-- =========================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paystack',
  reference TEXT NOT NULL UNIQUE,
  status public.payment_status NOT NULL DEFAULT 'pending',
  channel public.payment_channel,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_read" ON public.payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR public.is_store_member(o.store_id, auth.uid()))));
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- SHIPPING
-- =========================================================
CREATE TABLE public.shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  regions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_zones TO authenticated;
GRANT ALL ON public.shipping_zones TO service_role;
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_zones_read" ON public.shipping_zones FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shipping_zones_manage" ON public.shipping_zones FOR ALL TO authenticated
  USING (public.is_store_member(store_id, auth.uid())) WITH CHECK (public.is_store_member(store_id, auth.uid()));

CREATE TABLE public.shipping_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.shipping_zones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  eta_days_min INT,
  eta_days_max INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_rates TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_rates TO authenticated;
GRANT ALL ON public.shipping_rates TO service_role;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_rates_read" ON public.shipping_rates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "shipping_rates_manage" ON public.shipping_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.shipping_zones z WHERE z.id = zone_id AND public.is_store_member(z.store_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.shipping_zones z WHERE z.id = zone_id AND public.is_store_member(z.store_id, auth.uid())));

-- =========================================================
-- DISCOUNTS
-- =========================================================
CREATE TABLE public.discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  type public.discount_type NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_subtotal NUMERIC(12,2),
  usage_limit INT,
  used_count INT NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discounts TO authenticated;
GRANT ALL ON public.discounts TO service_role;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discounts_store_manage" ON public.discounts FOR ALL TO authenticated
  USING (public.is_store_member(store_id, auth.uid())) WITH CHECK (public.is_store_member(store_id, auth.uid()));
CREATE TRIGGER trg_discounts_updated BEFORE UPDATE ON public.discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- REVIEWS
-- =========================================================
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INT NOT NULL,
  body TEXT,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT TO anon, authenticated USING (approved = true);
CREATE POLICY "reviews_own_manage" ON public.reviews FOR ALL TO authenticated
  USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);
CREATE TRIGGER trg_reviews_updated BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- SOCIAL CHANNELS
-- =========================================================
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind public.channel_kind NOT NULL,
  status public.channel_status NOT NULL DEFAULT 'disconnected',
  external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels_store_manage" ON public.channels FOR ALL TO authenticated
  USING (public.is_store_member(store_id, auth.uid())) WITH CHECK (public.is_store_member(store_id, auth.uid()));
CREATE TRIGGER trg_channels_updated BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.channel_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.channel_syncs TO authenticated;
GRANT ALL ON public.channel_syncs TO service_role;
ALTER TABLE public.channel_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channel_syncs_store_read" ON public.channel_syncs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.channels c WHERE c.id = channel_id AND public.is_store_member(c.store_id, auth.uid())));
CREATE TRIGGER trg_channel_syncs_updated BEFORE UPDATE ON public.channel_syncs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- GROWTH
-- =========================================================
CREATE TABLE public.abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  buyer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_token TEXT NOT NULL UNIQUE,
  last_notified_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.abandoned_carts TO authenticated;
GRANT ALL ON public.abandoned_carts TO service_role;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abandoned_carts_own_read" ON public.abandoned_carts FOR SELECT TO authenticated USING (auth.uid() = buyer_id);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.ai_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  input JSONB,
  output JSONB,
  tokens_used INT,
  cost_usd NUMERIC(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_generations TO authenticated;
GRANT ALL ON public.ai_generations TO service_role;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_gen_store_read" ON public.ai_generations FOR SELECT TO authenticated
  USING (store_id IS NULL OR public.is_store_member(store_id, auth.uid()));

-- =========================================================
-- SEED: Ghana categories
-- =========================================================
INSERT INTO public.categories (slug, name, icon, position) VALUES
  ('fashion', 'Fashion', 'shirt', 1),
  ('beauty', 'Beauty & Care', 'sparkles', 2),
  ('home', 'Home & Living', 'home', 3),
  ('electronics', 'Electronics', 'laptop', 4),
  ('food', 'Food & Drinks', 'coffee', 5),
  ('art', 'Art & Craft', 'palette', 6),
  ('jewelry', 'Jewelry', 'gem', 7),
  ('kids', 'Kids & Baby', 'baby', 8);

-- ============================================================
-- MIGRATION: 20260707094558_lockdown_helpers.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid, uuid) TO service_role;

-- ============================================================
-- MIGRATION: 20260707094706_stores_owner_nullable.sql
-- ============================================================
ALTER TABLE public.stores ALTER COLUMN owner_id DROP NOT NULL;

-- ============================================================
-- MIGRATION: 20260707094741_demo_seed.sql
-- ============================================================
DO $$
DECLARE
  s1 UUID; s2 UUID; s3 UUID; s4 UUID;
  cat_fashion UUID; cat_home UUID; cat_beauty UUID;
  p UUID;
BEGIN
  SELECT id INTO cat_fashion FROM public.categories WHERE slug='fashion';
  SELECT id INTO cat_home FROM public.categories WHERE slug='home';
  SELECT id INTO cat_beauty FROM public.categories WHERE slug='beauty';

  INSERT INTO public.stores (owner_id, slug, name, tagline, description, logo_url, banner_url, currency, country, status)
  VALUES (NULL, 'adinkra-studio', 'Adinkra Studio', 'Modern heritage textiles', 'Handwoven kente reimagined for the everyday.', 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200&h=200&fit=crop', 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=1200&h=600&fit=crop', 'GHS', 'GH', 'active') RETURNING id INTO s1;
  INSERT INTO public.stores (owner_id, slug, name, tagline, description, logo_url, banner_url, currency, country, status)
  VALUES (NULL, 'accra-home', 'Accra Home', 'Objects for a warmer home', 'Ceramics, brass, and woven pieces made in Ghana.', 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=200&h=200&fit=crop', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&h=600&fit=crop', 'GHS', 'GH', 'active') RETURNING id INTO s2;
  INSERT INTO public.stores (owner_id, slug, name, tagline, description, logo_url, banner_url, currency, country, status)
  VALUES (NULL, 'ama-beauty', 'Ama Beauty', 'Shea, soap & scent', 'Small-batch beauty rooted in West African botanicals.', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=200&h=200&fit=crop', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&h=600&fit=crop', 'GHS', 'GH', 'active') RETURNING id INTO s3;
  INSERT INTO public.stores (owner_id, slug, name, tagline, description, logo_url, banner_url, currency, country, status)
  VALUES (NULL, 'kente-and-co', 'Kente & Co', 'Wearable craft, ships worldwide', 'Contemporary silhouettes in traditional cloth.', 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=200&fit=crop', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&h=600&fit=crop', 'GHS', 'GH', 'active') RETURNING id INTO s4;

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s1, 'kente-scarf-obaa', 'Obaa Kente Scarf', 'Hand-loomed cotton kente scarf in indigo and gold.', 'active', cat_fashion, ARRAY['scarf','kente'], 320, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, 'One size', 320, 12);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1601924582970-9238bcb495d9?w=800&h=1000&fit=crop', 'Kente scarf', 0);

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s1, 'agbada-linen', 'Agbada Linen Set', 'Contemporary agbada in soft-washed linen.', 'active', cat_fashion, ARRAY['agbada','linen'], 1450, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, 'M', 1450, 5);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1596993100471-c3905dafa78e?w=800&h=1000&fit=crop', 'Agbada linen', 0);

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s2, 'brass-candlestick', 'Sanko Brass Candlestick', 'Hand-cast brass, patinated by the sun.', 'active', cat_home, ARRAY['brass','candle'], 480, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, 'Tall', 480, 8);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800&h=1000&fit=crop', 'Brass candlestick', 0);

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s2, 'clay-bowl', 'Volta Clay Bowl', 'Wheel-thrown clay bowl from the Volta region.', 'active', cat_home, ARRAY['clay','ceramic'], 220, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, 'Medium', 220, 20);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800&h=1000&fit=crop', 'Clay bowl', 0);

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s3, 'shea-butter-jar', 'Raw Shea Butter Jar', 'Unrefined, cold-pressed shea from northern Ghana.', 'active', cat_beauty, ARRAY['shea','skincare'], 95, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, '250g', 95, 40);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800&h=1000&fit=crop', 'Shea butter jar', 0);

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s3, 'black-soap-bar', 'Alata Black Soap', 'Traditional plantain-ash black soap, hand-cut.', 'active', cat_beauty, ARRAY['soap'], 45, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, 'Bar', 45, 60);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=800&h=1000&fit=crop', 'Black soap', 0);

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s4, 'kente-blazer', 'Ohemaa Kente Blazer', 'Tailored blazer in bespoke kente strip.', 'active', cat_fashion, ARRAY['blazer','kente'], 1890, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, 'M', 1890, 3);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&h=1000&fit=crop', 'Kente blazer', 0);

  INSERT INTO public.products (store_id, slug, title, description, status, category_id, tags, base_price, currency)
  VALUES (s4, 'clutch-bag', 'Ntoma Clutch Bag', 'Structured clutch wrapped in wax-print cotton.', 'active', cat_fashion, ARRAY['bag','clutch'], 380, 'GHS') RETURNING id INTO p;
  INSERT INTO public.product_variants (product_id, title, price, inventory_qty) VALUES (p, 'One size', 380, 15);
  INSERT INTO public.product_media (product_id, url, alt, position) VALUES (p, 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&h=1000&fit=crop', 'Clutch bag', 0);
END $$;

-- ============================================================
-- MIGRATION: 20260708075541_re_expose_helpers.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 20260708075641_storage_buckets.sql
-- ============================================================
-- Public read
CREATE POLICY "Public can view product-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-media');

CREATE POLICY "Public can view store-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-assets');

-- Sellers write to their store folder (first path segment = store id owned by user)
CREATE POLICY "Store owners upload product-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-media'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners update product-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners delete product-media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-media'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners upload store-assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners update store-assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

CREATE POLICY "Store owners delete store-assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id::text = (storage.foldername(name))[1] AND s.owner_id = auth.uid())
  );

-- ============================================================
-- MIGRATION: 20260709084044_add_rider_role.sql
-- ============================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rider';

-- ============================================================
-- MIGRATION: 20260709084154_phase2_seller_first.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 20260828120000_admin_console.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 20260828140000_buyer_experience_2.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 20260828150000_storage_buckets_create.sql
-- ============================================================
-- Storage buckets: the Lovable-era migration created only the RLS policies —
-- the buckets themselves existed in the Lovable dashboard. On a fresh
-- Supabase project they must be created explicitly or uploads fail with
-- "Bucket not found". product-media + store-assets are public-read (their
-- policies are public SELECT); chat-attachments is private (signed URLs).

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('product-media', 'product-media', true),
  ('store-assets', 'store-assets', true),
  ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MIGRATION: 20260829100000_review_grants_policies.sql
-- ============================================================
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

-- ============================================================
-- MIGRATION: 20260829110000_conversations_unique.sql
-- ============================================================
-- Review fix: prevent duplicate conversations for the same product.
-- The Message-seller button had a double-click race (two inserts). The app
-- now guards in-UI, and this unique index is the DB-level backstop.
-- Dedupe first (keep the oldest thread), then enforce.

DELETE FROM public.conversations a
USING public.conversations b
WHERE a.buyer_id = b.buyer_id
  AND a.product_id IS NOT DISTINCT FROM b.product_id
  AND a.store_id = b.store_id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_unique_buyer_product
  ON public.conversations (buyer_id, store_id, product_id)
  WHERE product_id IS NOT NULL;
