-- Backend integrity hardening:
-- - prevent new overlapping active bookings/holds
-- - make promo and credit mutations atomic
-- - align complaint subjects with the application API

alter table public.complaints
  drop constraint if exists complaints_subject_type_check;

alter table public.complaints
  add constraint complaints_subject_type_check
  check (subject_type in ('listing', 'host', 'guest', 'booking', 'other'));

alter table public.credit_grants
  add column if not exists source text,
  add column if not exists source_booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists parent_grant_id uuid references public.credit_grants(id) on delete set null,
  add column if not exists notes text;

create or replace function public.prevent_active_booking_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending_payment', 'requested', 'confirmed', 'in_stay') then
    perform pg_advisory_xact_lock(hashtext(new.listing_id::text));

    if exists (
      select 1
        from public.bookings b
       where b.listing_id = new.listing_id
         and b.id <> new.id
         and b.status in ('pending_payment', 'requested', 'confirmed', 'in_stay')
         and daterange(b.check_in, b.check_out, '[)') &&
             daterange(new.check_in, new.check_out, '[)')
    ) then
      raise exception 'Selected dates are no longer available'
        using errcode = '23P01';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_active_booking_overlap_trigger on public.bookings;
create trigger prevent_active_booking_overlap_trigger
before insert or update of listing_id, check_in, check_out, status on public.bookings
for each row execute function public.prevent_active_booking_overlap();

create or replace function public.prevent_active_hold_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.listing_id::text));

  if exists (
    select 1
      from public.bookings b
     where b.listing_id = new.listing_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_stay')
       and daterange(b.check_in, b.check_out, '[)') &&
           daterange(new.check_in, new.check_out, '[)')
  ) then
    raise exception 'Selected dates are no longer available'
      using errcode = '23P01';
  end if;

  if exists (
    select 1
      from public.booking_holds h
     where h.listing_id = new.listing_id
       and h.id <> new.id
       and h.guest_id <> new.guest_id
       and h.expires_at > now()
       and daterange(h.check_in, h.check_out, '[)') &&
           daterange(new.check_in, new.check_out, '[)')
  ) then
    raise exception 'Another guest is currently checking out for these dates'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_active_hold_overlap_trigger on public.booking_holds;
create trigger prevent_active_hold_overlap_trigger
before insert or update of listing_id, check_in, check_out, guest_id, expires_at on public.booking_holds
for each row execute function public.prevent_active_hold_overlap();

create or replace function public.issue_credit_grant_atomic(
  p_lot_id uuid,
  p_guest_id uuid,
  p_amount_cents bigint,
  p_currency text,
  p_source text,
  p_source_booking_id uuid default null,
  p_parent_grant_id uuid default null,
  p_expires_at timestamptz default null,
  p_notes text default null,
  p_deduct_from_lot boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  lot record;
  grant_id uuid;
begin
  if p_amount_cents <= 0 then
    return null;
  end if;

  select *
    into lot
    from public.credit_lots
   where id = p_lot_id
   for update;

  if not found then
    raise exception 'Credit lot not found';
  end if;

  if lot.currency <> p_currency then
    raise exception 'Credit lot currency mismatch';
  end if;

  if p_deduct_from_lot and lot.remaining_cents < p_amount_cents then
    raise exception 'Insufficient funds in credit lot';
  end if;

  insert into public.credit_grants (
    lot_id,
    guest_id,
    original_cents,
    remaining_cents,
    currency,
    expires_at,
    status,
    source,
    source_booking_id,
    parent_grant_id,
    notes
  )
  values (
    p_lot_id,
    p_guest_id,
    p_amount_cents,
    p_amount_cents,
    p_currency,
    p_expires_at,
    'active',
    p_source,
    p_source_booking_id,
    p_parent_grant_id,
    p_notes
  )
  returning id into grant_id;

  if p_deduct_from_lot then
    update public.credit_lots
       set remaining_cents = remaining_cents - p_amount_cents
     where id = p_lot_id;
  end if;

  return grant_id;
end;
$$;

create or replace function public.redeem_booking_credits(
  p_guest_id uuid,
  p_booking_id uuid,
  p_requested_cents bigint,
  p_currency text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_row record;
  remaining bigint := greatest(p_requested_cents, 0);
  burn bigint;
  total_redeemed bigint := 0;
begin
  if remaining <= 0 then
    return 0;
  end if;

  for grant_row in
    select id, remaining_cents, expires_at
      from public.credit_grants
     where guest_id = p_guest_id
       and status = 'active'
       and currency = p_currency
       and remaining_cents > 0
     order by expires_at asc nulls last, created_at asc
     for update
  loop
    exit when remaining <= 0;

    if grant_row.expires_at is not null and grant_row.expires_at < now() then
      update public.credit_grants
         set status = 'expired'
       where id = grant_row.id;
      continue;
    end if;

    burn := least(remaining, grant_row.remaining_cents);

    update public.credit_grants
       set remaining_cents = remaining_cents - burn,
           status = case when remaining_cents - burn = 0 then 'exhausted' else 'active' end
     where id = grant_row.id;

    insert into public.credit_redemptions (grant_id, booking_id, amount_cents)
    values (grant_row.id, p_booking_id, burn);

    insert into public.payment_history (
      booking_id,
      guest_id,
      kind,
      amount_cents,
      currency,
      credit_grant_id
    )
    values (
      p_booking_id,
      p_guest_id,
      'credit_redemption',
      burn,
      p_currency,
      grant_row.id
    );

    remaining := remaining - burn;
    total_redeemed := total_redeemed + burn;
  end loop;

  return total_redeemed;
end;
$$;

create or replace function public.record_promo_redemption(
  p_promo_id uuid,
  p_booking_id uuid,
  p_guest_id uuid,
  p_amount_cents bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  promo record;
  guest_uses integer;
  redemption_id uuid;
begin
  select *
    into promo
    from public.promo_codes
   where id = p_promo_id
   for update;

  if not found or not promo.is_active then
    raise exception 'Promo code not found';
  end if;

  if promo.starts_at is not null and promo.starts_at > now() then
    raise exception 'Promo not yet active';
  end if;

  if promo.expires_at is not null and promo.expires_at <= now() then
    raise exception 'Promo has expired';
  end if;

  if promo.max_redemptions is not null and promo.redemption_count >= promo.max_redemptions then
    raise exception 'Promo is fully redeemed';
  end if;

  select count(*)
    into guest_uses
    from public.promo_redemptions
   where promo_id = p_promo_id
     and guest_id = p_guest_id;

  if guest_uses >= coalesce(promo.per_user_limit, 1) then
    raise exception 'Per-user promo limit reached';
  end if;

  insert into public.promo_redemptions (
    promo_id,
    booking_id,
    guest_id,
    amount_cents
  )
  values (
    p_promo_id,
    p_booking_id,
    p_guest_id,
    p_amount_cents
  )
  returning id into redemption_id;

  update public.promo_codes
     set redemption_count = redemption_count + 1
   where id = p_promo_id;

  return redemption_id;
end;
$$;
