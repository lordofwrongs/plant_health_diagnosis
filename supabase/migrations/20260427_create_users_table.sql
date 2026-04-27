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

-- Anyone (anon) can insert their own profile row
create policy "anon_insert" on users
  for insert to anon with check (true);

-- Anyone can read rows (needed by client to check if already registered)
create policy "anon_select" on users
  for select to anon using (true);
