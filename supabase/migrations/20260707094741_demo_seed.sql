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
