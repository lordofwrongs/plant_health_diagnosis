-- Sprint 23: Results page overhaul
-- Three new columns on plant_logs

ALTER TABLE plant_logs
  ADD COLUMN IF NOT EXISTS plantnet_reference_image text,
  ADD COLUMN IF NOT EXISTS nutrient_recommendations jsonb,
  ADD COLUMN IF NOT EXISTS harvest_guide jsonb;
