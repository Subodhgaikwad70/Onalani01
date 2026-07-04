-- Allow platform admins to send messages in any conversation (moderation / support).

drop policy if exists messages_admin_insert on public.messages;

create policy messages_admin_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_admin()
    and exists (
      select 1 from public.conversations c
       where c.id = messages.conversation_id
    )
  );
