-- Beds24 Stripe channel payments (property Stripe account via Beds24 API v2)

alter table public.bookings
  add column if not exists payment_provider text not null default 'platform'
    check (payment_provider in ('platform', 'beds24_stripe'));

alter table public.bookings
  add column if not exists beds24_stripe_session_id text;

alter table public.bookings
  add column if not exists stripe_connect_account_id text;

create index if not exists bookings_payment_provider_idx
  on public.bookings (payment_provider)
  where payment_provider = 'beds24_stripe';
