-- user_profiles: linked to Supabase Auth
-- Stores name/phone metadata alongside the auth user record.
-- Replaces the soft-registration `users` table for authenticated users.
create table if not exists user_profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null,
  first_name  text,
  last_name   text,
  phone       text,
  guest_id    text,        -- localStorage guest_id before auth (used for migration audit)
  created_at  timestamptz default now()
);

alter table user_profiles enable row level security;

create policy "Users can manage own profile" on user_profiles
  for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- RPC: migrate guest plant_logs to an authenticated user
--
-- Called client-side after magic link sign-in. Runs as postgres (security
-- definer) so it can UPDATE rows regardless of RLS, but verifies auth.uid()
-- matches the requested user_id to prevent cross-user abuse.
-- ---------------------------------------------------------------------------
create or replace function migrate_guest_to_user(p_guest_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() != p_user_id then
    raise exception 'Unauthorized: caller does not match p_user_id';
  end if;

  -- Move all guest plant_logs to the authenticated user id
  update plant_logs
  set user_id = p_user_id::text
  where user_id = p_guest_id
    and user_id != p_user_id::text;
end;
$$;
