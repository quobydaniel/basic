-- Seller AI auto-pilot: when ON, the store's AI answers buyers in chat by
-- itself — replies, takes orders (creates them), and alerts the seller.
-- Toggled per store from the seller chat thread header.
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS auto_pilot BOOLEAN NOT NULL DEFAULT false;
