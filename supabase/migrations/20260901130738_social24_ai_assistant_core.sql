-- Social24 AI Assistant core. This migration intentionally contains no model
-- provider transport: the provider-independent action and context boundary is
-- usable with the deterministic QA provider before SinoRouter is configured.

begin;

create table if not exists public.ai_assistant_threads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  scoped_conversation_id uuid references public.conversations(id) on delete cascade,
  title text not null default 'Social24 Assistant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_assistant_threads_title_check check (char_length(title) between 1 and 120)
);

create unique index if not exists ai_assistant_threads_owner_global_key
  on public.ai_assistant_threads(owner_user_id)
  where scoped_conversation_id is null;
create unique index if not exists ai_assistant_threads_owner_scope_key
  on public.ai_assistant_threads(owner_user_id, scoped_conversation_id)
  where scoped_conversation_id is not null;

create table if not exists public.ai_assistant_actions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid not null references public.ai_assistant_threads(id) on delete cascade,
  action_type text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  validated_arguments jsonb not null default '{}'::jsonb,
  confirmation_status text not null default 'pending',
  status text not null default 'proposed',
  idempotency_key uuid not null default gen_random_uuid(),
  result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  executed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ai_assistant_actions_type_check check (
    action_type in ('send_message_now', 'schedule_message', 'cancel_scheduled_message')
  ),
  constraint ai_assistant_actions_confirmation_check check (
    confirmation_status in ('pending', 'confirmed', 'cancelled')
  ),
  constraint ai_assistant_actions_status_check check (
    status in ('proposed', 'executing', 'completed', 'failed', 'cancelled')
  ),
  unique(owner_user_id, idempotency_key)
);

create index if not exists ai_assistant_actions_owner_status_idx
  on public.ai_assistant_actions(owner_user_id, status, created_at desc);
create index if not exists ai_assistant_actions_thread_idx
  on public.ai_assistant_actions(thread_id, created_at);

create table if not exists public.ai_assistant_entries (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_assistant_threads(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  role text not null,
  entry_type text not null default 'message',
  display_text text not null,
  action_id uuid references public.ai_assistant_actions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_assistant_entries_role_check check (role in ('user', 'assistant', 'system')),
  constraint ai_assistant_entries_type_check check (
    entry_type in ('message', 'answer', 'summary', 'action', 'status', 'clarification', 'error', 'schedule_list')
  ),
  constraint ai_assistant_entries_text_check check (char_length(display_text) between 1 and 6000)
);

create index if not exists ai_assistant_entries_thread_idx
  on public.ai_assistant_entries(thread_id, created_at, id);

create table if not exists public.conversation_ai_summaries (
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  summary text not null,
  last_summarized_message_id uuid references public.messages(id) on delete set null,
  summarized_message_count integer not null default 0,
  model_version text not null default 'fake-v1',
  summary_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(owner_user_id, conversation_id),
  constraint conversation_ai_summaries_text_check check (char_length(summary) between 1 and 6000),
  constraint conversation_ai_summaries_count_check check (summarized_message_count >= 0),
  constraint conversation_ai_summaries_version_check check (summary_version > 0)
);

alter table public.scheduled_chat_messages
  add column if not exists source text not null default 'user';
alter table public.scheduled_chat_messages
  add column if not exists assistant_action_id uuid references public.ai_assistant_actions(id) on delete set null;
alter table public.scheduled_chat_messages
  drop constraint if exists scheduled_chat_messages_source_check;
alter table public.scheduled_chat_messages
  add constraint scheduled_chat_messages_source_check check (source in ('user', 'ai_assistant'));
create index if not exists scheduled_chat_messages_assistant_action_idx
  on public.scheduled_chat_messages(assistant_action_id)
  where assistant_action_id is not null;

create index if not exists messages_ai_text_search_idx
  on public.messages using gin (to_tsvector('simple', coalesce(body, '')))
  where deleted_at is null and sender_id is not null and kind = 'text'::public.message_kind;

create or replace function private.is_authorized_personal_conversation(
  target_user uuid,
  target_conversation uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user is not null
    and target_conversation is not null
    and exists (
      select 1
      from public.conversations conversation
      join public.conversation_participants participant
        on participant.conversation_id = conversation.id
      where conversation.id = target_conversation
        and conversation.kind = 'personal'
        and participant.user_id = target_user
    );
$$;

-- RLS policies deliberately call a narrow public wrapper. Authenticated users
-- never receive USAGE or EXECUTE privileges on the private helper schema.
create or replace function public.ai_can_access_personal_conversation(
  target_conversation uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_authorized_personal_conversation(auth.uid(), target_conversation);
$$;

create or replace function private.is_personal_conversation_counterpart(
  target_user uuid,
  target_conversation uuid,
  target_counterpart uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_authorized_personal_conversation(target_user, target_conversation)
    and target_counterpart is not null
    and target_counterpart <> target_user
    and exists (
      select 1
      from public.conversation_participants participant
      where participant.conversation_id = target_conversation
        and participant.user_id = target_counterpart
    );
$$;

create or replace function private.chat_send_permitted(
  target_user uuid,
  target_conversation uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user is not null
    and exists (
      select 1
      from public.conversations conversation
      join public.conversation_participants participant
        on participant.conversation_id = conversation.id
      where conversation.id = target_conversation
        and participant.user_id = target_user
        and (
          conversation.kind <> 'personal'
          or not exists (
            select 1
            from public.conversation_participants counterpart
            join public.connection_requests request
              on (
                request.requester_id = target_user
                and request.recipient_id = counterpart.user_id
              ) or (
                request.recipient_id = target_user
                and request.requester_id = counterpart.user_id
              )
            where counterpart.conversation_id = target_conversation
              and counterpart.user_id <> target_user
              and request.status = 'blocked'
          )
        )
    );
$$;

create or replace function private.deliver_chat_text_message(
  target_sender uuid,
  target_conversation uuid,
  target_body text,
  target_payload jsonb,
  target_client_id uuid
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare inserted public.messages;
begin
  if not private.chat_send_permitted(target_sender, target_conversation) then
    raise exception 'Conversation delivery is no longer permitted.';
  end if;
  if char_length(btrim(coalesce(target_body, ''))) not between 1 and 2000 then
    raise exception 'Message cannot be empty or exceed 2000 characters.';
  end if;
  insert into public.messages(conversation_id, sender_id, kind, body, payload, client_id)
  values(
    target_conversation,
    target_sender,
    'text'::public.message_kind,
    btrim(target_body),
    coalesce(target_payload, '{}'::jsonb),
    coalesce(target_client_id, gen_random_uuid())
  )
  returning * into inserted;
  update public.conversations
  set updated_at = inserted.created_at
  where id = target_conversation;
  return inserted;
end;
$$;

alter table public.ai_assistant_threads enable row level security;
alter table public.ai_assistant_entries enable row level security;
alter table public.ai_assistant_actions enable row level security;
alter table public.conversation_ai_summaries enable row level security;

revoke all on table public.ai_assistant_threads from public, anon, authenticated;
revoke all on table public.ai_assistant_entries from public, anon, authenticated;
revoke all on table public.ai_assistant_actions from public, anon, authenticated;
revoke all on table public.conversation_ai_summaries from public, anon, authenticated;
grant select on table public.ai_assistant_threads to authenticated;
grant select on table public.ai_assistant_entries to authenticated;
grant select on table public.ai_assistant_actions to authenticated;
grant select on table public.conversation_ai_summaries to authenticated;

drop policy if exists ai_assistant_threads_owner_read on public.ai_assistant_threads;
create policy ai_assistant_threads_owner_read
on public.ai_assistant_threads for select to authenticated
using (
  owner_user_id = (select auth.uid())
  and (
    scoped_conversation_id is null
    or public.ai_can_access_personal_conversation(scoped_conversation_id)
  )
);

drop policy if exists ai_assistant_entries_owner_read on public.ai_assistant_entries;
create policy ai_assistant_entries_owner_read
on public.ai_assistant_entries for select to authenticated
using (
  owner_user_id = (select auth.uid())
  and (
    conversation_id is null
    or public.ai_can_access_personal_conversation(conversation_id)
  )
);

drop policy if exists ai_assistant_actions_owner_read on public.ai_assistant_actions;
create policy ai_assistant_actions_owner_read
on public.ai_assistant_actions for select to authenticated
using (
  owner_user_id = (select auth.uid())
  and (
    conversation_id is null
    or public.ai_can_access_personal_conversation(conversation_id)
  )
);

drop policy if exists conversation_ai_summaries_owner_read on public.conversation_ai_summaries;
create policy conversation_ai_summaries_owner_read
on public.conversation_ai_summaries for select to authenticated
using (
  owner_user_id = (select auth.uid())
  and public.ai_can_access_personal_conversation(conversation_id)
);

create or replace function public.ai_get_or_create_thread(target_conversation uuid default null)
returns public.ai_assistant_threads
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); result public.ai_assistant_threads;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  if target_conversation is not null
    and not private.is_authorized_personal_conversation(viewer, target_conversation) then
    raise exception 'Personal conversation access denied.';
  end if;
  select * into result
  from public.ai_assistant_threads thread
  where thread.owner_user_id = viewer
    and thread.scoped_conversation_id is not distinct from target_conversation
  limit 1;
  if result.id is null then
    begin
      insert into public.ai_assistant_threads(owner_user_id, scoped_conversation_id, title)
      values(
        viewer,
        target_conversation,
        case when target_conversation is null then 'Social24 Assistant' else 'Conversation Assistant' end
      )
      returning * into result;
    exception when unique_violation then
      select * into result
      from public.ai_assistant_threads thread
      where thread.owner_user_id = viewer
        and thread.scoped_conversation_id is not distinct from target_conversation
      limit 1;
    end;
  end if;
  return result;
end;
$$;

create or replace function public.ai_append_entry(
  target_thread uuid,
  target_role text,
  target_entry_type text,
  target_display_text text,
  target_conversation uuid default null,
  target_action uuid default null,
  target_metadata jsonb default '{}'::jsonb
)
returns public.ai_assistant_entries
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); thread public.ai_assistant_threads; result public.ai_assistant_entries;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  select * into thread from public.ai_assistant_threads
  where id = target_thread and owner_user_id = viewer;
  if thread.id is null then raise exception 'Assistant thread not found.'; end if;
  if thread.scoped_conversation_id is not null
    and target_conversation is distinct from thread.scoped_conversation_id then
    raise exception 'Entry conversation does not match the scoped Assistant thread.';
  end if;
  if target_conversation is not null
    and not private.is_authorized_personal_conversation(viewer, target_conversation) then
    raise exception 'Personal conversation access denied.';
  end if;
  if target_action is not null and not exists(
    select 1 from public.ai_assistant_actions action
    where action.id = target_action and action.owner_user_id = viewer and action.thread_id = target_thread
  ) then raise exception 'Assistant action not found.'; end if;
  insert into public.ai_assistant_entries(
    thread_id, owner_user_id, conversation_id, role, entry_type,
    display_text, action_id, metadata
  ) values (
    target_thread, viewer, target_conversation, target_role, target_entry_type,
    btrim(target_display_text), target_action, coalesce(target_metadata, '{}'::jsonb)
  ) returning * into result;
  update public.ai_assistant_threads set updated_at = now() where id = target_thread;
  return result;
end;
$$;

create or replace function public.ai_search_personal_contacts(
  target_query text,
  target_limit integer default 8
)
returns table(
  user_id uuid,
  conversation_id uuid,
  display_name text,
  username text
)
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); normalized text := lower(btrim(coalesce(target_query, '')));
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  return query
  select distinct
    profile.id,
    conversation.id,
    coalesce(nullif(btrim(profile.display_name), ''), profile.username, 'Social24 user'),
    coalesce(profile.username, profile.id::text)
  from public.conversations conversation
  join public.conversation_participants mine
    on mine.conversation_id = conversation.id and mine.user_id = viewer
  join public.conversation_participants other
    on other.conversation_id = conversation.id and other.user_id <> viewer
  join public.profiles profile on profile.id = other.user_id
  where conversation.kind = 'personal'
    and (
      normalized = ''
      or lower(coalesce(profile.display_name, '')) like '%' || normalized || '%'
      or lower(coalesce(profile.username, '')) like '%' || replace(normalized, '@', '') || '%'
    )
  order by 3, 4
  limit least(greatest(coalesce(target_limit, 8), 1), 20);
end;
$$;

create or replace function public.ai_get_recent_chat_context(
  target_conversation uuid,
  target_limit integer default 30,
  target_character_limit integer default 16000
)
returns table(
  message_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid();
begin
  if not private.is_authorized_personal_conversation(viewer, target_conversation) then
    raise exception 'Personal conversation access denied.';
  end if;
  return query
  with newest as (
    select
      message.id,
      message.sender_id,
      message.body,
      message.created_at,
      row_number() over(order by message.created_at desc, message.id desc) as message_rank,
      sum(char_length(coalesce(message.body, ''))) over(
        order by message.created_at desc, message.id desc
      ) as running_characters
    from public.messages message
    where message.conversation_id = target_conversation
      and message.sender_id is not null
      and message.kind = 'text'::public.message_kind
      and message.deleted_at is null
      and (message.expires_at is null or message.expires_at > now())
  )
  select newest.id, newest.sender_id, newest.body, newest.created_at
  from newest
  where newest.message_rank <= least(greatest(coalesce(target_limit, 30), 1), 40)
    and newest.running_characters <= least(greatest(coalesce(target_character_limit, 16000), 2000), 16000)
  order by newest.created_at, newest.id;
end;
$$;

create or replace function public.ai_search_older_chat_messages(
  target_conversation uuid,
  target_query text,
  target_limit integer default 8,
  target_character_limit integer default 4800
)
returns table(
  message_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); normalized text := btrim(coalesce(target_query, ''));
begin
  if not private.is_authorized_personal_conversation(viewer, target_conversation) then
    raise exception 'Personal conversation access denied.';
  end if;
  if char_length(normalized) < 2 then return; end if;
  return query
  with matches as (
    select
      message.id,
      message.sender_id,
      message.body,
      message.created_at,
      sum(char_length(coalesce(message.body, ''))) over(
        order by message.created_at desc, message.id desc
      ) as running_characters
    from public.messages message
    where message.conversation_id = target_conversation
      and message.sender_id is not null
      and message.kind = 'text'::public.message_kind
      and message.deleted_at is null
      and (message.expires_at is null or message.expires_at > now())
      and (
        to_tsvector('simple', coalesce(message.body, '')) @@ plainto_tsquery('simple', normalized)
        or message.body ilike '%' || replace(replace(normalized, '%', '\\%'), '_', '\\_') || '%' escape '\\'
      )
    order by message.created_at desc, message.id desc
    limit least(greatest(coalesce(target_limit, 8), 1), 8)
  )
  select matches.id, matches.sender_id, matches.body, matches.created_at
  from matches
  where matches.running_characters <= least(greatest(coalesce(target_character_limit, 4800), 800), 4800)
  order by matches.created_at, matches.id;
end;
$$;

create or replace function public.ai_get_conversation_summary(target_conversation uuid)
returns public.conversation_ai_summaries
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); result public.conversation_ai_summaries;
begin
  if not private.is_authorized_personal_conversation(viewer, target_conversation) then
    raise exception 'Personal conversation access denied.';
  end if;
  select * into result from public.conversation_ai_summaries
  where owner_user_id = viewer and conversation_id = target_conversation;
  return result;
end;
$$;

create or replace function public.ai_upsert_conversation_summary(
  target_conversation uuid,
  target_summary text,
  target_last_message uuid,
  target_message_count integer,
  target_model_version text,
  target_summary_version integer
)
returns public.conversation_ai_summaries
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); result public.conversation_ai_summaries;
begin
  if not private.is_authorized_personal_conversation(viewer, target_conversation) then
    raise exception 'Personal conversation access denied.';
  end if;
  if target_last_message is not null and not exists(
    select 1 from public.messages message
    where message.id = target_last_message and message.conversation_id = target_conversation
  ) then raise exception 'Summary cursor does not belong to this conversation.'; end if;
  insert into public.conversation_ai_summaries(
    owner_user_id, conversation_id, summary, last_summarized_message_id,
    summarized_message_count, model_version, summary_version
  ) values (
    viewer, target_conversation, btrim(target_summary), target_last_message,
    greatest(coalesce(target_message_count, 0), 0), left(coalesce(nullif(target_model_version, ''), 'fake-v1'), 120),
    greatest(coalesce(target_summary_version, 1), 1)
  )
  on conflict(owner_user_id, conversation_id) do update set
    summary = excluded.summary,
    last_summarized_message_id = excluded.last_summarized_message_id,
    summarized_message_count = excluded.summarized_message_count,
    model_version = excluded.model_version,
    summary_version = excluded.summary_version,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.ai_list_scheduled_messages(
  target_status text default null,
  target_from timestamptz default null,
  target_to timestamptz default null,
  target_limit integer default 30
)
returns table(
  schedule_id uuid,
  conversation_id uuid,
  target_user_id uuid,
  target_display_name text,
  target_username text,
  body text,
  send_at timestamptz,
  timezone text,
  status text,
  source text,
  assistant_action_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid();
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  return query
  select
    schedule.id,
    schedule.conversation_id,
    profile.id,
    coalesce(nullif(btrim(profile.display_name), ''), profile.username, 'Social24 user'),
    coalesce(profile.username, profile.id::text),
    schedule.body,
    schedule.send_at,
    schedule.timezone,
    schedule.status,
    schedule.source,
    schedule.assistant_action_id
  from public.scheduled_chat_messages schedule
  join public.conversations conversation on conversation.id = schedule.conversation_id
  join public.conversation_participants counterpart
    on counterpart.conversation_id = schedule.conversation_id
    and counterpart.user_id <> viewer
  join public.profiles profile on profile.id = counterpart.user_id
  where schedule.created_by = viewer
    and conversation.kind = 'personal'
    and (target_status is null or schedule.status = target_status)
    and (target_from is null or schedule.send_at >= target_from)
    and (target_to is null or schedule.send_at < target_to)
  order by schedule.send_at, schedule.id
  limit least(greatest(coalesce(target_limit, 30), 1), 100);
end;
$$;

create or replace function public.ai_create_action(
  target_thread uuid,
  target_action_type text,
  target_user uuid,
  target_conversation uuid,
  target_arguments jsonb,
  target_idempotency_key uuid
)
returns public.ai_assistant_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  thread public.ai_assistant_threads;
  result public.ai_assistant_actions;
  schedule public.scheduled_chat_messages;
  schedule_id uuid;
  body text := btrim(coalesce(target_arguments->>'body', ''));
  send_at timestamptz;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  select * into thread from public.ai_assistant_threads
  where id = target_thread and owner_user_id = viewer;
  if thread.id is null then raise exception 'Assistant thread not found.'; end if;
  if target_action_type not in ('send_message_now', 'schedule_message', 'cancel_scheduled_message') then
    raise exception 'Unsupported Assistant action.';
  end if;
  if target_action_type in ('send_message_now', 'schedule_message') then
    if not private.is_personal_conversation_counterpart(viewer, target_conversation, target_user) then
      raise exception 'Personal Chat recipient resolution failed.';
    end if;
    if char_length(body) not between 1 and 2000 then raise exception 'Message cannot be empty.'; end if;
  end if;
  if target_action_type = 'schedule_message' then
    begin send_at := (target_arguments->>'send_at')::timestamptz;
    exception when others then raise exception 'Scheduled time is invalid.'; end;
    if send_at <= now() + interval '1 minute' or send_at > now() + interval '30 days' then
      raise exception 'Schedule between 1 minute and 30 days from now.';
    end if;
  end if;
  if target_action_type = 'cancel_scheduled_message' then
    begin schedule_id := (target_arguments->>'schedule_id')::uuid;
    exception when others then raise exception 'Scheduled message identifier is invalid.'; end;
    select * into schedule from public.scheduled_chat_messages
    where id = schedule_id and created_by = viewer and status = 'pending';
    if schedule.id is null then raise exception 'Pending scheduled message was not found.'; end if;
    target_conversation := schedule.conversation_id;
    if not private.is_authorized_personal_conversation(viewer, target_conversation) then
      raise exception 'Personal conversation access denied.';
    end if;
  end if;
  insert into public.ai_assistant_actions(
    owner_user_id, thread_id, action_type, target_user_id, conversation_id,
    validated_arguments, idempotency_key
  ) values (
    viewer, target_thread, target_action_type, target_user, target_conversation,
    coalesce(target_arguments, '{}'::jsonb), coalesce(target_idempotency_key, gen_random_uuid())
  )
  on conflict(owner_user_id, idempotency_key) do update
    set updated_at = public.ai_assistant_actions.updated_at
  returning * into result;
  return result;
end;
$$;

create or replace function public.ai_edit_action(
  target_action uuid,
  target_body text default null,
  target_send_at timestamptz default null,
  target_timezone text default null
)
returns public.ai_assistant_actions
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); action public.ai_assistant_actions;
begin
  select * into action from public.ai_assistant_actions
  where id = target_action and owner_user_id = viewer
    and status = 'proposed' and confirmation_status = 'pending'
  for update;
  if action.id is null then raise exception 'Pending Assistant action was not found.'; end if;
  if target_body is not null then
    if char_length(btrim(target_body)) not between 1 and 2000 then raise exception 'Message cannot be empty.'; end if;
    action.validated_arguments := jsonb_set(action.validated_arguments, '{body}', to_jsonb(btrim(target_body)), true);
  end if;
  if target_send_at is not null then
    if action.action_type <> 'schedule_message' then raise exception 'Only scheduled actions accept a send time.'; end if;
    if target_send_at <= now() + interval '1 minute' or target_send_at > now() + interval '30 days' then
      raise exception 'Schedule between 1 minute and 30 days from now.';
    end if;
    action.validated_arguments := jsonb_set(action.validated_arguments, '{send_at}', to_jsonb(target_send_at), true);
  end if;
  if target_timezone is not null then
    action.validated_arguments := jsonb_set(action.validated_arguments, '{timezone}', to_jsonb(left(btrim(target_timezone), 80)), true);
  end if;
  update public.ai_assistant_actions
  set validated_arguments = action.validated_arguments, updated_at = now()
  where id = action.id
  returning * into action;
  return action;
end;
$$;

create or replace function public.ai_cancel_action(target_action uuid)
returns public.ai_assistant_actions
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); result public.ai_assistant_actions;
begin
  update public.ai_assistant_actions
  set confirmation_status = 'cancelled', status = 'cancelled', updated_at = now()
  where id = target_action and owner_user_id = viewer
    and status = 'proposed' and confirmation_status = 'pending'
  returning * into result;
  if result.id is null then raise exception 'Pending Assistant action was not found.'; end if;
  return result;
end;
$$;

create or replace function public.ai_execute_action(target_action uuid)
returns public.ai_assistant_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  action public.ai_assistant_actions;
  sent_message public.messages;
  scheduled_message public.scheduled_chat_messages;
  schedule_id uuid;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  select * into action from public.ai_assistant_actions
  where id = target_action and owner_user_id = viewer
  for update;
  if action.id is null then raise exception 'Assistant action not found.'; end if;
  if action.status = 'completed' then return action; end if;
  if action.status <> 'proposed' or action.confirmation_status <> 'pending' then
    raise exception 'Assistant action is not awaiting confirmation.';
  end if;
  update public.ai_assistant_actions
  set confirmation_status = 'confirmed', status = 'executing', confirmed_at = now(), updated_at = now()
  where id = action.id;
  begin
    if action.action_type = 'send_message_now' then
      if not private.is_personal_conversation_counterpart(viewer, action.conversation_id, action.target_user_id) then
        raise exception 'Personal Chat authorization changed before send.';
      end if;
      sent_message := public.send_personal_message(
        action.conversation_id,
        action.validated_arguments->>'body',
        'text',
        jsonb_build_object('source', 'ai_assistant', 'assistant_action_id', action.id),
        action.id
      );
      update public.ai_assistant_actions
      set status = 'completed', result = jsonb_build_object('message_id', sent_message.id, 'status', 'sent'),
        error = null, executed_at = now(), updated_at = now()
      where id = action.id returning * into action;
    elsif action.action_type = 'schedule_message' then
      if not private.is_personal_conversation_counterpart(viewer, action.conversation_id, action.target_user_id) then
        raise exception 'Personal Chat authorization changed before scheduling.';
      end if;
      scheduled_message := public.schedule_chat_message(
        action.conversation_id,
        action.validated_arguments->>'body',
        (action.validated_arguments->>'send_at')::timestamptz,
        coalesce(action.validated_arguments->>'timezone', 'UTC'),
        action.id
      );
      update public.scheduled_chat_messages
      set source = 'ai_assistant', assistant_action_id = action.id,
        payload = payload || jsonb_build_object('source', 'ai_assistant', 'assistant_action_id', action.id),
        updated_at = now()
      where id = scheduled_message.id;
      update public.ai_assistant_actions
      set status = 'completed', result = jsonb_build_object('schedule_id', scheduled_message.id, 'status', 'scheduled'),
        error = null, executed_at = now(), updated_at = now()
      where id = action.id returning * into action;
    else
      schedule_id := (action.validated_arguments->>'schedule_id')::uuid;
      perform public.cancel_scheduled_chat_message(schedule_id);
      update public.ai_assistant_actions
      set status = 'completed', result = jsonb_build_object('schedule_id', schedule_id, 'status', 'cancelled'),
        error = null, executed_at = now(), updated_at = now()
      where id = action.id returning * into action;
    end if;
  exception when others then
    update public.ai_assistant_actions
    set status = 'failed', error = left(sqlerrm, 500), executed_at = now(), updated_at = now()
    where id = action.id returning * into action;
  end;
  return action;
end;
$$;

-- Ordinary text sends and scheduled text sends converge on one validated
-- delivery primitive. Non-text message kinds retain their existing path.
create or replace function public.send_personal_message(
  target_conversation uuid,
  message_body text,
  message_kind text default 'text',
  message_payload jsonb default '{}'::jsonb,
  message_client_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); inserted public.messages; safe_kind public.message_kind;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  if not private.chat_send_permitted(viewer, target_conversation) then
    raise exception 'You are not permitted to send to this conversation.';
  end if;
  if nullif(btrim(coalesce(message_body, '')), '') is null then raise exception 'Message cannot be empty.'; end if;
  safe_kind := case
    when message_kind in ('text', 'image', 'file', 'voice', 'product', 'cart')
      then message_kind::public.message_kind
    else 'text'::public.message_kind
  end;
  if safe_kind = 'text'::public.message_kind then
    return private.deliver_chat_text_message(
      viewer, target_conversation, message_body, message_payload,
      coalesce(message_client_id, gen_random_uuid())
    );
  end if;
  insert into public.messages(conversation_id, sender_id, kind, body, payload, client_id)
  values(
    target_conversation, viewer, safe_kind, btrim(message_body),
    coalesce(message_payload, '{}'::jsonb), coalesce(message_client_id, gen_random_uuid())
  ) returning * into inserted;
  update public.conversations set updated_at = inserted.created_at where id = target_conversation;
  return inserted;
end;
$$;

create or replace function public.process_scheduled_chat_messages(target_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare schedule_row public.scheduled_chat_messages%rowtype; inserted_message public.messages; sent_count integer := 0;
begin
  for schedule_row in
    select * from public.scheduled_chat_messages
    where status = 'pending' and send_at <= now()
    order by send_at, id
    for update skip locked
    limit least(greatest(coalesce(target_limit, 50), 1), 100)
  loop
    if not private.chat_send_permitted(schedule_row.created_by, schedule_row.conversation_id) then
      update public.scheduled_chat_messages
      set status = 'cancelled', last_error = 'Conversation delivery permission was revoked before send.', updated_at = now()
      where id = schedule_row.id;
      continue;
    end if;
    begin
      update public.scheduled_chat_messages
      set status = 'sending', attempts = attempts + 1, updated_at = now()
      where id = schedule_row.id;
      inserted_message := private.deliver_chat_text_message(
        schedule_row.created_by,
        schedule_row.conversation_id,
        schedule_row.body,
        schedule_row.payload,
        schedule_row.idempotency_key
      );
      update public.scheduled_chat_messages
      set status = 'sent', message_id = inserted_message.id, last_error = null, updated_at = now()
      where id = schedule_row.id;
      if schedule_row.assistant_action_id is not null then
        update public.ai_assistant_actions
        set result = result || jsonb_build_object('message_id', inserted_message.id, 'schedule_status', 'sent'),
          updated_at = now()
        where id = schedule_row.assistant_action_id and owner_user_id = schedule_row.created_by;
      end if;
      sent_count := sent_count + 1;
    exception when others then
      update public.scheduled_chat_messages
      set status = case when attempts >= 5 then 'failed' else 'pending' end,
        last_error = left(sqlerrm, 500), updated_at = now()
      where id = schedule_row.id;
    end;
  end loop;
  return sent_count;
end;
$$;

revoke all on function private.is_authorized_personal_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_personal_conversation_counterpart(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.chat_send_permitted(uuid, uuid) from public, anon, authenticated;
revoke all on function private.deliver_chat_text_message(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ai_can_access_personal_conversation(uuid) from public, anon;
grant execute on function public.ai_can_access_personal_conversation(uuid) to authenticated;

revoke all on function public.send_personal_message(uuid, text, text, jsonb, uuid) from public, anon;
revoke all on function public.schedule_chat_message(uuid, text, timestamptz, text, uuid) from public, anon;
revoke all on function public.cancel_scheduled_chat_message(uuid) from public, anon;
revoke all on function public.process_scheduled_chat_messages(integer) from public, anon, authenticated;
grant execute on function public.send_personal_message(uuid, text, text, jsonb, uuid) to authenticated;
grant execute on function public.schedule_chat_message(uuid, text, timestamptz, text, uuid) to authenticated;
grant execute on function public.cancel_scheduled_chat_message(uuid) to authenticated;

revoke all on function public.ai_get_or_create_thread(uuid) from public, anon;
revoke all on function public.ai_append_entry(uuid, text, text, text, uuid, uuid, jsonb) from public, anon;
revoke all on function public.ai_search_personal_contacts(text, integer) from public, anon;
revoke all on function public.ai_get_recent_chat_context(uuid, integer, integer) from public, anon;
revoke all on function public.ai_search_older_chat_messages(uuid, text, integer, integer) from public, anon;
revoke all on function public.ai_get_conversation_summary(uuid) from public, anon;
revoke all on function public.ai_upsert_conversation_summary(uuid, text, uuid, integer, text, integer) from public, anon;
revoke all on function public.ai_list_scheduled_messages(text, timestamptz, timestamptz, integer) from public, anon;
revoke all on function public.ai_create_action(uuid, text, uuid, uuid, jsonb, uuid) from public, anon;
revoke all on function public.ai_edit_action(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.ai_cancel_action(uuid) from public, anon;
revoke all on function public.ai_execute_action(uuid) from public, anon;

grant execute on function public.ai_get_or_create_thread(uuid) to authenticated;
grant execute on function public.ai_append_entry(uuid, text, text, text, uuid, uuid, jsonb) to authenticated;
grant execute on function public.ai_search_personal_contacts(text, integer) to authenticated;
grant execute on function public.ai_get_recent_chat_context(uuid, integer, integer) to authenticated;
grant execute on function public.ai_search_older_chat_messages(uuid, text, integer, integer) to authenticated;
grant execute on function public.ai_get_conversation_summary(uuid) to authenticated;
grant execute on function public.ai_upsert_conversation_summary(uuid, text, uuid, integer, text, integer) to authenticated;
grant execute on function public.ai_list_scheduled_messages(text, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.ai_create_action(uuid, text, uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.ai_edit_action(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.ai_cancel_action(uuid) to authenticated;
grant execute on function public.ai_execute_action(uuid) to authenticated;

comment on table public.ai_assistant_threads is 'User-owned Social24 Assistant workspaces; optional scope is Personal Chat only.';
comment on table public.ai_assistant_entries is 'Assistant-visible commands/results only; source chat history is never duplicated here.';
comment on table public.ai_assistant_actions is 'Validated, confirmation-gated Assistant side effects with idempotent execution.';
comment on table public.conversation_ai_summaries is 'Bounded rolling summaries owned separately by each Personal Chat participant.';

commit;
