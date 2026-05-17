-- Sprint 24: plant_overview — AI-generated 1-2 sentence natural language plant description
ALTER TABLE plant_logs ADD COLUMN IF NOT EXISTS plant_overview text;
