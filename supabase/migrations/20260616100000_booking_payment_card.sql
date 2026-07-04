-- Store non-sensitive card summary shown on reservation details.
alter table public.bookings
  add column if not exists payment_card_last4 text,
  add column if not exists payment_card_brand text;
