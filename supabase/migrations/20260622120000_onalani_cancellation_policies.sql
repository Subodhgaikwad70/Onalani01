-- Onalani cancellation tiers: Firm, Super Strict, Non-refundable.
-- Replaces legacy Airbnb-style policies with platform-specific rules.

-- ---------------------------------------------------------------------------
-- Recovery entitlements (credits issued when cancelled dates are re-booked)
-- ---------------------------------------------------------------------------
create table if not exists public.cancellation_recovery_entitlements (
  id uuid primary key default gen_random_uuid(),
  source_booking_id uuid not null references public.bookings(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  currency text not null,
  max_recovery_cents bigint not null check (max_recovery_cents >= 0),
  fulfilled_cents bigint not null default 0 check (fulfilled_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'fulfilled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cancellation_recovery_entitlements_listing_dates_idx
  on public.cancellation_recovery_entitlements (listing_id, check_in, check_out)
  where status = 'pending';

create index if not exists cancellation_recovery_entitlements_guest_idx
  on public.cancellation_recovery_entitlements (guest_id, status);

-- ---------------------------------------------------------------------------
-- Seed Onalani policies (deactivate legacy keys)
-- ---------------------------------------------------------------------------
update public.cancellation_policies
  set is_active = false
  where key in ('flexible', 'moderate', 'strict', 'super_strict');

-- Firm: higher rate, maximum flexibility
insert into public.cancellation_policies (key, label, rules, is_active) values
  ('firm', 'Firm',
   '[
     {"hours_before":720,"cash_refund_pct":100,"processing_fee_pct":3},
     {"hours_before":240,"cash_refund_pct":50,"credit_max_pct":50,"recovery_based":true},
     {"hours_before":0,"cash_refund_pct":0,"credit_max_pct":100,"recovery_based":true}
   ]'::jsonb,
   true)
on conflict (key) do update
  set label = excluded.label,
      rules = excluded.rules,
      is_active = true;

-- Super Strict: lower rate, reduced flexibility
insert into public.cancellation_policies (key, label, rules, is_active) values
  ('super_strict', 'Super Strict',
   '[
     {"hours_before":2160,"cash_refund_pct":100,"processing_fee_pct":3},
     {"hours_before":1440,"cash_refund_pct":50,"credit_min_pct":25,"credit_max_pct":50,"recovery_based":true},
     {"hours_before":720,"cash_refund_pct":0,"credit_min_pct":15,"recovery_based":true},
     {"hours_before":0,"cash_refund_pct":0,"credit_max_pct":50,"recovery_based":true}
   ]'::jsonb,
   true)
on conflict (key) do update
  set label = excluded.label,
      rules = excluded.rules,
      is_active = true;

-- Non-refundable: no cash; 15% credit minimum if cancelled 45+ days out
insert into public.cancellation_policies (key, label, rules, is_active) values
  ('non_refundable', 'Non-refundable',
   '[
     {"hours_before":1080,"cash_refund_pct":0,"credit_min_pct":15},
     {"hours_before":0,"cash_refund_pct":0,"credit_max_pct":100,"recovery_based":true}
   ]'::jsonb,
   true)
on conflict (key) do update
  set label = excluded.label,
      rules = excluded.rules,
      is_active = true;

-- Default new properties to Super Strict when unset
update public.properties
  set cancellation_policy_id = (
    select id from public.cancellation_policies where key = 'super_strict' limit 1
  )
  where cancellation_policy_id is null
    or cancellation_policy_id in (
      select id from public.cancellation_policies where is_active = false
    );
