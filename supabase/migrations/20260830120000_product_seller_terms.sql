-- Per-product seller terms:
--   delivery_available — does the seller offer delivery on this listing?
--   payment_type       — required when delivery is available:
--                        'on_delivery' | 'escrow' | 'before_delivery'
--   returns_note       — free text; blank falls back to platform default
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS payment_type TEXT,
  ADD COLUMN IF NOT EXISTS returns_note TEXT;
