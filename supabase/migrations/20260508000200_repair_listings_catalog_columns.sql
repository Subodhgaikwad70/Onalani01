-- Repair migration: some environments started with an existing `public.listings`
-- table, so later `create table if not exists` / phase migrations did not ensure
-- all expected columns were present.
--
-- Keep this idempotent for safe re-runs.

alter table public.listings
  add column if not exists photo_url text,
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
