-- Per-day Beds24 / cache nuance: check-in/out rules and max length of stay.

alter table public.availability_cache
  add column if not exists override_status text not null default 'none'
    check (
      override_status in (
        'none',
        'nocheckin',
        'nocheckout',
        'nocheckinorcheckout'
      )
    ),
  add column if not exists max_stay smallint
    check (max_stay is null or max_stay >= 1);

comment on column public.availability_cache.override_status is
  'none | nocheckin | nocheckout | nocheckinorcheckout — refinements on top of is_available';
comment on column public.availability_cache.max_stay is
  'Maximum stay (nights) allowed from Beds24 calendar when present; null if unknown.';
