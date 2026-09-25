-- Single-assignee Business Chat and PII-safe employee/supervisor RPCs.

create type public.business_conversation_work_status as enum ('open', 'resolved');

create table public.business_conversation_assignments (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  assignee_membership_id uuid,
  status public.business_conversation_work_status not null default 'open',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_conversation_assignments_member_storefront_fk
    foreign key (assignee_membership_id, storefront_id)
    references public.storefront_team_memberships(id, storefront_id)
    on delete restrict
);

create index business_conversation_assignments_assignee_idx
  on public.business_conversation_assignments (assignee_membership_id, status, updated_at desc);

create index business_conversation_assignments_storefront_idx
  on public.business_conversation_assignments (storefront_id, status, updated_at desc);

create table public.business_conversation_assignment_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  storefront_id uuid not null references public.storefronts(id) on delete cascade,
  previous_assignee_membership_id uuid references public.storefront_team_memberships(id) on delete set null,
  assignee_membership_id uuid references public.storefront_team_memberships(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('assigned', 'reassigned', 'unassigned', 'resolved', 'reopened')),
  created_at timestamptz not null default now()
);

create index business_conversation_assignment_events_conversation_idx
  on public.business_conversation_assignment_events (conversation_id, created_at desc);

create table private.business_customer_lookup_attempts (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  storefront_id uuid not null,
  matched boolean not null default false,
  created_at timestamptz not null default now()
);

create index business_customer_lookup_attempts_actor_idx
  on private.business_customer_lookup_attempts (actor_user_id, created_at desc);

revoke all on table private.business_customer_lookup_attempts from public, anon, authenticated;

-- Existing owner/customer Business Chats remain operational by assigning the
-- root Owner membership. No messages or participants are rewritten.
insert into public.business_conversation_assignments (
  conversation_id, storefront_id, assignee_membership_id,
  status, assigned_by, assigned_at
)
select
  conversation.id,
  conversation.storefront_id,
  owner_member.id,
  'open',
  storefront.owner_id,
  conversation.created_at
from public.conversations conversation
join public.storefronts storefront on storefront.id = conversation.storefront_id
join public.storefront_team_memberships owner_member
  on owner_member.storefront_id = conversation.storefront_id
 and owner_member.identity_kind = 'owner_personal'
where conversation.kind = 'business'
  and conversation.business_context = 'buyer_seller'
on conflict (conversation_id) do nothing;

create or replace function private.can_read_business_assignment(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations conversation
    join public.business_conversation_assignments assignment
      on assignment.conversation_id = conversation.id
    left join public.storefront_team_memberships assignee
      on assignee.id = assignment.assignee_membership_id
    where conversation.id = target_conversation
      and conversation.kind = 'business'
      and conversation.business_context = 'buyer_seller'
      and (
        conversation.business_customer_id = auth.uid()
        or exists (
          select 1 from public.storefronts storefront
          where storefront.id = assignment.storefront_id and storefront.owner_id = auth.uid()
        )
        or (
          assignee.auth_user_id = auth.uid()
          and assignee.status = 'verified'
        )
        or private.storefront_team_permission(assignment.storefront_id, 'business_chat_monitor')
      )
  );
$$;

create or replace function private.can_reply_business_assignment(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations conversation
    join public.business_conversation_assignments assignment
      on assignment.conversation_id = conversation.id
    join public.storefront_team_memberships assignee
      on assignee.id = assignment.assignee_membership_id
    where conversation.id = target_conversation
      and conversation.kind = 'business'
      and conversation.business_context = 'buyer_seller'
      and assignment.status = 'open'
      and assignee.auth_user_id = auth.uid()
      and assignee.status = 'verified'
      and private.storefront_team_permission(assignment.storefront_id, 'business_chat_reply')
  );
$$;

revoke all on function private.can_read_business_assignment(uuid) from public;
revoke all on function private.can_reply_business_assignment(uuid) from public;
grant execute on function private.can_read_business_assignment(uuid) to authenticated;
grant execute on function private.can_reply_business_assignment(uuid) to authenticated;

alter table public.business_conversation_assignments enable row level security;
alter table public.business_conversation_assignment_events enable row level security;
revoke all on table public.business_conversation_assignments from anon, authenticated;
revoke all on table public.business_conversation_assignment_events from anon, authenticated;
grant select on table public.business_conversation_assignments to authenticated;
grant select on table public.business_conversation_assignment_events to authenticated;

create policy business_conversation_assignments_authorized_read
on public.business_conversation_assignments for select to authenticated
using (private.can_read_business_assignment(conversation_id));

create policy business_conversation_assignment_events_authorized_read
on public.business_conversation_assignment_events for select to authenticated
using (private.can_read_business_assignment(conversation_id));

create or replace function public.get_business_workspace_inbox(p_status text default null)
returns table (
  conversation_id uuid,
  storefront_id uuid,
  customer_display_name text,
  customer_avatar_path text,
  last_message text,
  last_message_at timestamptz,
  work_status text,
  assignee_membership_id uuid,
  assignee_name text,
  assignee_job_title text,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  return query
  select
    conversation.id,
    assignment.storefront_id,
    coalesce(nullif(customer.display_name, ''), 'Customer'),
    customer.avatar_path,
    coalesce(latest.body, 'New business conversation'),
    coalesce(latest.created_at, conversation.updated_at),
    assignment.status::text,
    assignment.assignee_membership_id,
    coalesce(assignee.verified_display_name, assignee.full_name),
    assignee.job_title,
    (
      select count(*)
      from public.messages unread
      left join public.conversation_participants viewer_state
        on viewer_state.conversation_id = conversation.id
       and viewer_state.user_id = viewer
      where unread.conversation_id = conversation.id
        and unread.sender_id is distinct from viewer
        and unread.deleted_at is null
        and (viewer_state.last_read_at is null or unread.created_at > viewer_state.last_read_at)
    )
  from public.business_conversation_assignments assignment
  join public.conversations conversation on conversation.id = assignment.conversation_id
  join public.profiles customer on customer.id = conversation.business_customer_id
  left join public.storefront_team_memberships assignee on assignee.id = assignment.assignee_membership_id
  left join lateral (
    select message.body, message.created_at
    from public.messages message
    where message.conversation_id = conversation.id and message.deleted_at is null
    order by message.created_at desc
    limit 1
  ) latest on true
  where (p_status is null or assignment.status::text = lower(p_status))
    and (
      (assignee.auth_user_id = viewer and assignee.status = 'verified')
      or private.storefront_team_permission(assignment.storefront_id, 'business_chat_monitor')
    )
  order by coalesce(latest.created_at, conversation.updated_at) desc;
end;
$$;

create or replace function public.get_business_workspace_messages(target_conversation uuid)
returns table (
  message_id uuid,
  sender_id uuid,
  body text,
  message_kind text,
  created_at timestamptz,
  sender_type text,
  sender_display_name text,
  sender_tagline text,
  representative_verified boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_read_business_assignment(target_conversation) then
    raise exception 'Conversation access denied.' using errcode = '42501';
  end if;
  return query
  select
    message.id,
    message.sender_id,
    coalesce(message.body, ''),
    message.kind::text,
    message.created_at,
    case
      when message.sender_id = conversation.business_customer_id then 'customer'
      when representative.id is not null then 'representative'
      else 'business'
    end,
    case
      when message.sender_id = conversation.business_customer_id
        then coalesce(nullif(customer.display_name, ''), 'Customer')
      else coalesce(
        nullif(message.payload -> 'business_representative' ->> 'name', ''),
        representative.verified_display_name,
        representative.full_name,
        storefront.name
      )
    end,
    case
      when message.sender_id = conversation.business_customer_id then null
      else coalesce(
        nullif(message.payload -> 'business_representative' ->> 'tagline', ''),
        representative.customer_tagline,
        'from ' || storefront.name
      )
    end,
    case
      when message.sender_id = conversation.business_customer_id then false
      else coalesce(
        (message.payload -> 'business_representative' ->> 'verified')::boolean,
        representative.status = 'verified'
          and storefront.active
          and storefront.verification_status = 'approved',
        false
      )
    end
  from public.messages message
  join public.conversations conversation on conversation.id = message.conversation_id
  join public.storefronts storefront on storefront.id = conversation.storefront_id
  join public.profiles customer on customer.id = conversation.business_customer_id
  left join public.storefront_team_memberships representative
    on representative.auth_user_id = message.sender_id
   and representative.storefront_id = conversation.storefront_id
  where message.conversation_id = target_conversation
    and message.deleted_at is null
  order by message.created_at;
end;
$$;

create or replace function public.send_business_employee_message(
  target_conversation uuid,
  message_body text,
  message_client_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member record;
  inserted public.messages;
begin
  if viewer is null or not private.can_reply_business_assignment(target_conversation) then
    raise exception 'Only the active verified assignee may reply.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(message_body, '')), '') is null then
    raise exception 'Message cannot be empty.' using errcode = '22023';
  end if;
  select
    membership.id,
    membership.storefront_id,
    coalesce(membership.verified_display_name, membership.full_name) as display_name,
    membership.customer_tagline,
    storefront.name as storefront_name,
    storefront.active and storefront.verification_status = 'approved' and membership.status = 'verified' as verified
  into member
  from public.business_conversation_assignments assignment
  join public.storefront_team_memberships membership on membership.id = assignment.assignee_membership_id
  join public.storefronts storefront on storefront.id = assignment.storefront_id
  where assignment.conversation_id = target_conversation
    and membership.auth_user_id = viewer
  for update of assignment;

  insert into public.messages (
    conversation_id, sender_id, kind, body, payload, client_id
  ) values (
    target_conversation,
    viewer,
    'text',
    btrim(message_body),
    jsonb_build_object(
      'business_representative', jsonb_build_object(
        'membership_id', member.id,
        'name', member.display_name,
        'tagline', member.customer_tagline,
        'company', member.storefront_name,
        'verified', member.verified
      )
    ),
    coalesce(message_client_id, gen_random_uuid())
  ) returning * into inserted;
  update public.conversations set updated_at = now() where id = target_conversation;
  return inserted;
end;
$$;

create or replace function public.start_business_customer_chat_by_phone(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member public.storefront_team_memberships%rowtype;
  normalized_phone text;
  customer_id uuid;
  conversation_id uuid;
  storefront_owner uuid;
  existing_assignment public.business_conversation_assignments%rowtype;
begin
  select * into member
  from public.storefront_team_memberships membership
  where membership.auth_user_id = viewer
    and membership.identity_kind = 'work'
    and membership.status = 'verified'
  limit 1;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_chat_reply') then
    raise exception 'Business chat permission required.' using errcode = '42501';
  end if;
  if (
    select count(*)
    from private.business_customer_lookup_attempts attempt
    where attempt.actor_user_id = viewer
      and attempt.created_at > now() - interval '10 minutes'
  ) >= 10 then
    raise exception 'Too many customer lookup attempts. Try again later.' using errcode = '42501';
  end if;
  normalized_phone := private.normalize_login_phone(p_phone);
  if normalized_phone is null or p_phone ~ '[A-Za-z*%_]' then
    insert into private.business_customer_lookup_attempts(actor_user_id, storefront_id, matched)
    values (viewer, member.storefront_id, false);
    return null;
  end if;
  select credential.user_id into customer_id
  from private.account_phone_credentials credential
  join auth.users identity on identity.id = credential.user_id
  join public.profiles profile on profile.id = credential.user_id
  where credential.phone_e164 = normalized_phone
    and credential.is_legacy_shared = false
    and coalesce(identity.raw_app_meta_data ->> 'account_type', '') <> 'business_employee'
  limit 1;
  insert into private.business_customer_lookup_attempts(actor_user_id, storefront_id, matched)
  values (viewer, member.storefront_id, customer_id is not null);
  if customer_id is null then return null; end if;

  select storefront.owner_id into storefront_owner
  from public.storefronts storefront
  where storefront.id = member.storefront_id
    and storefront.active
    and storefront.verification_status = 'approved';
  if storefront_owner is null then
    raise exception 'Verified storefront is unavailable.' using errcode = '42501';
  end if;

  insert into public.conversations (
    kind, storefront_id, business_customer_id, business_context, created_by
  ) values (
    'business', member.storefront_id, customer_id, 'buyer_seller', viewer
  )
  on conflict (storefront_id, business_customer_id, business_context) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  select * into existing_assignment
  from public.business_conversation_assignments assignment
  where assignment.conversation_id = conversation_id
  for update;
  if existing_assignment.assignee_membership_id is not null
    and existing_assignment.assignee_membership_id <> member.id
    and existing_assignment.status = 'open' then
    raise exception 'This customer conversation is already assigned.' using errcode = '23505';
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (conversation_id, customer_id), (conversation_id, storefront_owner), (conversation_id, viewer)
  on conflict do nothing;
  insert into public.business_conversation_assignments (
    conversation_id, storefront_id, assignee_membership_id, status, assigned_by, assigned_at
  ) values (
    conversation_id, member.storefront_id, member.id, 'open', viewer, now()
  )
  on conflict (conversation_id) do update set
    assignee_membership_id = excluded.assignee_membership_id,
    status = 'open',
    assigned_by = viewer,
    assigned_at = now(),
    resolved_by = null,
    resolved_at = null,
    version = public.business_conversation_assignments.version + 1,
    updated_at = now();
  insert into public.business_conversation_assignment_events (
    conversation_id, storefront_id, previous_assignee_membership_id,
    assignee_membership_id, actor_user_id, event_type
  ) values (
    conversation_id, member.storefront_id, existing_assignment.assignee_membership_id,
    member.id, viewer,
    case when existing_assignment.conversation_id is null then 'assigned' else 'reassigned' end
  );
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type, detail
  ) values (
    member.storefront_id, member.id, viewer,
    case when existing_assignment.conversation_id is null then 'assigned' else 'reassigned' end,
    jsonb_build_object('conversationId', conversation_id)
  );
  return conversation_id;
end;
$$;

create or replace function public.reassign_business_conversation(
  target_conversation uuid,
  target_member uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  assignment public.business_conversation_assignments%rowtype;
  previous_member public.storefront_team_memberships%rowtype;
  next_member public.storefront_team_memberships%rowtype;
  customer_id uuid;
  owner_id uuid;
begin
  select * into assignment
  from public.business_conversation_assignments
  where conversation_id = target_conversation
  for update;
  if assignment.conversation_id is null
    or not private.storefront_team_permission(assignment.storefront_id, 'business_chat_assign') then
    raise exception 'Chat assignment permission required.' using errcode = '42501';
  end if;
  select * into next_member
  from public.storefront_team_memberships
  where id = target_member and storefront_id = assignment.storefront_id
    and status = 'verified' and auth_user_id is not null
  for update;
  if next_member.id is null
    or not private.storefront_team_member_permission(next_member.id, 'business_chat_reply') then
    raise exception 'Assignee must be an active representative with reply permission.' using errcode = '22023';
  end if;
  if assignment.assignee_membership_id = next_member.id then return; end if;
  select * into previous_member
  from public.storefront_team_memberships
  where id = assignment.assignee_membership_id;
  select conversation.business_customer_id, storefront.owner_id
  into customer_id, owner_id
  from public.conversations conversation
  join public.storefronts storefront on storefront.id = conversation.storefront_id
  where conversation.id = target_conversation;

  update public.business_conversation_assignments
  set assignee_membership_id = next_member.id,
      status = 'open', assigned_by = viewer, assigned_at = now(),
      resolved_by = null, resolved_at = null,
      version = version + 1, updated_at = now()
  where conversation_id = target_conversation;

  if previous_member.auth_user_id is not null
    and previous_member.auth_user_id <> owner_id
    and previous_member.auth_user_id <> customer_id then
    delete from public.conversation_participants
    where conversation_id = target_conversation and user_id = previous_member.auth_user_id;
  end if;
  insert into public.conversation_participants(conversation_id, user_id)
  values (target_conversation, next_member.auth_user_id)
  on conflict do nothing;
  insert into public.business_conversation_assignment_events (
    conversation_id, storefront_id, previous_assignee_membership_id,
    assignee_membership_id, actor_user_id, event_type
  ) values (
    target_conversation, assignment.storefront_id, assignment.assignee_membership_id,
    next_member.id, viewer,
    case when assignment.assignee_membership_id is null then 'assigned' else 'reassigned' end
  );
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type, detail
  ) values (
    assignment.storefront_id, next_member.id, viewer,
    case when assignment.assignee_membership_id is null then 'assigned' else 'reassigned' end,
    jsonb_build_object('conversationId', target_conversation, 'previousMembershipId', assignment.assignee_membership_id)
  );
end;
$$;

create or replace function public.resolve_business_conversation(target_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment public.business_conversation_assignments%rowtype;
begin
  select * into assignment
  from public.business_conversation_assignments
  where conversation_id = target_conversation
  for update;
  if assignment.conversation_id is null or not private.can_reply_business_assignment(target_conversation) then
    raise exception 'Only the active assignee may resolve this conversation.' using errcode = '42501';
  end if;
  update public.business_conversation_assignments
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      version = version + 1, updated_at = now()
  where conversation_id = target_conversation;
  insert into public.business_conversation_assignment_events (
    conversation_id, storefront_id, assignee_membership_id, actor_user_id, event_type
  ) values (target_conversation, assignment.storefront_id, assignment.assignee_membership_id, auth.uid(), 'resolved');
  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type, detail
  ) values (assignment.storefront_id, assignment.assignee_membership_id, auth.uid(), 'resolved', jsonb_build_object('conversationId', target_conversation));
end;
$$;

create or replace function public.mark_business_conversation_read(target_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.can_read_business_assignment(target_conversation) then
    raise exception 'Conversation access denied.' using errcode = '42501';
  end if;
  update public.conversation_participants
  set last_read_at = now(), manually_unread_at = null
  where conversation_id = target_conversation and user_id = auth.uid();
end;
$$;

create or replace function private.reopen_business_conversation_after_customer_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation public.conversations%rowtype;
  assignment public.business_conversation_assignments%rowtype;
begin
  select * into conversation from public.conversations where id = new.conversation_id;
  if conversation.kind <> 'business' or conversation.business_context <> 'buyer_seller'
    or new.sender_id is distinct from conversation.business_customer_id then
    return new;
  end if;
  select * into assignment
  from public.business_conversation_assignments
  where conversation_id = new.conversation_id
  for update;
  if assignment.status = 'resolved' then
    update public.business_conversation_assignments
    set status = 'open', resolved_by = null, resolved_at = null,
        version = version + 1, updated_at = now()
    where conversation_id = new.conversation_id;
    insert into public.business_conversation_assignment_events (
      conversation_id, storefront_id, assignee_membership_id, actor_user_id, event_type
    ) values (new.conversation_id, assignment.storefront_id, assignment.assignee_membership_id, new.sender_id, 'reopened');
    insert into public.storefront_team_audit_events (
      storefront_id, membership_id, actor_user_id, event_type, detail
    ) values (assignment.storefront_id, assignment.assignee_membership_id, new.sender_id, 'reopened', jsonb_build_object('conversationId', new.conversation_id));
  end if;
  return new;
end;
$$;

drop trigger if exists reopen_business_conversation_after_customer_message on public.messages;
create trigger reopen_business_conversation_after_customer_message
after insert on public.messages
for each row execute function private.reopen_business_conversation_after_customer_message();

-- Preserve non-Business Chat behavior while enforcing one active Business
-- representative at the database policy layer.
drop policy if exists "messages participant send" on public.messages;
create policy "messages participant send"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_member(conversation_id)
  and kind in (
    'text'::public.message_kind, 'image'::public.message_kind,
    'video'::public.message_kind, 'file'::public.message_kind,
    'voice'::public.message_kind, 'product'::public.message_kind,
    'cart'::public.message_kind, 'location'::public.message_kind,
    'contact'::public.message_kind, 'poll'::public.message_kind,
    'event'::public.message_kind
  )
  and (
    not exists (
      select 1 from public.conversations conversation
      where conversation.id = conversation_id
        and conversation.kind = 'business'
        and conversation.business_context = 'buyer_seller'
    )
    or exists (
      select 1 from public.conversations conversation
      where conversation.id = conversation_id
        and conversation.business_customer_id = auth.uid()
    )
    or private.can_reply_business_assignment(conversation_id)
  )
);

-- Suspension/removal revokes assignment and participant access atomically.
create or replace function public.transition_storefront_team_member(
  target_member uuid,
  target_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  member public.storefront_team_memberships%rowtype;
  next_status public.storefront_team_member_status;
  audit_type text;
  affected record;
begin
  select * into member from public.storefront_team_memberships where id = target_member for update;
  if member.id is null
    or not private.storefront_team_permission(member.storefront_id, 'business_team_manage') then
    raise exception 'Team management permission required.' using errcode = '42501';
  end if;
  if member.identity_kind = 'owner_personal' then
    raise exception 'The root Owner membership cannot be suspended or removed.' using errcode = '42501';
  end if;
  if target_action = 'suspend' and member.status in ('verified', 'awaiting_approval') then
    next_status := 'suspended'; audit_type := 'suspended';
  elsif target_action = 'remove' and member.status <> 'removed' then
    next_status := 'removed'; audit_type := 'removed';
  elsif target_action = 'reactivate' and member.status = 'suspended' and member.auth_user_id is not null then
    next_status := 'verified'; audit_type := 'reactivated';
  else
    raise exception 'Invalid member state transition.' using errcode = '22023';
  end if;
  update public.storefront_team_memberships
  set status = next_status,
      suspended_at = case when next_status = 'suspended' then now() else null end,
      removed_at = case when next_status = 'removed' then now() else null end,
      updated_at = now()
  where id = member.id;

  if next_status in ('suspended', 'removed') then
    for affected in
      update public.business_conversation_assignments assignment
      set assignee_membership_id = null,
          assigned_by = viewer,
          assigned_at = now(),
          version = assignment.version + 1,
          updated_at = now()
      where assignment.assignee_membership_id = member.id
      returning assignment.conversation_id, assignment.storefront_id
    loop
      delete from public.conversation_participants participant
      where participant.conversation_id = affected.conversation_id
        and participant.user_id = member.auth_user_id;
      insert into public.business_conversation_assignment_events (
        conversation_id, storefront_id, previous_assignee_membership_id,
        actor_user_id, event_type
      ) values (affected.conversation_id, affected.storefront_id, member.id, viewer, 'unassigned');
    end loop;
  end if;

  insert into public.storefront_team_audit_events (
    storefront_id, membership_id, actor_user_id, event_type
  ) values (member.storefront_id, member.id, viewer, audit_type);
end;
$$;

revoke all on function public.get_business_workspace_inbox(text) from public, anon;
revoke all on function public.get_business_workspace_messages(uuid) from public, anon;
revoke all on function public.send_business_employee_message(uuid, text, uuid) from public, anon;
revoke all on function public.start_business_customer_chat_by_phone(text) from public, anon;
revoke all on function public.reassign_business_conversation(uuid, uuid) from public, anon;
revoke all on function public.resolve_business_conversation(uuid) from public, anon;
revoke all on function public.mark_business_conversation_read(uuid) from public, anon;
grant execute on function public.get_business_workspace_inbox(text) to authenticated;
grant execute on function public.get_business_workspace_messages(uuid) to authenticated;
grant execute on function public.send_business_employee_message(uuid, text, uuid) to authenticated;
grant execute on function public.start_business_customer_chat_by_phone(text) to authenticated;
grant execute on function public.reassign_business_conversation(uuid, uuid) to authenticated;
grant execute on function public.resolve_business_conversation(uuid) to authenticated;
grant execute on function public.mark_business_conversation_read(uuid) to authenticated;

alter table public.business_conversation_assignments replica identity full;
alter table public.business_conversation_assignment_events replica identity full;
