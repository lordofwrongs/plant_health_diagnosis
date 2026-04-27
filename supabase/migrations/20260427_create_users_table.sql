-- Users table: stores voluntary registration profiles linked to guest sessions.
-- No password auth — guest_id from localStorage is the identity token.
create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  guest_id   text unique not null,
  first_name text not null,
  last_name  text not null,
  email      text,
  phone      text,
  created_at timestamptz default now()
);

alter table users enable row level security;

-- Anyone (anon) can insert their own profile row.
-- No select policy for anon — user data is only readable by the service role (admin).
-- The client uses localStorage (botaniq_registered) to know if already registered,
-- so it never needs to query this table.
create policy "anon_insert" on users
  for insert to anon with check (true);
