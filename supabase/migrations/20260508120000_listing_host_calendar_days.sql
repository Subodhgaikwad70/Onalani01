-- Per-day admin overrides for calendar pricing and stay rules (merged into
-- availability / quotes). Nullable columns mean "no override" — inherit Beds24
-- cache or listing defaults.

create table if not exists public.listing_calendar_day_overrides (
  listing_id uuid not null references public.listings (id) on delete cascade,
  date date not null,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  min_stay smallint check (min_stay is null or min_stay >= 1),
  check_in_allowed boolean not null default true,
  check_out_allowed boolean not null default true,
  primary key (listing_id, date)
);

create index if not exists listing_calendar_day_overrides_listing_date_idx
  on public.listing_calendar_day_overrides (listing_id, date);

alter table public.listing_calendar_day_overrides enable row level security;

drop policy if exists listing_calendar_day_overrides_admin_all
  on public.listing_calendar_day_overrides;
create policy listing_calendar_day_overrides_admin_all
  on public.listing_calendar_day_overrides
  for all to authenticated
  using (public.is_listing_owner(listing_id) or public.is_admin())
  with check (public.is_listing_owner(listing_id) or public.is_admin());
