-- Sprint 7: Multi-angle diagnosis
-- Stores URLs of secondary photos (leaf close-up, stem/soil) alongside the primary image.
-- Primary image stays in image_url; additional angles go here.
-- The pipeline fetches all URLs and sends them as separate inlineData parts to Gemini.
alter table plant_logs
  add column if not exists additional_images text[] default '{}';

-- Sprint 8: Pest identification
-- Populated by the pipeline when Gemini detects pest damage in the photo.
-- pest_treatment is a JSONB array of plain-text treatment steps.
alter table plant_logs
  add column if not exists pest_detected  boolean default false,
  add column if not exists pest_name      text,
  add column if not exists pest_treatment jsonb;
