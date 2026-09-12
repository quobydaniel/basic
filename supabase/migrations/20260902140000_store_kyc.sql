-- Seller KYC (Know Your Customer) verification.
-- kyc_verified: set by an ADMIN after checking the seller's government ID —
-- powers the gold "Verified" badge on the storefront.
-- kyc_submitted_at: when the seller last submitted ID documents (for the
-- upcoming in-app KYC submission flow).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;
