create table if not exists public.notes_tasks_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_type text not null check (entry_type in ('note', 'task')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 4000),
  category text not null default 'Personal' check (char_length(category) between 1 and 60),
  tags text[] not null default '{}',
  color_key text not null default 'mint' check (color_key in ('mint', 'yellow', 'blue', 'lavender', 'peach')),
  priority text check (priority in ('low', 'medium', 'high')),
  due_date date,
  is_starred boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_tasks_entries_user_idx
  on public.notes_tasks_entries(user_id, entry_type, created_at desc);

create index if not exists notes_tasks_entries_user_category_idx
  on public.notes_tasks_entries(user_id, category);

create index if not exists notes_tasks_entries_user_completed_idx
  on public.notes_tasks_entries(user_id, completed_at);

alter table public.notes_tasks_entries enable row level security;

drop policy if exists "notes tasks self read" on public.notes_tasks_entries;
create policy "notes tasks self read" on public.notes_tasks_entries
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "notes tasks self insert" on public.notes_tasks_entries;
create policy "notes tasks self insert" on public.notes_tasks_entries
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "notes tasks self update" on public.notes_tasks_entries;
create policy "notes tasks self update" on public.notes_tasks_entries
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "notes tasks self delete" on public.notes_tasks_entries;
create policy "notes tasks self delete" on public.notes_tasks_entries
for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.notes_tasks_entries to authenticated;

create or replace function public.notes_tasks_entries_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_tasks_entries_touch_updated_at on public.notes_tasks_entries;
create trigger notes_tasks_entries_touch_updated_at
before update on public.notes_tasks_entries
for each row execute function public.notes_tasks_entries_set_updated_at();
