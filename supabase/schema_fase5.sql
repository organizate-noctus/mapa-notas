alter table public.events add column if not exists repeat text not null default 'none';
alter table public.events add column if not exists snooze_until bigint not null default 0;

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  digest_enabled boolean not null default true,
  digest_hour int not null default 8,
  digest_last text not null default ''
);

alter table public.user_settings enable row level security;

drop policy if exists "settings_select_own" on public.user_settings;
drop policy if exists "settings_insert_own" on public.user_settings;
drop policy if exists "settings_update_own" on public.user_settings;

create policy "settings_select_own" on public.user_settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
