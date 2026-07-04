-- Guest message notifications were stored with /admin/inbox links (sender-based);
-- guests hit /admin and see "Access denied". Point them to /account/messages instead.
update public.notifications n
set link = replace(n.link, '/admin/inbox/', '/account/messages/')
from public.profiles p
where n.recipient_id = p.id
  and p.role = 'guest'
  and n.kind = 'message_received'
  and n.link like '/admin/inbox/%';
