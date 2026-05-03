-- Sprint 16: AI enrichments — add vital_signs column
-- toxicity, light_intensity_analysis, seasonal_context already exist from earlier schema work
-- Run via Supabase Dashboard > SQL Editor

ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS vital_signs jsonb;
