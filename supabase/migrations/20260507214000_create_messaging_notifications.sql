-- Phase 9: conversations, messages, attachments, notifications

-- ---------------------------------------------------------------------------
-- conversations: guest ↔ platform admin pool, optionally tied to booking/listing
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  subject text,
  last_message_at timestamptz,
  last_message_preview text,
  guest_unread_count integer not null default 0,
  admin_unread_count integer not null default 0,
  archived_by_guest boolean not null default false,
  archived_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists conversations_pair_booking_uniq
  on public.conversations (guest_id, coalesce(admin_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(booking_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists conversations_guest_recent_idx
  on public.conversations (guest_id, last_message_at desc);
create index if not exists conversations_admin_recent_idx
  on public.conversations (admin_id, last_message_at desc) where admin_id is not null;

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  is_system boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,
  url text not null,
  content_type text,
  size_bytes bigint
);
create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

-- ---------------------------------------------------------------------------
-- notifications: in-app inbox + push fanout
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- Trigger: when a message is inserted, bump conversations.last_message_* and
-- the appropriate unread counter.
-- ---------------------------------------------------------------------------
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv record;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  if not found then return null; end if;

  update public.conversations c
     set last_message_at = new.created_at,
         last_message_preview = substring(new.body for 200),
         guest_unread_count = case
           when conv.admin_id is not null and new.sender_id = conv.admin_id
           then conv.guest_unread_count + 1
           else conv.guest_unread_count
         end,
         admin_unread_count = case
           when new.sender_id = conv.guest_id
           then conv.admin_unread_count + 1
           else conv.admin_unread_count
         end,
         archived_by_guest = false,
         archived_by_admin = false
   where c.id = new.conversation_id;
  return null;
end;
$$;

drop trigger if exists messages_bump_conversation on public.messages;
create trigger messages_bump_conversation
after insert on public.messages
for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists conversations_participant_all on public.conversations;
create policy conversations_participant_all on public.conversations
  for all to authenticated
  using (
    guest_id = auth.uid()
    or admin_id = auth.uid()
    or public.is_admin()
  )
  with check (
    guest_id = auth.uid()
    or admin_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists messages_participant_select on public.messages;
create policy messages_participant_select on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and (
           c.guest_id = auth.uid()
           or c.admin_id = auth.uid()
           or public.is_admin()
         )
    )
  );

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
         and (
           c.guest_id = auth.uid()
           or c.admin_id = auth.uid()
           or public.is_admin()
         )
    )
  );

drop policy if exists messages_owner_update on public.messages;
create policy messages_owner_update on public.messages
  for update to authenticated using (sender_id = auth.uid() or public.is_admin())
  with check (sender_id = auth.uid() or public.is_admin());

drop policy if exists message_attachments_visibility on public.message_attachments;
create policy message_attachments_visibility on public.message_attachments
  for select using (
    exists (
      select 1 from public.messages m
        join public.conversations c on c.id = m.conversation_id
       where m.id = message_attachments.message_id
         and (
           c.guest_id = auth.uid()
           or c.admin_id = auth.uid()
           or public.is_admin()
         )
    )
  );
drop policy if exists message_attachments_owner_write on public.message_attachments;
create policy message_attachments_owner_write on public.message_attachments
  for all to authenticated using (
    exists (
      select 1 from public.messages m
       where m.id = message_attachments.message_id and m.sender_id = auth.uid()
    ) or public.is_admin()
  ) with check (
    exists (
      select 1 from public.messages m
       where m.id = message_attachments.message_id and m.sender_id = auth.uid()
    ) or public.is_admin()
  );

drop policy if exists notifications_self_all on public.notifications;
create policy notifications_self_all on public.notifications
  for all to authenticated
  using (recipient_id = auth.uid() or public.is_admin())
  with check (recipient_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime: enable for messages + notifications so clients can subscribe.
-- (Channels created on the client; RLS still applies.)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
exception when undefined_object then
  -- supabase_realtime publication not configured in this DB; skip.
  null;
end$$;
