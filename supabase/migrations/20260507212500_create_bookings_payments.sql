-- Phase 6: bookings, payments (platform-owned; direct Stripe charges)
-- Adds cancellation_policies, the bookings core table + holds + request-to-book,
-- and payment_history ledger.

-- ---------------------------------------------------------------------------
-- cancellation_policies + add FK from properties
-- ---------------------------------------------------------------------------
create table if not exists public.cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  rules jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed canonical Airbnb-style policies. Rules: cumulative; each entry is the
-- minimum hours-before-checkin required to receive a given % refund.
insert into public.cancellation_policies (key, label, rules) values
  ('flexible',  'Flexible',
   '[{"hours_before":24,"refund_pct":100},{"hours_before":0,"refund_pct":0}]'::jsonb),
  ('moderate',  'Moderate',
   '[{"hours_before":120,"refund_pct":100},{"hours_before":24,"refund_pct":50},{"hours_before":0,"refund_pct":0}]'::jsonb),
  ('strict',    'Strict',
   '[{"hours_before":168,"refund_pct":100},{"hours_before":48,"refund_pct":50},{"hours_before":0,"refund_pct":0}]'::jsonb),
  ('super_strict', 'Super Strict',
   '[{"hours_before":720,"refund_pct":50},{"hours_before":0,"refund_pct":0}]'::jsonb)
on conflict (key) do update
  set label = excluded.label,
      rules = excluded.rules,
      is_active = true;

alter table public.properties
  drop constraint if exists properties_cancellation_policy_id_fkey;
alter table public.properties
  add constraint properties_cancellation_policy_id_fkey
  foreign key (cancellation_policy_id)
  references public.cancellation_policies(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- booking_status enum (pending_payment, requested, confirmed, ...)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum (
      'pending_payment',
      'requested',
      'confirmed',
      'in_stay',
      'completed',
      'cancelled_by_guest',
      'cancelled_by_admin',
      'expired',
      'declined'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text unique not null
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  guest_id uuid not null references public.profiles(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  nights integer generated always as ((check_out - check_in)) stored,
  adults smallint not null default 1 check (adults >= 0),
  children smallint not null default 0 check (children >= 0),
  infants smallint not null default 0 check (infants >= 0),
  pets smallint not null default 0 check (pets >= 0),
  status public.booking_status not null default 'pending_payment',
  is_instant_book boolean not null default false,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  cleaning_fee_cents bigint not null default 0,
  extra_guest_fee_cents bigint not null default 0,
  service_fee_cents bigint not null default 0,
  taxes_cents bigint not null default 0,
  credit_applied_cents bigint not null default 0,
  promo_discount_cents bigint not null default 0,
  total_cents bigint not null check (total_cents >= 0),
  currency text not null,
  pricing_breakdown jsonb not null,
  cancellation_policy_snapshot jsonb not null,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  beds24_booking_id text,
  guest_notes text,
  admin_notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

create index if not exists bookings_guest_status_idx on public.bookings (guest_id, status);
create index if not exists bookings_listing_dates_idx on public.bookings (listing_id, check_in, check_out);
create index if not exists bookings_status_idx on public.bookings (status);

-- ---------------------------------------------------------------------------
-- booking_requests: extra metadata for request-to-book bookings
-- ---------------------------------------------------------------------------
create table if not exists public.booking_requests (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  message text,
  expires_at timestamptz not null,
  decided_at timestamptz,
  decision text check (decision in ('approved', 'declined', 'expired'))
);

-- ---------------------------------------------------------------------------
-- booking_holds: short-lived locks while guest is at checkout
-- ---------------------------------------------------------------------------
create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists booking_holds_listing_dates_idx
  on public.booking_holds (listing_id, check_in, check_out, expires_at);

-- ---------------------------------------------------------------------------
-- payment_history (signed-amount ledger). Includes platform fees.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_kind') then
    create type public.payment_kind as enum (
      'charge',
      'refund',
      'credit_redemption',
      'credit_refund',
      'promo_discount',
      'platform_fee'
    );
  end if;
end$$;

create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  guest_id uuid references public.profiles(id) on delete set null,
  kind public.payment_kind not null,
  amount_cents bigint not null,
  currency text not null,
  stripe_object_id text,
  credit_grant_id uuid,    -- FK added in Phase 7 once credit_grants exists
  promo_redemption_id uuid, -- FK added in Phase 7
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_history_booking_idx on public.payment_history (booking_id);
create index if not exists payment_history_guest_idx on public.payment_history (guest_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.cancellation_policies enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_requests enable row level security;
alter table public.booking_holds enable row level security;
alter table public.payment_history enable row level security;

-- cancellation_policies: public read, admin write.
drop policy if exists cancellation_policies_public_read on public.cancellation_policies;
create policy cancellation_policies_public_read on public.cancellation_policies
  for select using (is_active = true);
drop policy if exists cancellation_policies_admin_all on public.cancellation_policies;
create policy cancellation_policies_admin_all on public.cancellation_policies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- bookings: guest sees own, admin sees all.
drop policy if exists bookings_guest_read on public.bookings;
create policy bookings_guest_read on public.bookings
  for select to authenticated
  using (guest_id = auth.uid() or public.is_admin());

drop policy if exists bookings_guest_write on public.bookings;
create policy bookings_guest_write on public.bookings
  for update to authenticated
  using (guest_id = auth.uid() or public.is_admin())
  with check (guest_id = auth.uid() or public.is_admin());

-- booking_requests + holds: same scope as bookings.
drop policy if exists booking_requests_scoped on public.booking_requests;
create policy booking_requests_scoped on public.booking_requests
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_requests.booking_id
         and (b.guest_id = auth.uid() or public.is_admin())
    ) or public.is_admin()
  );

drop policy if exists booking_holds_self_read on public.booking_holds;
create policy booking_holds_self_read on public.booking_holds
  for select to authenticated
  using (guest_id = auth.uid() or public.is_admin());

-- payment_history: guest sees their charges/refunds; admin sees all.
drop policy if exists payment_history_visibility on public.payment_history;
create policy payment_history_visibility on public.payment_history
  for select to authenticated
  using (guest_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Aggregate booking nights into availability_cache when bookings change so the
-- listing can't be double-booked. (We treat booking days as unavailable.)
-- ---------------------------------------------------------------------------
create or replace function public.bookings_invalidate_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
  start_date date;
  end_date date;
  target uuid;
begin
  if tg_op = 'INSERT' then
    start_date := new.check_in;
    end_date := new.check_out;
    target := new.listing_id;
  elsif tg_op = 'UPDATE' then
    start_date := least(coalesce(old.check_in, new.check_in), new.check_in);
    end_date := greatest(coalesce(old.check_out, new.check_out), new.check_out);
    target := new.listing_id;
  else -- DELETE
    start_date := old.check_in;
    end_date := old.check_out;
    target := old.listing_id;
  end if;

  delete from public.availability_cache
   where listing_id = target
     and date >= start_date
     and date < end_date;

  return null;
end;
$$;

drop trigger if exists bookings_invalidate_availability_trigger on public.bookings;
create trigger bookings_invalidate_availability_trigger
after insert or update or delete on public.bookings
for each row execute function public.bookings_invalidate_availability();
