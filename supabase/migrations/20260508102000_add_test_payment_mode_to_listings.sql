-- Host-controlled local testing mode:
-- when enabled, instant-book listings can complete booking without Stripe.
alter table public.listings
  add column if not exists test_payment_mode boolean not null default false;

comment on column public.listings.test_payment_mode is
  'If true, booking flow bypasses Stripe for this listing (testing only).';
