alter table public.bookings
  add column if not exists beds24_stripe_checkout_url text;
