-- Sprint 20: Plant classification column + pest follow-up reminders table

-- Add classification column to plant_logs (stores Gemini's plant_classification object)
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS plant_classification jsonb;

-- Create follow_up_reminders table for pest treatment check-ins
CREATE TABLE IF NOT EXISTS follow_up_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  log_id uuid REFERENCES plant_logs(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,
  message text NOT NULL,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for the care-reminder cron job to efficiently pick up due reminders
CREATE INDEX IF NOT EXISTS idx_reminders_time ON follow_up_reminders(remind_at) WHERE processed = false;
