-- MovieBox Web: dedicated Supabase project only (NEVER run against MyKitchen).
-- Each signed-in user owns one cloud backup of their saved media state.
-- Database isolation is enforced by row-level security, not by frontend filters.
begin;

create table if not exists public.moviebox_user_backup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint moviebox_backup_object check (jsonb_typeof(snapshot) = 'object'),
  constraint moviebox_backup_size check (octet_length(snapshot::text) <= 524288),
  constraint moviebox_backup_revision check (revision between 1 and 2147483647)
);

alter table public.moviebox_user_backup enable row level security;

revoke all on public.moviebox_user_backup from public, anon;
grant select, insert, update, delete on public.moviebox_user_backup to authenticated;

drop policy if exists moviebox_select_own_backup on public.moviebox_user_backup;
create policy moviebox_select_own_backup on public.moviebox_user_backup
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists moviebox_insert_own_backup on public.moviebox_user_backup;
create policy moviebox_insert_own_backup on public.moviebox_user_backup
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists moviebox_update_own_backup on public.moviebox_user_backup;
create policy moviebox_update_own_backup on public.moviebox_user_backup
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists moviebox_delete_own_backup on public.moviebox_user_backup;
create policy moviebox_delete_own_backup on public.moviebox_user_backup
  for delete to authenticated using ((select auth.uid()) = user_id);

commit;
