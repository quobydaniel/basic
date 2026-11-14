-- 2026-11-14c — chat presence: last-seen heartbeat
-- Powers the thread header's "Online now / Last seen X" line.
-- Every signed-in client beats profiles.last_seen_at every 45s (session.ts);
-- a beat within 90s reads as online. Safe to re-run.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- The heartbeat updates ONLY the signed-in user's own row. Settings pages
-- likely already created a self-update policy — add one only if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_self_update'
  ) THEN
    CREATE POLICY profiles_self_update ON profiles
      FOR UPDATE TO authenticated
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;
