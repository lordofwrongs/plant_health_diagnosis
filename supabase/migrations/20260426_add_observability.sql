-- Observability columns for plant_logs
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- before deploying the updated plant-processor edge function.

-- processing_log: stores a structured array of pipeline stage events
-- Each entry: { stage, level, message, ts, duration_ms? }
-- Use this to replay exactly what happened for any upload by record id.
ALTER TABLE plant_logs
  ADD COLUMN IF NOT EXISTS processing_log JSONB DEFAULT '[]'::JSONB;

-- error_details: stores the human-readable error message when status = 'error'
-- Lets support staff know what went wrong without needing to dig through logs.
ALTER TABLE plant_logs
  ADD COLUMN IF NOT EXISTS error_details TEXT;

-- Index for fast lookup of failed records (for support triage dashboards)
CREATE INDEX IF NOT EXISTS idx_plant_logs_status_error
  ON plant_logs (status)
  WHERE status = 'error';
