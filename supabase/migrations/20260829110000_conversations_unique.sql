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
