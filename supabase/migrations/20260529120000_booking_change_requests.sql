-- Booking modification requests: guest or admin proposes new dates/guests/pricing;
-- changes apply to bookings when staff approves (admin may auto-apply on submit).

create table if not exists public.booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_by_role text not null check (requested_by_role in ('guest', 'admin')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  check_in date not null,
  check_out date not null,
  adults smallint not null check (adults >= 1),
  children smallint not null default 0 check (children >= 0),
  infants smallint not null default 0 check (infants >= 0),
  pets smallint not null default 0 check (pets >= 0),
  guest_notes text,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  cleaning_fee_cents bigint not null default 0,
  extra_guest_fee_cents bigint not null default 0,
  service_fee_cents bigint not null default 0,
  taxes_cents bigint not null default 0,
  total_cents bigint not null check (total_cents >= 0),
  currency text not null,
  pricing_breakdown jsonb not null,
  message text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

create unique index if not exists booking_change_requests_one_pending_idx
  on public.booking_change_requests (booking_id)
  where (status = 'pending');

create index if not exists booking_change_requests_booking_idx
  on public.booking_change_requests (booking_id, created_at desc);

drop trigger if exists set_booking_change_requests_updated_at on public.booking_change_requests;
create trigger set_booking_change_requests_updated_at
before update on public.booking_change_requests
for each row execute function public.set_updated_at();

alter table public.booking_change_requests enable row level security;

drop policy if exists booking_change_requests_read on public.booking_change_requests;
create policy booking_change_requests_read on public.booking_change_requests
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
       where b.id = booking_change_requests.booking_id
         and b.guest_id = auth.uid()
    )
  );
