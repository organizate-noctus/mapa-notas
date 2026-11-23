alter table public.events add column if not exists notified_at bigint not null default 0;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_select_own" on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push_insert_own" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push_update_own" on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "push_delete_own" on public.push_subscriptions for delete using (auth.uid() = user_id);

create extension if not exists pg_cron;
create extension if not exists pg_net;
