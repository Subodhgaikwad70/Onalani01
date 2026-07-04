alter table public.complaints
  drop constraint if exists complaints_subject_type_check;

alter table public.complaints
  add constraint complaints_subject_type_check
  check (subject_type in ('listing', 'host', 'guest', 'booking', 'other'));
