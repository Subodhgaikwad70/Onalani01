create extension if not exists "pgcrypto";

-- Properties (parent resort/building). Slug is the public URL segment.
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  property_name text not null,
  description text,
  photo_url text,
  list_of_amenities text[] not null default '{}',
  address text,
  city text,
  state text,
  country text,
  postal_code text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  max_guests integer check (max_guests is null or max_guests > 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_slug_key unique (slug),
  constraint properties_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and length(slug) <= 120
  ),
  constraint properties_property_name_not_empty check (length(trim(property_name)) > 0)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_properties_updated_at on public.properties;

create trigger set_properties_updated_at
before update on public.properties
for each row
execute function public.set_updated_at();

alter table public.properties enable row level security;
