-- Phase 10: trust, safety, admin

-- ---------------------------------------------------------------------------
-- complaints (mailbox style — supports threaded admin replies via complaint_messages)
-- ---------------------------------------------------------------------------
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  subject_type text not null
    check (subject_type in ('listing', 'guest', 'booking', 'other')),
  subject_id uuid,
  category text not null
    check (category in ('safety', 'fraud', 'discrimination', 'cleanliness', 'misrepresentation', 'cancellation', 'other')),
  title text not null,
  body text not null,
  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'closed')),
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  resolution_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_complaints_updated_at on public.complaints;
create trigger set_complaints_updated_at
before update on public.complaints
for each row execute function public.set_updated_at();
create index if not exists complaints_status_idx on public.complaints (status, created_at desc);
create index if not exists complaints_reporter_idx on public.complaints (reporter_id);

create table if not exists public.complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists complaint_messages_complaint_idx
  on public.complaint_messages (complaint_id, created_at);

create table if not exists public.complaint_attachments (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  storage_path text not null,
  url text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reports: lightweight content/user reports (different from complaints which are formal)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  target_type text not null
    check (target_type in ('listing', 'profile', 'review', 'message')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now()
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_target_idx on public.reports (target_type, target_id);

-- ---------------------------------------------------------------------------
-- user_suspensions
-- ---------------------------------------------------------------------------
create table if not exists public.user_suspensions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  suspended_by uuid not null references public.profiles(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists user_suspensions_profile_active_idx
  on public.user_suspensions (profile_id, is_active);

-- ---------------------------------------------------------------------------
-- insurance_claims (post-stay damage / liability)
-- ---------------------------------------------------------------------------
create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  filed_by uuid not null references public.profiles(id),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'approved', 'rejected', 'paid')),
  amount_claimed_cents bigint not null check (amount_claimed_cents >= 0),
  amount_approved_cents bigint,
  currency text not null,
  description text not null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists set_insurance_claims_updated_at on public.insurance_claims;
create trigger set_insurance_claims_updated_at
before update on public.insurance_claims
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- admin_audit_log: who-did-what for sensitive admin actions
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_admin_idx
  on public.admin_audit_log (admin_id, created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.complaints enable row level security;
alter table public.complaint_messages enable row level security;
alter table public.complaint_attachments enable row level security;
alter table public.reports enable row level security;
alter table public.user_suspensions enable row level security;
alter table public.insurance_claims enable row level security;
alter table public.admin_audit_log enable row level security;
-- complaints: reporter sees own, admin sees all.
drop policy if exists complaints_self_read on public.complaints;
create policy complaints_self_read on public.complaints
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists complaints_self_write on public.complaints;
create policy complaints_self_write on public.complaints
  for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists complaints_admin_all on public.complaints;
create policy complaints_admin_all on public.complaints
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- complaint_messages: scoped via parent.
drop policy if exists complaint_messages_visibility on public.complaint_messages;
create policy complaint_messages_visibility on public.complaint_messages
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.complaints c
       where c.id = complaint_messages.complaint_id
         and c.reporter_id = auth.uid()
         and complaint_messages.is_internal = false
    )
  );

drop policy if exists complaint_messages_author_insert on public.complaint_messages;
create policy complaint_messages_author_insert on public.complaint_messages
  for insert to authenticated with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.complaints c
         where c.id = complaint_messages.complaint_id
           and c.reporter_id = auth.uid()
      )
    )
  );

drop policy if exists complaint_attachments_visibility on public.complaint_attachments;
create policy complaint_attachments_visibility on public.complaint_attachments
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.complaints c
       where c.id = complaint_attachments.complaint_id
         and c.reporter_id = auth.uid()
    )
  );

-- reports: reporter sees own, admin sees all + writes.
drop policy if exists reports_self_read on public.reports;
create policy reports_self_read on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
drop policy if exists reports_self_insert on public.reports;
create policy reports_self_insert on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists reports_admin_all on public.reports;
create policy reports_admin_all on public.reports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- user_suspensions: subject sees own, admin all.
drop policy if exists user_suspensions_self_read on public.user_suspensions;
create policy user_suspensions_self_read on public.user_suspensions
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());
drop policy if exists user_suspensions_admin_all on public.user_suspensions;
create policy user_suspensions_admin_all on public.user_suspensions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- insurance_claims: filer + booking parties + admin.
drop policy if exists insurance_claims_visibility on public.insurance_claims;
create policy insurance_claims_visibility on public.insurance_claims
  for select to authenticated using (
    public.is_admin()
    or filed_by = auth.uid()
    or exists (
      select 1 from public.bookings b
       where b.id = insurance_claims.booking_id
         and b.guest_id = auth.uid()
    )
  );
drop policy if exists insurance_claims_filer_insert on public.insurance_claims;
create policy insurance_claims_filer_insert on public.insurance_claims
  for insert to authenticated with check (filed_by = auth.uid());
drop policy if exists insurance_claims_admin_write on public.insurance_claims;
create policy insurance_claims_admin_write on public.insurance_claims
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- admin_audit_log: admin read only; service-role inserts.
drop policy if exists admin_audit_log_admin_read on public.admin_audit_log;
create policy admin_audit_log_admin_read on public.admin_audit_log
  for select to authenticated using (public.is_admin());
