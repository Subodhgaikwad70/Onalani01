-- Repair migration: some environments had a pre-existing `public.properties`
-- table, so the original `create table if not exists` migration did not add
-- all expected columns (notably `photo_url`).
--
-- Keep this idempotent so it is safe across fresh and existing databases.

alter table public.properties
  add column if not exists photo_url text;
