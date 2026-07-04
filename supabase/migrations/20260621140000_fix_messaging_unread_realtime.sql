-- Fix guest unread counts for system messages and admin replies without assigned admin_id.
-- Enable realtime on conversations so inbox lists refresh without a page reload.

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
           when new.is_system then conv.guest_unread_count + 1
           when new.sender_id is distinct from conv.guest_id then conv.guest_unread_count + 1
           else conv.guest_unread_count
         end,
         admin_unread_count = case
           when new.is_system then conv.admin_unread_count + 1
           when new.sender_id = conv.guest_id and not new.is_system then conv.admin_unread_count + 1
           else conv.admin_unread_count
         end,
         archived_by_guest = false,
         archived_by_admin = false
   where c.id = new.conversation_id;
  return null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;
exception when undefined_object then
  null;
end$$;
