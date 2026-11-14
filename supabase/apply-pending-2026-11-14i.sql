-- apply-pending-2026-11-14i.sql — buyer plans + AI insight metering
--
-- The AI product insight becomes a metered feature:
--   • shopper (free buyer plan): 5 insights per day
--   • premium / premium-yearly: unlimited
-- The pricing page already sells buyer plans, but nothing persisted them —
-- this adds the column, a usage counter, and a guard so users can't
-- self-upgrade by PATCHing their own profile.
--
-- 1) profiles.plan — 'shopper' (default) | 'premium' (premium-yearly also
--    maps here; the year is billing cadence, not different entitlements).
--    Upgrades are set manually (WhatsApp reservation → admin SQL) until
--    billing goes live.
-- 2) trg_guard_profile_plan — non-admin profile updates can never change
--    plan (silently keeps the old value), closing the self-upgrade hole that
--    profiles_self_update would otherwise leave open.
-- 3) ai_insight_usage — one row per user per day; productBrief upserts it.
--
-- Run as postgres (Dashboard → SQL Editor) once. Idempotent.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'shopper';

CREATE OR REPLACE FUNCTION public.guard_profile_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE NOTICE 'profile plan change blocked for non-admin %', auth.uid();
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_plan ON public.profiles;
CREATE TRIGGER trg_guard_profile_plan
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_plan();

CREATE TABLE IF NOT EXISTS public.ai_insight_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  used int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.ai_insight_usage ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.ai_insight_usage TO authenticated;

CREATE POLICY "ai_usage_self" ON public.ai_insight_usage
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- To grant Premium to a buyer (until billing is live):
--   UPDATE public.profiles SET plan = 'premium' WHERE id = '<user uuid>';
