-- Sprint 17: Weekly email digest
-- Run this in the Supabase SQL editor

-- ── Add opt-out flag to user_profiles ────────────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_digest_opt_out boolean NOT NULL DEFAULT false;

-- ── pg_cron job ───────────────────────────────────────────────────────────────
-- Requires pg_cron + pg_net extensions enabled in Supabase dashboard:
--   Settings → Database → Extensions → enable pg_cron and pg_net
--
-- Run once to schedule weekly digest every Sunday at 8am UTC.
-- Replace YOUR_SERVICE_ROLE_KEY with the real key from credentials.env.txt
--
-- SELECT cron.schedule(
--   'weekly-plant-digest',
--   '0 8 * * 0',
--   $$
--   SELECT net.http_post(
--     url      := 'https://thgdxffelonamukytosq.supabase.co/functions/v1/weekly-digest',
--     headers  := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body     := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
--
-- To verify:
--   SELECT * FROM cron.job;
--
-- To remove:
--   SELECT cron.unschedule('weekly-plant-digest');
