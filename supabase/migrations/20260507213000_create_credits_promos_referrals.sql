-- Phase 7: credits, promos, referrals
-- credit_lots issued by admin → credit_grants per-guest balances → credit_redemptions
-- ledger; promo_codes + promo_redemptions; referrals.

create table if not exists public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  total_cents bigint not null check (total_cents >= 0),
  remaining_cents bigint not null check (remaining_cents >= 0),
  currency text not null,
  expires_at timestamptz,
  created_by_admin uuid not null references public.profiles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.credit_lots(id) on delete restrict,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  original_cents bigint not null check (original_cents >= 0),
  remaining_cents bigint not null check (remaining_cents >= 0),
  currency text not null,
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'exhausted', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);
create index if not exists credit_grants_guest_status_idx
  on public.credit_grants (guest_id, status, expires_at);

create table if not exists public.credit_redemptions (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.credit_grants(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);
create index if not exists credit_redemptions_booking_idx
  on public.credit_redemptions (booking_id);

-- Wire payment_history FK now that credit_grants exists.
alter table public.payment_history
  drop constraint if exists payment_history_credit_grant_id_fkey;
alter table public.payment_history
  add constraint payment_history_credit_grant_id_fkey
  foreign key (credit_grant_id)
  references public.credit_grants(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- promo codes + redemptions
-- ---------------------------------------------------------------------------
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(10, 2) not null check (value > 0),
  max_redemptions integer,
  redemption_count integer not null default 0,
  per_user_limit smallint not null default 1,
  starts_at timestamptz,
  expires_at timestamptz,
  min_subtotal_cents bigint,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  guest_id uuid not null references public.profiles(id) on delete restrict,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (promo_id, booking_id)
);
create index if not exists promo_redemptions_guest_idx
  on public.promo_redemptions (guest_id);

alter table public.payment_history
  drop constraint if exists payment_history_promo_redemption_id_fkey;
alter table public.payment_history
  add constraint payment_history_promo_redemption_id_fkey
  foreign key (promo_redemption_id)
  references public.promo_redemptions(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------------
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_email text not null,
  referred_id uuid references public.profiles(id) on delete set null,
  reward_credit_grant_id uuid references public.credit_grants(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'signed_up', 'first_stay_complete', 'rewarded', 'expired')),
  created_at timestamptz not null default now()
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);
create index if not exists referrals_email_idx on public.referrals (referred_email);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.credit_lots enable row level security;
alter table public.credit_grants enable row level security;
alter table public.credit_redemptions enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.referrals enable row level security;

-- credit_lots: admin only.
drop policy if exists credit_lots_admin_all on public.credit_lots;
create policy credit_lots_admin_all on public.credit_lots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- credit_grants: guest sees own (so they can see their balance), admin sees all.
drop policy if exists credit_grants_guest_read on public.credit_grants;
create policy credit_grants_guest_read on public.credit_grants
  for select to authenticated using (guest_id = auth.uid() or public.is_admin());
drop policy if exists credit_grants_admin_write on public.credit_grants;
create policy credit_grants_admin_write on public.credit_grants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- credit_redemptions: guest sees own (via booking), admin all.
drop policy if exists credit_redemptions_visibility on public.credit_redemptions;
create policy credit_redemptions_visibility on public.credit_redemptions
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.bookings b
       where b.id = credit_redemptions.booking_id
         and b.guest_id = auth.uid()
    )
  );

-- promo_codes: public read for active+within-window (so checkout can validate);
-- admin write.
drop policy if exists promo_codes_public_read on public.promo_codes;
create policy promo_codes_public_read on public.promo_codes
  for select using (is_active = true);
drop policy if exists promo_codes_admin_all on public.promo_codes;
create policy promo_codes_admin_all on public.promo_codes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- promo_redemptions: guest sees own, admin all.
drop policy if exists promo_redemptions_visibility on public.promo_redemptions;
create policy promo_redemptions_visibility on public.promo_redemptions
  for select to authenticated using (guest_id = auth.uid() or public.is_admin());

-- referrals: self read+write, admin all.
drop policy if exists referrals_self_all on public.referrals;
create policy referrals_self_all on public.referrals
  for all to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin())
  with check (referrer_id = auth.uid() or public.is_admin());
