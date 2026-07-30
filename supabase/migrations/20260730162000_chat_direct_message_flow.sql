-- Stabilize personal chat request acceptance and direct messaging.
-- The original membership helper was evaluated through conversation_participants
-- RLS, which can recursively block conversation/message reads for real users.

create or replace function public.is_conversation_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = target
      and user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_conversation_member(uuid) to authenticated;

create table if not exists public.direct_conversation_pairs (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  unique (conversation_id),
  check (user_low < user_high)
);

alter table public.direct_conversation_pairs enable row level security;

drop policy if exists "direct pairs member select" on public.direct_conversation_pairs;
create policy "direct pairs member select"
on public.direct_conversation_pairs
for select
to authenticated
using ((select auth.uid()) in (user_low, user_high));

create unique index if not exists connection_requests_active_pair_idx
on public.connection_requests (
  least(requester_id, recipient_id),
  greatest(requester_id, recipient_id)
)
where status in ('pending', 'accepted');

insert into public.direct_conversation_pairs (user_low, user_high, conversation_id)
select
  min(cp.user_id::text)::uuid as user_low,
  max(cp.user_id::text)::uuid as user_high,
  cp.conversation_id
from public.conversation_participants cp
join public.conversations c on c.id = cp.conversation_id
where c.kind = 'personal'
group by cp.conversation_id
having count(*) = 2
on conflict (user_low, user_high) do nothing;

create or replace function public.open_personal_conversation(participant uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  low_user uuid;
  high_user uuid;
  existing_conversation uuid;
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  if participant is null or participant = viewer then
    raise exception 'Invalid participant.';
  end if;

  if not exists (
    select 1
    from public.connection_requests cr
    where cr.status = 'accepted'
      and (
        (cr.requester_id = viewer and cr.recipient_id = participant)
        or (cr.requester_id = participant and cr.recipient_id = viewer)
      )
  ) then
    raise exception 'Message request has not been accepted.';
  end if;

  low_user := least(viewer, participant);
  high_user := greatest(viewer, participant);

  perform pg_advisory_xact_lock(hashtextextended(low_user::text || ':' || high_user::text, 0));

  select dcp.conversation_id
  into existing_conversation
  from public.direct_conversation_pairs dcp
  where dcp.user_low = low_user
    and dcp.user_high = high_user;

  if existing_conversation is not null then
    return existing_conversation;
  end if;

  select c.id
  into existing_conversation
  from public.conversations c
  join public.conversation_participants cp_viewer
    on cp_viewer.conversation_id = c.id
   and cp_viewer.user_id = viewer
  join public.conversation_participants cp_participant
    on cp_participant.conversation_id = c.id
   and cp_participant.user_id = participant
  where c.kind = 'personal'
  order by c.updated_at desc
  limit 1;

  if existing_conversation is null then
    insert into public.conversations (kind, created_by)
    values ('personal', viewer)
    returning id into existing_conversation;

    insert into public.conversation_participants (conversation_id, user_id)
    values
      (existing_conversation, viewer),
      (existing_conversation, participant)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  insert into public.direct_conversation_pairs (user_low, user_high, conversation_id)
  values (low_user, high_user, existing_conversation)
  on conflict (user_low, user_high) do update
    set conversation_id = excluded.conversation_id;

  return existing_conversation;
end;
$$;

grant execute on function public.open_personal_conversation(uuid) to authenticated;

create or replace function public.accept_personal_message_request(requester uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  if requester is null or requester = viewer then
    raise exception 'Invalid requester.';
  end if;

  update public.connection_requests
  set status = 'accepted'
  where requester_id = requester
    and recipient_id = viewer
    and status in ('pending', 'accepted');

  if not found then
    raise exception 'No incoming message request found.';
  end if;

  return public.open_personal_conversation(requester);
end;
$$;

grant execute on function public.accept_personal_message_request(uuid) to authenticated;

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
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  inserted public.messages;
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  if target_conversation is null or not public.is_conversation_member(target_conversation) then
    raise exception 'You are not a participant in this conversation.';
  end if;

  if nullif(btrim(coalesce(message_body, '')), '') is null then
    raise exception 'Message cannot be empty.';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    kind,
    body,
    payload,
    client_id
  )
  values (
    target_conversation,
    viewer,
    case
      when message_kind in ('text', 'image', 'file', 'voice', 'product', 'cart', 'order', 'system')
        then message_kind::public.message_kind
      else 'text'::public.message_kind
    end,
    btrim(message_body),
    coalesce(message_payload, '{}'::jsonb),
    coalesce(message_client_id, gen_random_uuid())
  )
  returning * into inserted;

  update public.conversations
  set updated_at = inserted.created_at
  where id = target_conversation;

  return inserted;
end;
$$;

grant execute on function public.send_personal_message(uuid, text, text, jsonb, uuid) to authenticated;

create or replace function public.mark_personal_conversation_read(target_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  if target_conversation is null or not public.is_conversation_member(target_conversation) then
    raise exception 'You are not a participant in this conversation.';
  end if;

  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = target_conversation
    and user_id = viewer;
end;
$$;

grant execute on function public.mark_personal_conversation_read(uuid) to authenticated;
