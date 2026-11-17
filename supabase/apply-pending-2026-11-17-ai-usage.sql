-- ============================================================
-- 2026-11-17 — ai_usage: per-user daily rationing for free-tier AI.
-- One shared free-key pool serves every buyer; this table lets server
-- functions cap per-user daily usage (buyerAssistant default 40/day) so a
-- few heavy users can't drain the pool for everyone. Upserted by the
-- gateway callers with the caller's own JWT.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  fn text NOT NULL,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, fn)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_usage_select_own"
  ON public.ai_usage FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ai_usage_insert_own"
  ON public.ai_usage FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_usage_update_own"
  ON public.ai_usage FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
