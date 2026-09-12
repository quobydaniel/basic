-- ============================================================================
-- Full category tree for BASIC — every department and sub-collection.
-- Existing rows are kept (products reference them); everything below is
-- guarded with NOT EXISTS so re-running never duplicates.
--
-- Phase 1 consolidates the duplicate-name parents (home/food/art were
-- duplicates of home-living/food-drinks/art-crafts): their children and any
-- products pointing at them are re-pointed at the canonical parent, then the
-- empty stubs are removed.
-- Phase 2 adds new departments and sub-collections. New sub-collections are
-- hidden from buyers automatically by the app until they have products.
-- ============================================================================

-- ── Phase 1: consolidate duplicate parents ─────────────────────────────────

-- Children of the duplicate stubs move under the canonical parent.
UPDATE categories SET parent_id = (SELECT id FROM categories WHERE slug = 'home-living')
WHERE parent_id = (SELECT id FROM categories WHERE slug = 'home' AND parent_id IS NULL);
UPDATE categories SET parent_id = (SELECT id FROM categories WHERE slug = 'food-drinks')
WHERE parent_id = (SELECT id FROM categories WHERE slug = 'food' AND parent_id IS NULL);
UPDATE categories SET parent_id = (SELECT id FROM categories WHERE slug = 'art-crafts')
WHERE parent_id = (SELECT id FROM categories WHERE slug = 'art' AND parent_id IS NULL);

-- Products filed directly under a stub move to the canonical parent.
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'home-living')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'home' AND parent_id IS NULL);
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'food-drinks')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'food' AND parent_id IS NULL);
UPDATE products SET category_id = (SELECT id FROM categories WHERE slug = 'art-crafts')
WHERE category_id = (SELECT id FROM categories WHERE slug = 'art' AND parent_id IS NULL);

-- Remove the now-empty stubs (only if truly unreferenced).
DELETE FROM categories c
WHERE c.slug IN ('home', 'food', 'art') AND c.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id);

-- ── Phase 2: the full tree ──────────────────────────────────────────────────
-- Helper: insert a parent once.
INSERT INTO categories (slug, name, position)
SELECT v.slug, v.name, v.position FROM (VALUES
  ('sports-outdoors', 'Sports & Outdoors', 60),
  ('books-media', 'Books & Media', 70),
  ('pets', 'Pets', 80),
  ('auto-moto', 'Auto & Moto', 90)
) AS v(slug, name, position)
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.slug = v.slug);

-- Helper: insert a sub-collection once, under its canonical parent.
-- Position nests under the parent so ordering reads naturally.
INSERT INTO categories (slug, name, parent_id, position)
SELECT v.slug, v.name, p.id,
       (SELECT position FROM categories WHERE slug = v.parent) * 100 + v.idx
FROM (VALUES
  -- Fashion
  ('fashion', 'african-print-kente', 'African Print & Kente', 1),
  ('fashion', 'bags-luggage', 'Bags & Luggage', 2),
  ('fashion', 'womens-clothing', 'Women''s Clothing', 3),
  ('fashion', 'womens-shoes', 'Women''s Shoes', 4),
  ('fashion', 'mens-clothing', 'Men''s Clothing', 5),
  ('fashion', 'mens-shoes', 'Men''s Shoes', 6),
  ('fashion', 'wedding-ceremonial', 'Wedding & Ceremonial', 7),
  ('fashion', 'activewear', 'Activewear', 8),
  ('fashion', 'lingerie-sleepwear', 'Lingerie & Sleepwear', 9),
  -- Beauty & Care
  ('beauty', 'skincare', 'Skincare', 1),
  ('beauty', 'hair-care', 'Hair Care', 2),
  ('beauty', 'makeup', 'Makeup', 3),
  ('beauty', 'fragrance-perfume', 'Fragrance & Perfume', 4),
  ('beauty', 'bath-body', 'Bath & Body', 5),
  ('beauty', 'natural-remedies', 'Natural Remedies', 6),
  ('beauty', 'grooming-barbers', 'Grooming & Barbering', 7),
  -- Food & Drinks
  ('food-drinks', 'packaged-food', 'Packaged Food', 1),
  ('food-drinks', 'drinks-beverages', 'Drinks & Beverages', 2),
  ('food-drinks', 'spices-seasonings', 'Spices & Seasonings', 3),
  ('food-drinks', 'snacks-sweets', 'Snacks & Sweets', 4),
  ('food-drinks', 'fresh-produce', 'Fresh Produce', 5),
  ('food-drinks', 'groceries-staples', 'Groceries & Staples', 6),
  ('food-drinks', 'prepared-meals', 'Prepared Meals', 7),
  ('food-drinks', 'teas-herbal', 'Teas & Herbal', 8),
  -- Home & Living
  ('home-living', 'furniture', 'Furniture', 1),
  ('home-living', 'bedding-textiles', 'Bedding & Textiles', 2),
  ('home-living', 'kitchen-dining', 'Kitchen & Dining', 3),
  ('home-living', 'decor-candles', 'Decor & Candles', 4),
  ('home-living', 'storage-organization', 'Storage & Organization', 5),
  ('home-living', 'garden-outdoor', 'Garden & Outdoor', 6),
  ('home-living', 'cleaning-household', 'Cleaning & Household', 7),
  -- Electronics
  ('electronics', 'phones-tablets', 'Phones & Tablets', 1),
  ('electronics', 'computers-laptops', 'Computers & Laptops', 2),
  ('electronics', 'tv-audio-home', 'TV, Audio & Home Cinema', 3),
  ('electronics', 'accessories-chargers', 'Accessories & Chargers', 4),
  ('electronics', 'gaming', 'Gaming', 5),
  ('electronics', 'cameras-photography', 'Cameras & Photography', 6),
  ('electronics', 'smart-home', 'Smart Home', 7),
  -- Health
  ('health', 'supplements-wellness', 'Supplements & Wellness', 1),
  ('health', 'fitness-equipment', 'Fitness Equipment', 2),
  ('health', 'medical-supplies', 'Medical Supplies', 3),
  ('health', 'personal-hygiene', 'Personal Hygiene', 4),
  -- Art & Crafts
  ('art-crafts', 'paintings', 'Paintings', 1),
  ('art-crafts', 'sculpture-carvings', 'Sculpture & Carvings', 2),
  ('art-crafts', 'textiles-fabrics', 'Textiles & Fabrics', 3),
  ('art-crafts', 'pottery-ceramics', 'Pottery & Ceramics', 4),
  ('art-crafts', 'beads-jewellery-making', 'Beads & Jewellery-Making', 5),
  ('art-crafts', 'craft-supplies', 'Craft Supplies', 6),
  -- Jewelry
  ('jewelry', 'fine-jewelry', 'Fine Jewelry', 1),
  ('jewelry', 'beads-waist-beads', 'Beads & Waist Beads', 2),
  ('jewelry', 'watches', 'Watches', 3),
  ('jewelry', 'hair-jewelry', 'Hair Jewelry', 4),
  -- Kids & Baby
  ('kids', 'kids-clothing', 'Kids'' Clothing', 1),
  ('kids', 'baby-clothing', 'Baby Clothing', 2),
  ('kids', 'toys-games', 'Toys & Games', 3),
  ('kids', 'kids-shoes', 'Kids'' Shoes', 4),
  ('kids', 'school-supplies', 'School Supplies', 5),
  ('kids', 'baby-care', 'Baby Care', 6),
  -- Services
  ('services', 'professional-services', 'Professional Services', 1),
  ('services', 'home-repairs', 'Home Repairs', 2),
  ('services', 'beauty-spa-services', 'Beauty & Spa Services', 3),
  ('services', 'event-planning', 'Event Planning', 4),
  ('services', 'transport-delivery', 'Transport & Delivery', 5),
  ('services', 'lessons-tutoring', 'Lessons & Tutoring', 6),
  -- Digital
  ('digital', 'ebooks-courses', 'Ebooks & Courses', 1),
  ('digital', 'software-apps', 'Software & Apps', 2),
  ('digital', 'digital-art-design', 'Digital Art & Design', 3),
  ('digital', 'gift-cards', 'Gift Cards', 4),
  ('digital', 'subscriptions', 'Subscriptions', 5),
  -- Sports & Outdoors
  ('sports-outdoors', 'sportswear', 'Sportswear', 1),
  ('sports-outdoors', 'exercise-fitness', 'Exercise & Fitness', 2),
  ('sports-outdoors', 'outdoor-camping', 'Outdoor & Camping', 3),
  ('sports-outdoors', 'bicycles-skates', 'Bicycles & Skates', 4),
  ('sports-outdoors', 'team-sports', 'Team Sports', 5),
  -- Books & Media
  ('books-media', 'books', 'Books', 1),
  ('books-media', 'music-vinyl', 'Music & Vinyl', 2),
  ('books-media', 'movies-series', 'Movies & Series', 3),
  ('books-media', 'stationery', 'Stationery', 4),
  -- Pets
  ('pets', 'pet-food', 'Pet Food', 1),
  ('pets', 'pet-accessories', 'Pet Accessories', 2),
  ('pets', 'pet-care-services', 'Pet Care Services', 3),
  -- Auto & Moto
  ('auto-moto', 'car-parts', 'Car Parts', 1),
  ('auto-moto', 'car-care', 'Car Care', 2),
  ('auto-moto', 'motorcycles-scooters', 'Motorcycles & Scooters', 3),
  ('auto-moto', 'helmets-gear', 'Helmets & Gear', 4)
) AS v(parent, slug, name, idx)
JOIN categories p ON p.slug = v.parent
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.slug = v.slug);
