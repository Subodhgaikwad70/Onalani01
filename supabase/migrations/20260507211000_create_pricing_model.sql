-- Phase 3: pricing & taxes
-- Adds listing_fees, listing_pricing_rules, tax_rates, property_tax_rates.

create table if not exists public.listing_fees (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  kind text not null
    check (kind in ('cleaning', 'extra_guest', 'pet', 'service', 'resort')),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null,
  applies_per text not null default 'stay'
    check (applies_per in ('stay', 'night', 'guest_night')),
  threshold integer
);
create index if not exists listing_fees_listing_idx on public.listing_fees (listing_id);

create table if not exists public.listing_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  kind text not null
    check (kind in ('weekend', 'seasonal', 'length_of_stay', 'early_bird', 'last_minute')),
  config jsonb not null,
  starts_on date,
  ends_on date,
  priority smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists listing_pricing_rules_listing_idx
  on public.listing_pricing_rules (listing_id);

create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  kind text not null
    check (kind in ('occupancy', 'vat', 'city', 'state', 'federal', 'service')),
  rate_pct numeric(6, 3) not null check (rate_pct >= 0 and rate_pct <= 100),
  applies_to text not null default 'subtotal'
    check (applies_to in ('subtotal', 'nightly', 'fees', 'total')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists tax_rates_jurisdiction_idx on public.tax_rates (jurisdiction);

create table if not exists public.property_tax_rates (
  property_id uuid not null references public.properties(id) on delete cascade,
  tax_rate_id uuid not null references public.tax_rates(id) on delete restrict,
  primary key (property_id, tax_rate_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.listing_fees enable row level security;
alter table public.listing_pricing_rules enable row level security;
alter table public.tax_rates enable row level security;
alter table public.property_tax_rates enable row level security;

-- listing_fees + listing_pricing_rules: public read for published listings,
-- host/admin write.
do $$
declare
  t text;
begin
  for t in select unnest(array['listing_fees', 'listing_pricing_rules']) loop
    execute format($f$
      drop policy if exists %1$I_public_read on public.%1$I;
      create policy %1$I_public_read on public.%1$I
        for select using (
          exists (
            select 1 from public.listings l
              join public.properties p on p.id = l.property_id
             where l.id = %1$I.listing_id
               and l.is_active = true
               and p.status = 'published'
          )
        );
      drop policy if exists %1$I_owner_all on public.%1$I;
      create policy %1$I_owner_all on public.%1$I
        for all to authenticated
        using (public.is_listing_owner(%1$I.listing_id) or public.is_admin())
        with check (public.is_listing_owner(%1$I.listing_id) or public.is_admin());
    $f$, t);
  end loop;
end$$;

-- tax_rates: public read, admin write.
drop policy if exists tax_rates_public_read on public.tax_rates;
create policy tax_rates_public_read on public.tax_rates
  for select using (is_active = true);
drop policy if exists tax_rates_admin_all on public.tax_rates;
create policy tax_rates_admin_all on public.tax_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- property_tax_rates: public read for published, admin write.
drop policy if exists property_tax_rates_public_read on public.property_tax_rates;
create policy property_tax_rates_public_read on public.property_tax_rates
  for select using (
    exists (
      select 1 from public.properties p
       where p.id = property_tax_rates.property_id
         and p.status = 'published'
    )
  );

drop policy if exists property_tax_rates_admin_all on public.property_tax_rates;
create policy property_tax_rates_admin_all on public.property_tax_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
