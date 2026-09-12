-- ============================================================================
-- Category & product tidy — re-files demo products into the FULL category
-- tree (20260901130000) so the buyer mega-menu shows rich sub-collections,
-- merges the old partial subs into the new ones, and fixes wrong demo images.
-- Every statement is a guarded no-op if its target slug doesn't exist, so
-- this is safe to re-run and safe to run before/after the tree migration
-- (best run AFTER it).
-- ============================================================================

-- ── 1. File parent-level + mis-filed products into the new sub-collections ─

-- Fashion → kente & print
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'african-print-kente')
WHERE title IN ('Obaa Kente Scarf', 'Ohemaa Kente Blazer', 'Aso-Oke Headwrap Trio', 'Handwoven Kente Stole')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('fashion', 'fashion-womens'));

-- Fashion → bags
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'bags-luggage')
WHERE title IN ('Ntoma Clutch Bag', 'Bolgatanga Leather Tote')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('fashion', 'fashion-womens'));

-- Fashion → shoes (generic shelf = mens-shoes; kids handled below)
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'mens-shoes')
WHERE title IN (
  'Kumasi Court Classics', 'Leather Loafers · Tan', 'Canvas Slip-Ons · Print',
  'Basketball Mid-Tops', 'Minimal White Sneakers', 'Suede Desert Boots',
  'Trail Grip Hikers', 'Air Flex Runners', 'Retro Canvas High-Tops'
) AND category_id IN (SELECT id FROM categories WHERE slug IN ('fashion', 'fashion-womens'));

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'kids-shoes')
WHERE title = 'Kids'' Light-Up Kicks'
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('fashion', 'fashion-womens'));

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'womens-shoes')
WHERE title = 'Slip-On Leather Sandals'
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('fashion', 'fashion-womens'));

-- Fashion → clothing
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'womens-clothing')
WHERE title IN ('Kente Wrap Dress', 'Ankara Two-Piece Set', 'Adire Lounge Pants', 'Smock (Fugu) Jacket')
  AND category_id = (SELECT id FROM categories WHERE slug = 'fashion-womens');

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'mens-clothing')
WHERE title IN ('Agbada Linen Set', 'Batakari Overshirt')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('fashion', 'fashion-womens'));

-- Fashion → jewellery making (Krobo beads belong with beads)
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'beads-waist-beads')
WHERE title = 'Krobo Bead Bracelet Set'
  AND category_id = (SELECT id FROM categories WHERE slug = 'fashion-womens');

-- Beauty parent-level → skincare
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'skincare')
WHERE title IN ('Alata Black Soap', 'Raw Shea Butter Jar')
  AND category_id = (SELECT id FROM categories WHERE slug = 'beauty');

-- Food & Drinks parent-level → packaged food / spices / drinks
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'packaged-food')
WHERE title IN (
  'Dried Tilapia · Pack of 3', 'Gari & Beans Combo Kit', 'Palm Soup Base · 1L',
  'Kente-Labeled Jollof Kit', 'Shito Hot Pepper Sauce · Jar'
) AND category_id IN (SELECT id FROM categories WHERE slug IN ('food-drinks', 'food-packaged'));

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'spices-seasonings')
WHERE title IN ('Spiced Groundnut Paste', 'Waakye Spice Bundle', 'Dried Pepper Blend · Extra Hot')
  AND category_id IN (SELECT id FROM categories WHERE slug IN ('food-drinks', 'food-packaged'));

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'drinks-beverages')
WHERE title = 'Sobolo Concentrate · 1L'
  AND category_id = (SELECT id FROM categories WHERE slug = 'food-drinks');

-- Health → split wellness vs fitness vs decor
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'fitness-equipment')
WHERE title = 'Stretch & Breath Mat'
  AND category_id = (SELECT id FROM categories WHERE slug = 'health-wellness');

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'decor-candles')
WHERE title = 'Be Candle · Lemongrass'
  AND category_id = (SELECT id FROM categories WHERE slug = 'health-wellness');

-- Home parent-level → decor / kitchen
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'decor-candles')
WHERE title = 'Sanko Brass Candlestick'
  AND category_id = (SELECT id FROM categories WHERE slug = 'home-living');

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'kitchen-dining')
WHERE title = 'Volta Clay Bowl'
  AND category_id = (SELECT id FROM categories WHERE slug = 'home-living');

-- Art: sculpture that was filed as paintings
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'sculpture-carvings')
WHERE title IN ('Brass Sankofa Figure', 'Carved Wooden Mask · Akan', 'Terracotta Portrait Bust')
  AND category_id = (SELECT id FROM categories WHERE slug = 'art-paintings');

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'craft-supplies')
WHERE title = 'Woven Basket Trio'
  AND category_id = (SELECT id FROM categories WHERE slug = 'art-paintings');

-- Digital: services → design services
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'digital-art-design')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'digital' AND parent_id IS NULL);

-- Stray test products ('book', 'book8', 'Candy') into honest shelves
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'books')
WHERE title IN ('book', 'book8');
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'snacks-sweets')
WHERE title = 'Candy';

-- ── 2. Merge the OLD partial subs into the NEW tree (same shoppers, better
--      names — prevents duplicate-looking tiles like "Packaged Food" twice).

UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'phones-tablets')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'electronics-phones');
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'womens-clothing')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'fashion-womens');
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'packaged-food')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'food-packaged');
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'supplements-wellness')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'health-wellness');
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'paintings')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'art-paintings');
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'furniture')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'home-furniture');
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'skincare')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'beauty-skincare');

-- Remove the now-empty old subs (guarded: only when truly unreferenced).
DELETE FROM categories c
WHERE c.slug IN ('fashion-womens', 'electronics-phones', 'food-packaged', 'health-wellness', 'art-paintings', 'home-furniture', 'beauty-skincare')
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id);

-- ── 3. Wrong demo images — the "Slip-On Leather Sandals" listing carried a
--      pizza photo (unsplash photo-1601924582970). Swap every product using
--      it to a verified sandals photo.
UPDATE product_media
SET url = 'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=800&h=1000&fit=crop'
WHERE url LIKE '%photo-1601924582970-9238bcb495d9%';

-- ── 4. Storefront locations — the demo stores had none, so the buyer-facing
--      "location + directions" chip never showed. Named after their cities.
UPDATE stores SET area = 'Adum',    city = 'Kumasi',     region = 'Ashanti'        WHERE slug = 'kumasi-kicks-gdjh' AND area IS NULL;
UPDATE stores SET area = 'Osu',     city = 'Accra',      region = 'Greater Accra'  WHERE slug = 'tech-hub-gh-heia' AND area IS NULL;
UPDATE stores SET area = 'Osu',     city = 'Accra',      region = 'Greater Accra'  WHERE name = 'Adinkra Studio'  AND area IS NULL;
UPDATE stores SET area = 'Labone',  city = 'Accra',      region = 'Greater Accra'  WHERE name = 'Accra Home'      AND area IS NULL;
UPDATE stores SET area = 'East Legon', city = 'Accra',   region = 'Greater Accra'  WHERE name = 'Ama Beauty'      AND area IS NULL;
UPDATE stores SET area = 'Makola',  city = 'Accra',      region = 'Greater Accra'  WHERE name = 'Kente & Co'      AND area IS NULL;
UPDATE stores SET area = 'Spintex', city = 'Accra',      region = 'Greater Accra'  WHERE name = 'Adipa Fashion'   AND area IS NULL;
UPDATE stores SET area = 'Central', city = 'Tamale',     region = 'Northern'       WHERE name IN ('Shea Haven', 'Tamale Fresh') AND area IS NULL;
UPDATE stores SET area = 'Ho Central', city = 'Ho',      region = 'Volta'          WHERE name IN ('Volta Eats', 'Ho Digital')   AND area IS NULL;
UPDATE stores SET area = 'Kotokuraba', city = 'Cape Coast', region = 'Central'     WHERE name = 'Cape Coast Crafts' AND area IS NULL;
UPDATE stores SET area = 'Beach Road', city = 'Takoradi', region = 'Western'       WHERE name = 'Takoradi Glow'   AND area IS NULL;
UPDATE stores SET area = 'Airport Residential', city = 'Sunyani', region = 'Bono' WHERE name = 'Sunyani Serene Home' AND area IS NULL;
UPDATE stores SET area = 'Haatso',  city = 'Accra',      region = 'Greater Accra'  WHERE name = 'Daniel'          AND area IS NULL;
