-- Batch E: participant-scoped polls/events and private Keep Memo integration
-- with the existing Notes & Tasks table.

create table if not exists public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid unique references public.messages(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  closes_at timestamptz,
  constraint chat_polls_question_check check (char_length(question) between 1 and 240),
  constraint chat_polls_status_check check (status in ('open','closed'))
);

create table if not exists public.chat_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  position integer not null,
  label text not null,
  constraint chat_poll_options_position_check check (position between 0 and 9),
  constraint chat_poll_options_label_check check (char_length(label) between 1 and 120),
  unique (poll_id, position),
  unique (poll_id, label)
);

create table if not exists public.chat_poll_votes (
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  option_id uuid not null references public.chat_poll_options(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, voter_id)
);

create table if not exists public.chat_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid unique references public.messages(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  location text,
  description text,
  created_at timestamptz not null default now(),
  constraint chat_events_title_check check (char_length(title) between 1 and 160),
  constraint chat_events_location_check check (location is null or char_length(location) <= 240),
  constraint chat_events_description_check check (description is null or char_length(description) <= 1000)
);

create table if not exists public.chat_event_rsvps (
  event_id uuid not null references public.chat_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_event_rsvps_response_check check (response in ('going','maybe','declined')),
  primary key (event_id, user_id)
);

alter table public.chat_polls enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;
alter table public.chat_events enable row level security;
alter table public.chat_event_rsvps enable row level security;

revoke all on table public.chat_polls, public.chat_poll_options, public.chat_poll_votes, public.chat_events, public.chat_event_rsvps from public, anon, authenticated;
grant select on table public.chat_polls, public.chat_poll_options, public.chat_poll_votes, public.chat_events, public.chat_event_rsvps to authenticated;

drop policy if exists chat_polls_member_read on public.chat_polls;
create policy chat_polls_member_read on public.chat_polls for select to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists chat_poll_options_member_read on public.chat_poll_options;
create policy chat_poll_options_member_read on public.chat_poll_options for select to authenticated
using (exists(select 1 from public.chat_polls poll where poll.id=chat_poll_options.poll_id and public.is_conversation_member(poll.conversation_id)));

drop policy if exists chat_poll_votes_member_read on public.chat_poll_votes;
create policy chat_poll_votes_member_read on public.chat_poll_votes for select to authenticated
using (exists(select 1 from public.chat_polls poll where poll.id=chat_poll_votes.poll_id and public.is_conversation_member(poll.conversation_id)));

drop policy if exists chat_events_member_read on public.chat_events;
create policy chat_events_member_read on public.chat_events for select to authenticated
using (public.is_conversation_member(conversation_id));

drop policy if exists chat_event_rsvps_member_read on public.chat_event_rsvps;
create policy chat_event_rsvps_member_read on public.chat_event_rsvps for select to authenticated
using (exists(select 1 from public.chat_events event where event.id=chat_event_rsvps.event_id and public.is_conversation_member(event.conversation_id)));

create or replace function public.create_chat_poll(
  target_conversation uuid,
  target_question text,
  target_options jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  poll_id uuid;
  inserted_message public.messages;
  option_count integer;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then raise exception 'Conversation access denied.'; end if;
  if char_length(btrim(coalesce(target_question,''))) not between 1 and 240 then raise exception 'Poll question is required.'; end if;
  if jsonb_typeof(target_options) <> 'array' then raise exception 'Poll options must be an array.'; end if;
  option_count := jsonb_array_length(target_options);
  if option_count not between 2 and 10 then raise exception 'Polls require 2 to 10 options.'; end if;
  if exists(select 1 from jsonb_array_elements_text(target_options) option where char_length(btrim(option)) not between 1 and 120) then raise exception 'Poll option is invalid.'; end if;
  if (select count(distinct lower(btrim(option))) from jsonb_array_elements_text(target_options) option) <> option_count then raise exception 'Poll options must be unique.'; end if;

  insert into public.chat_polls(conversation_id,created_by,question)
  values(target_conversation,viewer,btrim(target_question)) returning id into poll_id;

  insert into public.chat_poll_options(poll_id,position,label)
  select poll_id, ordinality::integer - 1, btrim(option)
  from jsonb_array_elements_text(target_options) with ordinality as entry(option,ordinality);

  insert into public.messages(conversation_id,sender_id,kind,body,payload,client_id)
  values(target_conversation,viewer,'poll'::public.message_kind,btrim(target_question),jsonb_build_object('version',1,'poll_id',poll_id),gen_random_uuid())
  returning * into inserted_message;
  update public.chat_polls set message_id=inserted_message.id where id=poll_id;
  update public.conversations set updated_at=inserted_message.created_at where id=target_conversation;
  return inserted_message;
end;
$$;

create or replace function public.vote_chat_poll(target_poll uuid, target_option uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid:=auth.uid(); poll_row public.chat_polls%rowtype;
begin
  select * into poll_row from public.chat_polls where id=target_poll;
  if viewer is null or not found or not public.is_conversation_member(poll_row.conversation_id) then raise exception 'Poll access denied.'; end if;
  if poll_row.status <> 'open' or (poll_row.closes_at is not null and poll_row.closes_at <= now()) then raise exception 'Poll is closed.'; end if;
  if not exists(select 1 from public.chat_poll_options where id=target_option and poll_id=target_poll) then raise exception 'Poll option is invalid.'; end if;
  insert into public.chat_poll_votes(poll_id,option_id,voter_id)
  values(target_poll,target_option,viewer)
  on conflict(poll_id,voter_id) do update set option_id=excluded.option_id,updated_at=now();
end;
$$;

create or replace function public.create_chat_event(
  target_conversation uuid,
  target_title text,
  target_starts_at timestamptz,
  target_location text default null,
  target_description text default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid:=auth.uid(); event_id uuid; inserted_message public.messages;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then raise exception 'Conversation access denied.'; end if;
  if char_length(btrim(coalesce(target_title,''))) not between 1 and 160 then raise exception 'Event title is required.'; end if;
  if target_starts_at is null then raise exception 'Event date and time are required.'; end if;
  insert into public.chat_events(conversation_id,created_by,title,starts_at,location,description)
  values(target_conversation,viewer,btrim(target_title),target_starts_at,left(nullif(btrim(target_location),''),240),left(nullif(btrim(target_description),''),1000))
  returning id into event_id;
  insert into public.messages(conversation_id,sender_id,kind,body,payload,client_id)
  values(target_conversation,viewer,'event'::public.message_kind,btrim(target_title),jsonb_build_object('version',1,'event_id',event_id),gen_random_uuid())
  returning * into inserted_message;
  update public.chat_events set message_id=inserted_message.id where id=event_id;
  update public.conversations set updated_at=inserted_message.created_at where id=target_conversation;
  return inserted_message;
end;
$$;

create or replace function public.rsvp_chat_event(target_event uuid,target_response text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid:=auth.uid(); event_conversation uuid;
begin
  select conversation_id into event_conversation from public.chat_events where id=target_event;
  if viewer is null or event_conversation is null or not public.is_conversation_member(event_conversation) then raise exception 'Event access denied.'; end if;
  if target_response not in ('going','maybe','declined') then raise exception 'RSVP response is invalid.'; end if;
  insert into public.chat_event_rsvps(event_id,user_id,response)
  values(target_event,viewer,target_response)
  on conflict(event_id,user_id) do update set response=excluded.response,updated_at=now();
end;
$$;

create or replace function public.keep_chat_message_memo(target_message uuid)
returns public.notes_tasks_entries
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid:=auth.uid(); message_row public.messages%rowtype; inserted public.notes_tasks_entries;
begin
  select * into message_row from public.messages where id=target_message;
  if viewer is null or not found or not public.is_conversation_member(message_row.conversation_id) then raise exception 'Message access denied.'; end if;
  insert into public.notes_tasks_entries(user_id,entry_type,title,body,category,tags,color_key,is_starred)
  values(
    viewer,
    'note',
    left('Chat memo · ' || coalesce(nullif(btrim(message_row.body),''),'Saved message'),160),
    left('Conversation: ' || message_row.conversation_id::text || E'\nMessage: ' || coalesce(message_row.body,'') || E'\nSaved: ' || now()::text,4000),
    'Chat',
    array['chat-memo'],
    'mint',
    false
  ) returning * into inserted;
  return inserted;
end;
$$;

revoke all on function public.create_chat_poll(uuid,text,jsonb) from public;
revoke all on function public.vote_chat_poll(uuid,uuid) from public;
revoke all on function public.create_chat_event(uuid,text,timestamptz,text,text) from public;
revoke all on function public.rsvp_chat_event(uuid,text) from public;
revoke all on function public.keep_chat_message_memo(uuid) from public;
grant execute on function public.create_chat_poll(uuid,text,jsonb) to authenticated;
grant execute on function public.vote_chat_poll(uuid,uuid) to authenticated;
grant execute on function public.create_chat_event(uuid,text,timestamptz,text,text) to authenticated;
grant execute on function public.rsvp_chat_event(uuid,text) to authenticated;
grant execute on function public.keep_chat_message_memo(uuid) to authenticated;
