alter table public.conversation_participants
  add column if not exists pinned_at timestamptz,
  add column if not exists cleared_at timestamptz;

create index if not exists conversation_participants_user_pinned_idx
  on public.conversation_participants (user_id, pinned_at desc nulls last);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('❤️', '😂', '😮', '😢', '😡', '👍')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id, reaction);

create index if not exists message_reactions_user_idx
  on public.message_reactions (user_id, updated_at desc);

alter table public.message_reactions enable row level security;

drop policy if exists "message reactions participant read" on public.message_reactions;
create policy "message reactions participant read"
  on public.message_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "message reactions participant insert own" on public.message_reactions;
create policy "message reactions participant insert own"
  on public.message_reactions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "message reactions update own" on public.message_reactions;
create policy "message reactions update own"
  on public.message_reactions
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "message reactions delete own" on public.message_reactions;
create policy "message reactions delete own"
  on public.message_reactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  kind text not null check (kind in ('message_reaction')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, actor_id, message_id, kind)
);

create index if not exists chat_notifications_recipient_idx
  on public.chat_notifications (recipient_id, read_at, created_at desc);

alter table public.chat_notifications enable row level security;

drop policy if exists "chat notifications recipient read" on public.chat_notifications;
create policy "chat notifications recipient read"
  on public.chat_notifications
  for select
  to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists "chat notifications recipient update" on public.chat_notifications;
create policy "chat notifications recipient update"
  on public.chat_notifications
  for update
  to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default 'conversation',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists chat_reports_reporter_idx
  on public.chat_reports (reporter_id, created_at desc);

alter table public.chat_reports enable row level security;

drop policy if exists "chat reports reporter read own" on public.chat_reports;
create policy "chat reports reporter read own"
  on public.chat_reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

drop policy if exists "chat reports participant insert own" on public.chat_reports;
create policy "chat reports participant insert own"
  on public.chat_reports
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
    and (
      message_id is null
      or exists (
        select 1
        from public.messages m
        where m.id = chat_reports.message_id
          and m.conversation_id = chat_reports.conversation_id
      )
    )
  );

create or replace function public.notify_chat_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  message_record record;
  actor_name text;
begin
  select id, conversation_id, sender_id
    into message_record
  from public.messages
  where id = new.message_id;

  if message_record.id is null
     or message_record.sender_id is null
     or message_record.sender_id = new.user_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = message_record.conversation_id
      and cp.user_id = new.user_id
  ) then
    return new;
  end if;

  select coalesce(nullif(display_name, ''), username, 'Someone')
    into actor_name
  from public.profiles
  where id = new.user_id;

  insert into public.chat_notifications (
    recipient_id,
    actor_id,
    conversation_id,
    message_id,
    kind,
    title,
    body
  )
  values (
    message_record.sender_id,
    new.user_id,
    message_record.conversation_id,
    new.message_id,
    'message_reaction',
    'New reaction',
    coalesce(actor_name, 'Someone') || ' reacted ' || new.reaction || ' to your message.'
  )
  on conflict (recipient_id, actor_id, message_id, kind)
  do update set
    body = excluded.body,
    read_at = null,
    created_at = now();

  return new;
end;
$$;

drop trigger if exists message_reactions_notify_sender on public.message_reactions;
create trigger message_reactions_notify_sender
  after insert or update of reaction on public.message_reactions
  for each row
  execute function public.notify_chat_message_reaction();

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_notifications;
exception
  when duplicate_object then null;
end $$;
