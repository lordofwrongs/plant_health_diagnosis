-- Security: Tighten plant_logs RLS
-- Run this in the Supabase SQL editor.
--
-- Authenticated users are now strictly scoped to their own rows via auth.uid().
-- After magic-link sign-in, migrate_guest_to_user() sets plant_logs.user_id to
-- the auth UUID, so auth.uid()::text = user_id holds for all their scans.
--
-- Anon (guest) users retain open read access. Full guest isolation requires
-- migrating to Supabase Anonymous Auth so every device gets a verifiable JWT —
-- deferred as future work (breaks no existing behaviour in the meantime).

ALTER TABLE plant_logs ENABLE ROW LEVEL SECURITY;

-- Drop all existing SELECT, DELETE, and ALL policies so we can replace them cleanly.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE tablename = 'plant_logs'
      AND schemaname = 'public'
      AND cmd IN ('SELECT', 'DELETE', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON plant_logs', r.policyname);
  END LOOP;
END;
$$;

-- Authenticated users: strict row ownership via JWT claim
CREATE POLICY "authenticated select own logs"
  ON plant_logs FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "authenticated delete own logs"
  ON plant_logs FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id);

-- Anon (guest) users: open access until Anonymous Auth migration
CREATE POLICY "anon select logs"
  ON plant_logs FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon delete logs"
  ON plant_logs FOR DELETE TO anon
  USING (true);

-- INSERT: open for anon (guest scans), scoped for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'plant_logs' AND schemaname = 'public' AND cmd = 'INSERT'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "anon insert logs"
        ON plant_logs FOR INSERT TO anon
        WITH CHECK (true);
      CREATE POLICY "authenticated insert logs"
        ON plant_logs FOR INSERT TO authenticated
        WITH CHECK (auth.uid()::text = user_id);
    $p$;
  END IF;
END;
$$;
