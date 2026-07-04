-- Allow change requests to wait for guest payment before applying.

alter table public.booking_change_requests
  drop constraint if exists booking_change_requests_status_check;

alter table public.booking_change_requests
  add constraint booking_change_requests_status_check
  check (
    status in (
      'pending',
      'approved',
      'approved_pending_payment',
      'declined',
      'withdrawn'
    )
  );
