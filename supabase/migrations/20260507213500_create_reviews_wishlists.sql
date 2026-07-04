-- Phase 8: wishlists + two-way reviews

-- ---------------------------------------------------------------------------
-- wishlists (multi-named lists per guest) + wishlist_items
-- ---------------------------------------------------------------------------
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'My Wishlist',
  is_public boolean not null default false,
  share_token text unique,
  created_at timestamptz not null default now()
);
create index if not exists wishlists_guest_idx on public.wishlists (guest_id);

create table if not exists public.wishlist_items (
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  notes text,
  added_at timestamptz not null default now(),
  primary key (wishlist_id, listing_id)
);
create index if not exists wishlist_items_listing_idx on public.wishlist_items (listing_id);

-- ---------------------------------------------------------------------------
-- reviews (two-way: guest reviews listing OR host reviews guest)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'review_subject') then
    create type public.review_subject as enum ('listing', 'guest');
  end if;
end$$;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  author_id uuid not null references public.profiles(id) on delete restrict,
  subject_type public.review_subject not null,
  subject_id uuid not null,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  public_body text,
  private_feedback text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, author_id, subject_type)
);
create index if not exists reviews_subject_idx on public.reviews (subject_type, subject_id, is_published);
create index if not exists reviews_booking_idx on public.reviews (booking_id);

create table if not exists public.review_criteria_scores (
  review_id uuid not null references public.reviews(id) on delete cascade,
  criterion text not null
    check (criterion in ('cleanliness', 'accuracy', 'communication', 'location', 'check_in', 'value')),
  score smallint not null check (score between 1 and 5),
  primary key (review_id, criterion)
);

create table if not exists public.review_responses (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Trigger: refresh listings.rating_avg + rating_count when a review for that
-- listing is published or unpublished.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_listing_rating(target_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  avg_score numeric;
  cnt integer;
begin
  select round(avg(overall_rating)::numeric, 2), count(*)
    into avg_score, cnt
    from public.reviews
   where subject_type = 'listing'
     and subject_id = target_listing_id
     and is_published = true;

  update public.listings
     set rating_avg = avg_score,
         rating_count = coalesce(cnt, 0)
   where id = target_listing_id;
end;
$$;

create or replace function public.reviews_after_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.subject_type = 'listing' then
    perform public.refresh_listing_rating(new.subject_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.subject_type = 'listing' and old.subject_id is not null then
    perform public.refresh_listing_rating(old.subject_id);
  end if;
  return null;
end;
$$;

drop trigger if exists reviews_rating_refresh on public.reviews;
create trigger reviews_rating_refresh
after insert or update or delete on public.reviews
for each row execute function public.reviews_after_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.reviews enable row level security;
alter table public.review_criteria_scores enable row level security;
alter table public.review_responses enable row level security;

-- wishlists: self all + public read for is_public.
drop policy if exists wishlists_public_read on public.wishlists;
create policy wishlists_public_read on public.wishlists
  for select using (is_public = true);

drop policy if exists wishlists_self_all on public.wishlists;
create policy wishlists_self_all on public.wishlists
  for all to authenticated
  using (guest_id = auth.uid() or public.is_admin())
  with check (guest_id = auth.uid() or public.is_admin());

-- wishlist_items: scoped via parent wishlist's guest_id.
drop policy if exists wishlist_items_visibility on public.wishlist_items;
create policy wishlist_items_visibility on public.wishlist_items
  for select using (
    exists (
      select 1 from public.wishlists w
       where w.id = wishlist_items.wishlist_id
         and (w.is_public = true or w.guest_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists wishlist_items_self_write on public.wishlist_items;
create policy wishlist_items_self_write on public.wishlist_items
  for all to authenticated using (
    exists (
      select 1 from public.wishlists w
       where w.id = wishlist_items.wishlist_id and w.guest_id = auth.uid()
    ) or public.is_admin()
  ) with check (
    exists (
      select 1 from public.wishlists w
       where w.id = wishlist_items.wishlist_id and w.guest_id = auth.uid()
    ) or public.is_admin()
  );

-- reviews: published listing reviews are public; the author + the subject
-- (guest reviewed by host) can see unpublished + private feedback.
drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews
  for select using (is_published = true);

drop policy if exists reviews_author_read on public.reviews;
create policy reviews_author_read on public.reviews
  for select to authenticated
  using (author_id = auth.uid() or subject_id = auth.uid() or public.is_admin());

drop policy if exists reviews_self_write on public.reviews;
create policy reviews_self_write on public.reviews
  for all to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists review_criteria_scores_public_read on public.review_criteria_scores;
create policy review_criteria_scores_public_read on public.review_criteria_scores
  for select using (
    exists (
      select 1 from public.reviews r
       where r.id = review_criteria_scores.review_id
         and (r.is_published = true or r.author_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists review_criteria_scores_self_write on public.review_criteria_scores;
create policy review_criteria_scores_self_write on public.review_criteria_scores
  for all to authenticated
  using (
    exists (
      select 1 from public.reviews r
       where r.id = review_criteria_scores.review_id and r.author_id = auth.uid()
    ) or public.is_admin()
  )
  with check (
    exists (
      select 1 from public.reviews r
       where r.id = review_criteria_scores.review_id and r.author_id = auth.uid()
    ) or public.is_admin()
  );

drop policy if exists review_responses_public_read on public.review_responses;
create policy review_responses_public_read on public.review_responses
  for select using (true);

drop policy if exists review_responses_self_write on public.review_responses;
create policy review_responses_self_write on public.review_responses
  for all to authenticated
  using (responder_id = auth.uid() or public.is_admin())
  with check (responder_id = auth.uid() or public.is_admin());
