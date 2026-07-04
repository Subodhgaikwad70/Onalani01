-- Phase 4: Beds24 cache + calendar blocks
-- availability_cache + price_cache (5-minute TTL via fetched_at) + calendar blocks.

create table if not exists public.availability_cache (
  listing_id uuid not null references public.listings(id) on delete cascade,
  date date not null,
  is_available boolean not null,
  min_stay smallint,
  fetched_at timestamptz not null default now(),
  primary key (listing_id, date)
);
create index if not exists availability_cache_fetched_at_idx
  on public.availability_cache (fetched_at);

create table if not exists public.price_cache (
  listing_id uuid not null references public.listings(id) on delete cascade,
  date date not null,
  price_cents bigint not null check (price_cents >= 0),
  currency text not null,
  fetched_at timestamptz not null default now(),
  primary key (listing_id, date)
);
create index if not exists price_cache_fetched_at_idx
  on public.price_cache (fetched_at);

create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists calendar_blocks_listing_range_idx
  on public.calendar_blocks (listing_id, starts_on, ends_on);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.availability_cache enable row level security;
alter table public.price_cache enable row level security;
alter table public.calendar_blocks enable row level security;

-- Cache tables: public read (used by anonymous browsing); writes via service-role only.
drop policy if exists availability_cache_public_read on public.availability_cache;
create policy availability_cache_public_read on public.availability_cache
  for select using (true);

drop policy if exists price_cache_public_read on public.price_cache;
create policy price_cache_public_read on public.price_cache
  for select using (true);

-- Calendar blocks: public read for published listings (so calendar shows
-- as unavailable on listing detail), admin write.
drop policy if exists calendar_blocks_public_read on public.calendar_blocks;
create policy calendar_blocks_public_read on public.calendar_blocks
  for select using (
    exists (
      select 1 from public.listings l
        join public.properties p on p.id = l.property_id
       where l.id = calendar_blocks.listing_id
         and l.is_active = true
         and p.status = 'published'
    )
  );

drop policy if exists calendar_blocks_admin_all on public.calendar_blocks;
create policy calendar_blocks_admin_all on public.calendar_blocks
  for all to authenticated
  using (public.is_listing_owner(calendar_blocks.listing_id) or public.is_admin())
  with check (public.is_listing_owner(calendar_blocks.listing_id) or public.is_admin());
