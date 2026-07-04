-- Enforce one conversation per booking and merge any duplicates created before
-- guest/admin threads were unified (admin_id null vs set counted as different rows).

-- Move messages from duplicate booking threads into the keeper (most recent activity).
with ranked as (
  select
    id,
    booking_id,
    row_number() over (
      partition by booking_id
      order by last_message_at desc nulls last, created_at desc
    ) as rn
  from public.conversations
  where booking_id is not null
),
keepers as (
  select id as keep_id, booking_id
  from ranked
  where rn = 1
)
update public.messages m
set conversation_id = k.keep_id
from public.conversations c
join keepers k on k.booking_id = c.booking_id
where m.conversation_id = c.id
  and c.id <> k.keep_id;

with ranked as (
  select
    id,
    booking_id,
    row_number() over (
      partition by booking_id
      order by last_message_at desc nulls last, created_at desc
    ) as rn
  from public.conversations
  where booking_id is not null
)
delete from public.conversations c
using ranked r
where c.id = r.id
  and r.rn > 1;

drop index if exists public.conversations_pair_booking_uniq;

create unique index if not exists conversations_booking_id_uniq
  on public.conversations (booking_id)
  where booking_id is not null;

-- Non-booking threads: one open thread per guest + listing (or guest + admin for DMs).
create unique index if not exists conversations_guest_listing_uniq
  on public.conversations (guest_id, listing_id)
  where booking_id is null and listing_id is not null;
