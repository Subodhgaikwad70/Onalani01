-- Store multiple photos for properties and listings.
alter table public.properties
add column if not exists photos_url text[] not null default '{}';

update public.properties
set photos_url = array[photo_url]
where photo_url is not null
  and photos_url = '{}';

alter table public.properties
drop column if exists photo_url;

alter table public.listings
add column if not exists photos_url text[] not null default '{}',
add column if not exists "roomPhotos_url" text[] not null default '{}';

update public.listings
set photos_url = array[photo_url]
where photo_url is not null
  and photos_url = '{}';

alter table public.listings
drop column if exists photo_url;

comment on column public.properties.photos_url is 'List of property photo URLs';
comment on column public.listings.photos_url is 'List of listing photo URLs';
comment on column public.listings."roomPhotos_url" is 'List of room photo URLs';
