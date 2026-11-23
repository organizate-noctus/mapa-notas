alter table public.notes add column if not exists nodes jsonb not null default '[]'::jsonb;

create table if not exists public.events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id uuid,
  title text not null default '',
  starts_at bigint not null,
  all_day boolean not null default false,
  remind_min integer not null default 0,
  state text not null default 'active',
  key text not null default '',
  updated_at bigint not null,
  deleted boolean not null default false
);

create index if not exists events_user_updated on public.events (user_id, updated_at);

alter table public.events enable row level security;

create policy "events_select_own" on public.events for select using (auth.uid() = user_id);
create policy "events_insert_own" on public.events for insert with check (auth.uid() = user_id);
create policy "events_update_own" on public.events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "events_delete_own" on public.events for delete using (auth.uid() = user_id);
