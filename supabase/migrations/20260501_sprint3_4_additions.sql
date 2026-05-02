-- Sprint 3: Public counter for trust bar on upload screen
-- Callable by anon (no user data exposed — just an aggregate count)
create or replace function get_total_scans()
returns bigint
language sql
security definer
stable
as $$
  select count(*)::bigint from plant_logs where status = 'done';
$$;
grant execute on function get_total_scans() to anon;

-- Sprint 4: Care schedule frequencies stored per scan result
alter table plant_logs
  add column if not exists care_schedule jsonb;
