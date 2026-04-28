-- Store top PlantNet candidate species so the frontend can show "Could also be…"
-- when confidence is low, rather than committing to a single name silently.
alter table plant_logs
  add column if not exists plantnet_candidates jsonb default '[]'::jsonb;
