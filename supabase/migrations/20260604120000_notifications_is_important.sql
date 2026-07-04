alter table public.notifications
  add column if not exists is_important boolean not null default false;

create index if not exists notifications_recipient_important_idx
  on public.notifications (recipient_id, is_important, created_at desc)
  where is_important = true;
