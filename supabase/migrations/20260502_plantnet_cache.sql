-- Sprint 6: PlantNet result cache
-- Keyed by SHA-256 of the uploaded image bytes.
-- Identical images (e.g. user scans the same plant twice) skip the PlantNet API call entirely,
-- preserving the 500 req/day free-tier quota and shaving ~1.5s off repeat scans.
-- No TTL — plant species identification doesn't change, so cache entries are permanent.
create table if not exists plantnet_cache (
  image_hash  text        primary key,
  result      jsonb       not null,
  created_at  timestamptz default now()
);

-- Only accessed by service role from the edge function — no RLS needed.
