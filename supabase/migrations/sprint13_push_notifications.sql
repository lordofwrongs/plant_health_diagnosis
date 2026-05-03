-- Sprint 13: Push notifications + care action tracking
-- Run this in the Supabase SQL editor

-- ── push_subscriptions ────────────────────────────────────────────────────────
-- One row per browser/device. endpoint is unique per device.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth_key   text NOT NULL,
  timezone   text NOT NULL DEFAULT 'UTC',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert subscriptions"
  ON push_subscriptions FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon select own subscriptions"
  ON push_subscriptions FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon update own subscriptions"
  ON push_subscriptions FOR UPDATE TO anon
  USING (true);

CREATE POLICY "anon delete own subscriptions"
  ON push_subscriptions FOR DELETE TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);

-- ── push_mutes ────────────────────────────────────────────────────────────────
-- Per-user plant mutes — one row per muted plant per user
CREATE TABLE IF NOT EXISTS push_mutes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text NOT NULL,
  plant_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, plant_name)
);

ALTER TABLE push_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert mutes"
  ON push_mutes FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon select mutes"
  ON push_mutes FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon delete mutes"
  ON push_mutes FOR DELETE TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_push_mutes_user
  ON push_mutes(user_id);

-- ── plant_care_actions ────────────────────────────────────────────────────────
-- Tracks when the user marks a care task as done (watered, etc.)
-- Used by care-reminder to calculate next due date accurately
CREATE TABLE IF NOT EXISTS plant_care_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  plant_name  text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('watered', 'fertilised', 'pest_checked')),
  actioned_at timestamptz DEFAULT now()
);

ALTER TABLE plant_care_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert care actions"
  ON plant_care_actions FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon select care actions"
  ON plant_care_actions FOR SELECT TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_care_actions_user_plant
  ON plant_care_actions(user_id, plant_name, actioned_at DESC);

-- ── pg_cron job (run after enabling pg_cron + pg_net extensions) ──────────────
-- Enable both extensions in Supabase dashboard first:
--   Settings → Database → Extensions → enable pg_cron and pg_net
--
-- Then run this once to schedule hourly checks at :00 of every hour.
-- Replace YOUR_SERVICE_ROLE_KEY with the real key from credentials.env.txt
--
-- SELECT cron.schedule(
--   'care-reminder-hourly',
--   '0 * * * *',
--   $$
--   SELECT net.http_post(
--     url      := 'https://thgdxffelonamukytosq.supabase.co/functions/v1/care-reminder',
--     headers  := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body     := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );
--
-- To verify the job was created:
--   SELECT * FROM cron.job;
--
-- To remove it:
--   SELECT cron.unschedule('care-reminder-hourly');
