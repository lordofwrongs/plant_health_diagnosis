-- Sprint 12: User feedback + Q&A conversations
-- Run this in the Supabase SQL editor

-- ── identification_feedback ───────────────────────────────────────────────────
-- Stores user corrections on plant identifications (thumbs-down flow)
CREATE TABLE IF NOT EXISTS identification_feedback (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id       uuid NOT NULL REFERENCES plant_logs(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  user_correction text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE identification_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert feedback"
  ON identification_feedback FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "users select own feedback"
  ON identification_feedback FOR SELECT TO anon
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub'
    OR user_id LIKE 'guest_%');

-- ── plant_conversations ───────────────────────────────────────────────────────
-- Stores per-scan Q&A exchanges (max 3 user turns, enforced in edge function)
CREATE TABLE IF NOT EXISTS plant_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id       uuid NOT NULL REFERENCES plant_logs(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  messages     jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE plant_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon insert conversations"
  ON plant_conversations FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "anon select own conversations"
  ON plant_conversations FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon update own conversations"
  ON plant_conversations FOR UPDATE TO anon
  USING (true);

-- Index for fast lookup by log_id + user_id
CREATE INDEX IF NOT EXISTS idx_plant_conversations_log_user
  ON plant_conversations(log_id, user_id);

-- Index for personalization lookups (same plant, same user)
CREATE INDEX IF NOT EXISTS idx_plant_conversations_user
  ON plant_conversations(user_id, updated_at DESC);
