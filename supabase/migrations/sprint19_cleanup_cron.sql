-- FIX-17: Scheduled cleanup of orphaned guest plant_logs older than 30 days.
-- Guest rows use a "guest_" prefix in user_id and are never migrated to user_profiles,
-- so they accumulate indefinitely. This cron job trims them daily at 3am UTC.
--
-- Run this in the Supabase SQL editor (requires pg_cron extension enabled).

SELECT cron.schedule(
  'cleanup-orphan-guest-logs',
  '0 3 * * *',
  $$
  DELETE FROM plant_logs
  WHERE user_id LIKE 'guest_%'
    AND created_at < NOW() - INTERVAL '30 days';
  $$
);
