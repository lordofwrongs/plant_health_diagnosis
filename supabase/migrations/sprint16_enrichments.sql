-- Sprint 16: AI enrichments — add all previously-schema-only columns + vital_signs
-- These were documented in CLAUDE.md as "schema only" but never migrated.
-- Run via Supabase Dashboard > SQL Editor

ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS toxicity                 jsonb;
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS light_intensity_analysis text;
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS seasonal_context          text;
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS growth_milestones         jsonb;
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS vital_signs               jsonb;
