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
