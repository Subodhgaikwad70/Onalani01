-- Reservation confirmation codes are public ONA + 8-digit numeric identifiers.
do $$
declare
  booking_record record;
  new_code text;
begin
  for booking_record in
    select id
    from public.bookings
    where code !~ '^ONA[0-9]{8}$'
    order by created_at, id
  loop
    loop
      new_code := 'ONA' || lpad(floor(random() * 100000000)::int::text, 8, '0');
      exit when not exists (
        select 1
        from public.bookings
        where code = new_code
      );
    end loop;

    update public.bookings
    set code = new_code
    where id = booking_record.id;
  end loop;
end $$;

alter table public.bookings
  alter column code set default
  ('ONA' || lpad(floor(random() * 100000000)::int::text, 8, '0'));
