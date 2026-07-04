-- Phase 2: catalog v2
-- Extends properties + listings with platform-managed catalog attributes;
-- adds photos, bedrooms, amenities (taxonomy + join), house rules, check-in
-- info, categories (taxonomy + join), and POIs.

-- ---------------------------------------------------------------------------
-- properties: status + booking modality + locale info (platform-owned)
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists timezone text,
  -- cancellation_policy_id FK is added in Phase 6 (cancellation_policies table)
  add column if not exists cancellation_policy_id uuid,
  add column if not exists beds24_property_id text,
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'suspended')),
  add column if not exists instant_book boolean not null default false;

create index if not exists properties_status_idx on public.properties (status);

-- ---------------------------------------------------------------------------
-- listings: pricing + Beds24 + booking modality + denormalized rating
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists beds24_room_id text,
  add column if not exists base_price_cents bigint not null default 0,
  add column if not exists currency text not null default 'USD',
  add column if not exists min_nights smallint not null default 1
    check (min_nights >= 1),
  add column if not exists max_nights smallint
    check (max_nights is null or max_nights >= min_nights),
  add column if not exists instant_book boolean not null default false,
  add column if not exists view_count integer not null default 0,
  add column if not exists rating_avg numeric(3, 2),
  add column if not exists rating_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- amenities: controlled vocabulary + listing join
-- ---------------------------------------------------------------------------
create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  icon text,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_amenities (
  listing_id uuid not null references public.listings(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete restrict,
  primary key (listing_id, amenity_id)
);
create index if not exists listing_amenities_amenity_idx
  on public.listing_amenities (amenity_id);

-- ---------------------------------------------------------------------------
-- listing_photos: ordered, optionally captioned, supports cover photo flag
-- ---------------------------------------------------------------------------
create table if not exists public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null,
  url text not null,
  caption text,
  position smallint not null default 0,
  is_cover boolean not null default false,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create index if not exists listing_photos_listing_position_idx
  on public.listing_photos (listing_id, position);
-- Only one cover photo per listing (when is_cover=true).
create unique index if not exists listing_photos_one_cover_per_listing
  on public.listing_photos (listing_id) where is_cover;

-- ---------------------------------------------------------------------------
-- listing_bedrooms: per-bedroom layout with bed types
-- ---------------------------------------------------------------------------
create table if not exists public.listing_bedrooms (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  position smallint not null,
  label text,
  beds jsonb not null default '[]'::jsonb,
  has_ensuite boolean not null default false,
  unique (listing_id, position)
);

-- ---------------------------------------------------------------------------
-- listing_house_rules: 1:1 with listing
-- ---------------------------------------------------------------------------
create table if not exists public.listing_house_rules (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  pets_allowed boolean not null default false,
  smoking_allowed boolean not null default false,
  parties_allowed boolean not null default false,
  children_allowed boolean not null default true,
  quiet_hours jsonb,
  additional_rules text
);

-- ---------------------------------------------------------------------------
-- listing_check_in_info: 1:1 with listing
-- ---------------------------------------------------------------------------
create table if not exists public.listing_check_in_info (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  check_in_from time not null default '15:00',
  check_in_to time,
  check_out_by time not null default '11:00',
  self_check_in boolean not null default false,
  check_in_method text
    check (check_in_method is null or check_in_method in
      ('smartlock', 'lockbox', 'keypad', 'in_person', 'concierge')),
  instructions_md text
);

-- ---------------------------------------------------------------------------
-- categories: collection taxonomy (beachfront, cabin, etc.) + join
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_categories (
  listing_id uuid not null references public.listings(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  primary key (listing_id, category_id)
);
create index if not exists listing_categories_category_idx
  on public.listing_categories (category_id);

-- ---------------------------------------------------------------------------
-- listing_pois: nearby points of interest
-- ---------------------------------------------------------------------------
create table if not exists public.listing_pois (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null,
  kind text,
  distance_meters integer check (distance_meters is null or distance_meters >= 0),
  position smallint not null default 0
);
create index if not exists listing_pois_listing_idx on public.listing_pois (listing_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.amenities enable row level security;
alter table public.listing_amenities enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_bedrooms enable row level security;
alter table public.listing_house_rules enable row level security;
alter table public.listing_check_in_info enable row level security;
alter table public.categories enable row level security;
alter table public.listing_categories enable row level security;
alter table public.listing_pois enable row level security;

-- amenities + categories: public read, admin write
drop policy if exists amenities_public_read on public.amenities;
create policy amenities_public_read on public.amenities
  for select using (true);
drop policy if exists amenities_admin_all on public.amenities;
create policy amenities_admin_all on public.amenities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select using (true);
drop policy if exists categories_admin_all on public.categories;
create policy categories_admin_all on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Helper predicate: caller is an admin managing catalog (platform-owned inventory).
create or replace function public.is_listing_owner(listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
$$;

-- listing photos + bedrooms + house rules + check-in info + amenities + pois
-- read: public for published, admin always; write: admin only.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'listing_photos', 'listing_bedrooms', 'listing_house_rules',
    'listing_check_in_info', 'listing_amenities', 'listing_pois',
    'listing_categories'
  ]) loop
    execute format($f$
      drop policy if exists %1$I_public_read on public.%1$I;
      create policy %1$I_public_read on public.%1$I
        for select using (
          exists (
            select 1 from public.listings l
              join public.properties p on p.id = l.property_id
             where l.id = %1$I.listing_id
               and l.is_active = true
               and p.status = 'published'
          )
        );
      drop policy if exists %1$I_owner_read on public.%1$I;
      create policy %1$I_owner_read on public.%1$I
        for select to authenticated
        using (public.is_listing_owner(%1$I.listing_id) or public.is_admin());
      drop policy if exists %1$I_owner_write on public.%1$I;
      create policy %1$I_owner_write on public.%1$I
        for all to authenticated
        using (public.is_listing_owner(%1$I.listing_id) or public.is_admin())
        with check (public.is_listing_owner(%1$I.listing_id) or public.is_admin());
    $f$, t);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- properties + listings RLS (Phase 1 only enabled RLS on properties without
-- adding policies; Phase 2 wires it in now that catalog is platform-managed.)
-- ---------------------------------------------------------------------------
drop policy if exists properties_public_read on public.properties;
create policy properties_public_read on public.properties
  for select using (status = 'published' and is_active = true);

drop policy if exists properties_owner_read on public.properties;
create policy properties_admin_read on public.properties
  for select to authenticated
  using (public.is_admin());

drop policy if exists properties_owner_write on public.properties;
create policy properties_admin_write on public.properties
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists listings_public_read on public.listings;
create policy listings_public_read on public.listings
  for select using (
    is_active = true
    and exists (
      select 1 from public.properties p
       where p.id = listings.property_id
         and p.status = 'published'
         and p.is_active = true
    )
  );

drop policy if exists listings_owner_read on public.listings;
create policy listings_admin_read on public.listings
  for select to authenticated
  using (public.is_listing_owner(listings.id) or public.is_admin());

drop policy if exists listings_owner_write on public.listings;
create policy listings_admin_write on public.listings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
