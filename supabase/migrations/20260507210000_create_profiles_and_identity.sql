-- Phase 1: identity & profile baseline
-- Creates profiles + adjacent identity tables, signup trigger, role-helper functions, and RLS.

create extension if not exists "pgcrypto";

-- Role enum and a JWT-claim helper used in RLS policies across the app.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('guest', 'admin', 'super_admin');
  end if;
end$$;

-- Read the role claim that the proxy mirrors into the JWT app_metadata.role
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'role',
    'guest'
  )::public.user_role
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_role() in ('admin', 'super_admin')
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'super_admin'
$$;

-- One profile per auth.users row; created via trigger below.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'guest',
  display_name text not null,
  avatar_url text,
  bio text,
  phone text,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  date_of_birth date,
  preferred_currency text not null default 'USD',
  preferred_language text not null default 'en',
  timezone text,
  country_code text,
  stripe_customer_id text unique,
  response_rate_pct numeric(5,2),
  response_time_minutes integer,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Identity verification (Stripe Identity / Persona / etc.)
create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_session_id text,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'failed', 'expired')),
  document_type text,
  verified_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists identity_verifications_profile_id_idx
  on public.identity_verifications (profile_id);

-- Phone OTP table; we store a salted hash of the OTP not the OTP itself.
create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  otp_hash text not null,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists phone_verifications_profile_id_idx
  on public.phone_verifications (profile_id);

-- Notification preferences (1:1 with profile)
create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email_marketing boolean not null default false,
  email_bookings boolean not null default true,
  email_messages boolean not null default true,
  email_reminders boolean not null default true,
  push_messages boolean not null default true,
  push_bookings boolean not null default true,
  digest_frequency text not null default 'instant'
    check (digest_frequency in ('instant', 'daily', 'off')),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

-- Device tokens (web push / future native push)
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null unique,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists device_tokens_profile_id_idx
  on public.device_tokens (profile_id);

-- ---------------------------------------------------------------------------
-- Signup trigger: when a new auth.users row appears, create matching profile
-- and notification_preferences. Display name comes from raw_user_meta_data
-- ('display_name' or 'full_name') or, as a last resort, the email local part.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  derived_name text;
begin
  derived_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(new.email, 'guest'), '@', 1)
  );

  insert into public.profiles (id, display_name, email_verified_at)
  values (new.id, derived_name, new.email_confirmed_at)
  on conflict (id) do nothing;

  insert into public.notification_preferences (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Keep email_verified_at on profile in sync with auth.users.email_confirmed_at
create or replace function public.handle_auth_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.profiles
       set email_verified_at = new.email_confirmed_at
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
after update on auth.users
for each row execute function public.handle_auth_user_email_confirmed();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.identity_verifications enable row level security;
alter table public.phone_verifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.device_tokens enable row level security;

-- profiles: anyone authenticated can read (display info), self can update,
-- admin can do anything.
drop policy if exists profiles_read_authenticated on public.profiles;
create policy profiles_read_authenticated on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
-- ^ self-update cannot escalate role; role changes go through admin path.

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- identity_verifications: self-read, admin all. Inserts created by service role.
drop policy if exists identity_verifications_self_read on public.identity_verifications;
create policy identity_verifications_self_read on public.identity_verifications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists identity_verifications_admin_all on public.identity_verifications;
create policy identity_verifications_admin_all on public.identity_verifications
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- phone_verifications: self can read its own pending row to know status; writes
-- happen via service role only.
drop policy if exists phone_verifications_self_read on public.phone_verifications;
create policy phone_verifications_self_read on public.phone_verifications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- notification_preferences: self read+write, admin read+write.
drop policy if exists notification_preferences_self_all on public.notification_preferences;
create policy notification_preferences_self_all on public.notification_preferences
  for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- device_tokens: self read+write, admin read.
drop policy if exists device_tokens_self_all on public.device_tokens;
create policy device_tokens_self_all on public.device_tokens
  for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
