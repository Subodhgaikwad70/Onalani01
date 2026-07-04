-- Phase 5: search & discovery signals
-- listing_views, recently_viewed, saved_searches + a search vector column for FTS.

create table if not exists public.listing_views (
  id bigserial primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  viewer_profile_id uuid references public.profiles(id) on delete set null,
  session_hash text,
  viewed_at timestamptz not null default now()
);
create index if not exists listing_views_listing_viewed_idx
  on public.listing_views (listing_id, viewed_at desc);
create index if not exists listing_views_viewer_idx
  on public.listing_views (viewer_profile_id, viewed_at desc);

create table if not exists public.recently_viewed (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);
create index if not exists recently_viewed_profile_viewed_idx
  on public.recently_viewed (profile_id, viewed_at desc);

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  query jsonb not null,
  alerts_enabled boolean not null default false,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists saved_searches_profile_idx
  on public.saved_searches (profile_id);

-- ---------------------------------------------------------------------------
-- Full-text search column on listings + a generated tsvector + GIN index.
-- We compose from listing fields + the parent property name/city/country.
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists search_vector tsvector;

create index if not exists listings_search_vector_idx
  on public.listings using gin (search_vector);

create or replace function public.listings_refresh_search_vector()
returns trigger
language plpgsql
as $$
declare
  prop_record record;
begin
  select property_name, city, state, country into prop_record
    from public.properties
   where id = new.property_id;

  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.unit_type, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(prop_record.property_name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(prop_record.city, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(prop_record.state, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(prop_record.country, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(new.unit_description, '')), 'C')
    || setweight(to_tsvector('simple', array_to_string(coalesce(new.unit_amenities, '{}'::text[]), ' ')), 'D');
  return new;
end;
$$;

drop trigger if exists listings_search_vector_trigger on public.listings;
create trigger listings_search_vector_trigger
before insert or update on public.listings
for each row execute function public.listings_refresh_search_vector();

-- Backfill existing rows.
update public.listings set search_vector = null where search_vector is null;

-- ---------------------------------------------------------------------------
-- view_count rollup helper: a SQL function that counts unique session_hashes
-- in the last N days. Called by the daily cron in Phase 11; for now, surface
-- as a function so admins can run it manually.
-- ---------------------------------------------------------------------------
create or replace function public.rollup_listing_view_counts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with counts as (
    select listing_id, count(distinct coalesce(session_hash, viewer_profile_id::text)) as c
      from public.listing_views
     where viewed_at >= now() - interval '90 days'
     group by listing_id
  )
  update public.listings l
     set view_count = c.c
    from counts c
   where c.listing_id = l.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.listing_views enable row level security;
alter table public.recently_viewed enable row level security;
alter table public.saved_searches enable row level security;

-- listing_views: anyone (incl. anon) may insert via the public POST view
-- endpoint (no select/update/delete). The host can read counts via aggregate
-- queries against their own listings.
drop policy if exists listing_views_anyone_insert on public.listing_views;
create policy listing_views_anyone_insert on public.listing_views
  for insert with check (true);

drop policy if exists listing_views_owner_read on public.listing_views;
create policy listing_views_owner_read on public.listing_views
  for select to authenticated
  using (public.is_listing_owner(listing_views.listing_id) or public.is_admin());

-- recently_viewed: self only.
drop policy if exists recently_viewed_self on public.recently_viewed;
create policy recently_viewed_self on public.recently_viewed
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- saved_searches: self only.
drop policy if exists saved_searches_self on public.saved_searches;
create policy saved_searches_self on public.saved_searches
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
