-- Listings: individual rentable units tied to a parent property (resort / building).
-- Column names follow Postgres snake_case; app/API map from Unit_* names as noted in comments.

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  property_id uuid not null references public.properties (id) on delete cascade,
  -- Unit_type
  unit_type text,
  -- Unit_amenities
  unit_amenities text[] not null default '{}',
  -- Unit_occupancy (max guests for this unit)
  unit_occupancy integer check (unit_occupancy is null or unit_occupancy >= 0),
  -- Unit_bathrooms (supports half-baths, e.g. 2.5)
  unit_bathrooms numeric(4, 1) check (unit_bathrooms is null or unit_bathrooms >= 0),
  -- Unit_area (e.g. square feet or square meters — document units in app or metadata)
  unit_area numeric(12, 2) check (unit_area is null or unit_area >= 0),
  -- Unit_description
  unit_description text,
  -- Unit_KitchenType
  unit_kitchen_type text,
  photo_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_slug_key unique (slug),
  constraint listings_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and length(slug) <= 120
  )
);

create index if not exists listings_property_id_idx on public.listings (property_id);

comment on column public.listings.unit_type is 'Unit_type';
comment on column public.listings.unit_amenities is 'Unit_amenities';
comment on column public.listings.unit_occupancy is 'Unit_occupancy';
comment on column public.listings.unit_bathrooms is 'Unit_bathrooms';
comment on column public.listings.unit_area is 'Unit_area';
comment on column public.listings.unit_description is 'Unit_description';
comment on column public.listings.unit_kitchen_type is 'Unit_KitchenType';

drop trigger if exists set_listings_updated_at on public.listings;

create trigger set_listings_updated_at
before update on public.listings
for each row
execute function public.set_updated_at();

alter table public.listings enable row level security;
