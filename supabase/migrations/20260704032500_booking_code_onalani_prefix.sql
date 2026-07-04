-- New reservation confirmation codes use the public ONA + hex format.
alter table public.bookings
  alter column code set default
  ('ONA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
