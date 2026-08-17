-- Social, group-chat, global-avatar, and internal reward foundations.
-- This migration is additive: existing posts, stories, conversations, and
-- Creator Commerce approval records remain authoritative.

create schema if not exists private;

alter table public.stories
  add column if not exists content_type text not null default 'media',
  add column if not exists text_content text,
  add column if not exists background_style text;

alter table public.stories alter column media_path drop not null;
alter table public.stories alter column media_type drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stories_typed_content_check'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_typed_content_check check (
        (content_type = 'media' and media_path is not null and media_type in ('image', 'video'))
        or
        (content_type = 'text' and nullif(btrim(text_content), '') is not null
          and background_style in ('forest', 'sunset', 'ocean', 'berry', 'midnight'))
      );
  end if;
end $$;

alter table public.conversations
  add column if not exists title text,
  add column if not exists image_path text;

alter table public.conversation_participants
  add column if not exists member_role text not null default 'member';

-- Membership is created only by the security-definer direct, business, and
-- group RPCs. A broad self-insert policy would let an authenticated outsider
-- join a private group merely by knowing its conversation id.
drop policy if exists "participants self insert" on public.conversation_participants;
revoke insert on public.conversation_participants from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_participants_member_role_check'
      and conrelid = 'public.conversation_participants'::regclass
  ) then
    alter table public.conversation_participants
      add constraint conversation_participants_member_role_check
      check (member_role in ('member', 'admin'));
  end if;
end $$;

create index if not exists conversations_group_updated_idx
  on public.conversations (updated_at desc) where kind = 'group';
create index if not exists conversation_participants_group_role_idx
  on public.conversation_participants (conversation_id, member_role, user_id);

create or replace function public.get_public_social_profiles(target_ids uuid[])
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_path text,
  verified_professional boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_path,
    coalesce(cca.professional_status::text = 'approved', false)
  from public.profiles p
  left join public.creator_commerce_access cca on cca.user_id = p.id
  where p.id = any(coalesce(target_ids, '{}'::uuid[]))
    and (not p.is_private or p.id = (select auth.uid()));
$$;

revoke all on function public.get_public_social_profiles(uuid[]) from public, anon;
grant execute on function public.get_public_social_profiles(uuid[]) to authenticated;

create or replace function public.search_social_entities(
  search_text text,
  result_limit integer default 20
)
returns table (
  entity_kind text,
  entity_id uuid,
  author_id uuid,
  username text,
  display_name text,
  avatar_path text,
  verified_professional boolean,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select nullif(btrim(search_text), '') as query,
           greatest(1, least(coalesce(result_limit, 20), 40)) as take
  ), profile_matches as (
    select
      'profile'::text,
      p.id,
      p.id,
      p.username,
      p.display_name,
      p.avatar_path,
      coalesce(cca.professional_status::text = 'approved', false),
      p.bio,
      p.updated_at
    from public.profiles p
    left join public.creator_commerce_access cca on cca.user_id = p.id
    cross join input i
    where i.query is not null
      and (not p.is_private or p.id = (select auth.uid()))
      and (p.display_name ilike '%' || i.query || '%' or p.username ilike '%' || i.query || '%')
    order by p.display_name
    limit (select take from input)
  ), post_matches as (
    select
      'post'::text,
      po.id,
      po.author_id,
      p.username,
      p.display_name,
      p.avatar_path,
      coalesce(cca.professional_status::text = 'approved', false),
      po.body,
      po.created_at
    from public.posts po
    join public.profiles p on p.id = po.author_id
    left join public.creator_commerce_access cca on cca.user_id = p.id
    cross join input i
    where i.query is not null
      and po.visibility = 'public'
      and not p.is_private
      and po.body ilike '%' || i.query || '%'
    order by po.created_at desc
    limit (select take from input)
  )
  select * from profile_matches
  union all
  select * from post_matches
  limit (select take from input);
$$;

revoke all on function public.search_social_entities(text, integer) from public, anon;
grant execute on function public.search_social_entities(text, integer) to authenticated;

create or replace function public.list_group_eligible_contacts()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.id, p.username, p.display_name, p.avatar_path
  from public.connection_requests cr
  join public.profiles p
    on p.id = case
      when cr.requester_id = (select auth.uid()) then cr.recipient_id
      else cr.requester_id
    end
  where cr.status = 'accepted'
    and (select auth.uid()) in (cr.requester_id, cr.recipient_id)
  order by p.display_name;
$$;

revoke all on function public.list_group_eligible_contacts() from public, anon;
grant execute on function public.list_group_eligible_contacts() to authenticated;

create or replace function public.create_group_conversation(
  group_name text,
  member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  clean_members uuid[];
  created_conversation uuid;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  if length(btrim(group_name)) < 2 or length(btrim(group_name)) > 80 then
    raise exception 'Group name must be between 2 and 80 characters.';
  end if;

  select coalesce(array_agg(distinct member_id), '{}'::uuid[])
  into clean_members
  from unnest(coalesce(member_ids, '{}'::uuid[])) as member_id
  where member_id <> viewer
    and exists (
      select 1 from public.connection_requests cr
      where cr.status = 'accepted'
        and ((cr.requester_id = viewer and cr.recipient_id = member_id)
          or (cr.recipient_id = viewer and cr.requester_id = member_id))
    );

  if coalesce(array_length(clean_members, 1), 0) < 2 then
    raise exception 'Select at least two accepted contacts.';
  end if;

  insert into public.conversations (kind, created_by, title)
  values ('group', viewer, btrim(group_name))
  returning id into created_conversation;

  insert into public.conversation_participants (conversation_id, user_id, member_role)
  values (created_conversation, viewer, 'admin');

  insert into public.conversation_participants (conversation_id, user_id, member_role)
  select created_conversation, member_id, 'member'
  from unnest(clean_members) as member_id
  on conflict (conversation_id, user_id) do nothing;

  return created_conversation;
end;
$$;

revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

create or replace function public.get_group_members(target_conversation uuid)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  member_role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_path, cp.member_role, cp.joined_at
  from public.conversation_participants cp
  join public.profiles p on p.id = cp.user_id
  where cp.conversation_id = target_conversation
    and exists (
      select 1 from public.conversation_participants viewer_cp
      where viewer_cp.conversation_id = target_conversation
        and viewer_cp.user_id = (select auth.uid())
    )
  order by (cp.member_role = 'admin') desc, p.display_name;
$$;

revoke all on function public.get_group_members(uuid) from public, anon;
grant execute on function public.get_group_members(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_media_authenticated_read on storage.objects;
create policy profile_media_authenticated_read on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-media'
  and exists (
    select 1 from public.profiles p
    where p.id::text = (storage.foldername(name))[1]
      and (not p.is_private or p.id = (select auth.uid()))
  )
);

drop policy if exists profile_media_owner_insert on storage.objects;
create policy profile_media_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner = (select auth.uid())
);

drop policy if exists profile_media_owner_update on storage.objects;
create policy profile_media_owner_update on storage.objects
for update to authenticated
using (bucket_id = 'profile-media' and owner = (select auth.uid()))
with check (bucket_id = 'profile-media' and owner = (select auth.uid()));

drop policy if exists profile_media_owner_delete on storage.objects;
create policy profile_media_owner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'profile-media' and owner = (select auth.uid()));

create table if not exists public.reward_config (
  singleton boolean primary key default true check (singleton),
  base_rate_microunits_per_hour bigint not null check (base_rate_microunits_per_hour > 0),
  updated_at timestamptz not null default now()
);

insert into public.reward_config (singleton, base_rate_microunits_per_hour)
values (true, 1000000)
on conflict (singleton) do nothing;

create table if not exists public.reward_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  rate_microunits_per_hour bigint not null check (rate_microunits_per_hour > 0),
  status text not null default 'active' check (status in ('active', 'completed')),
  completed_at timestamptz,
  reward_microunits bigint check (reward_microunits is null or reward_microunits >= 0),
  created_at timestamptz not null default now(),
  constraint reward_sessions_duration_check check (ends_at > started_at)
);

create unique index if not exists reward_sessions_one_active_user_idx
  on public.reward_sessions (user_id) where status = 'active';
create index if not exists reward_sessions_user_history_idx
  on public.reward_sessions (user_id, started_at desc);

create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.reward_sessions(id) on delete restrict,
  entry_type text not null check (entry_type in ('session_reward', 'adjustment')),
  amount_microunits bigint not null check (amount_microunits <> 0),
  idempotency_key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists reward_ledger_user_created_idx
  on public.reward_ledger (user_id, created_at desc);
create index if not exists reward_ledger_session_idx
  on public.reward_ledger (session_id);

alter table public.reward_config enable row level security;
alter table public.reward_sessions enable row level security;
alter table public.reward_ledger enable row level security;

drop policy if exists reward_config_authenticated_read on public.reward_config;
create policy reward_config_authenticated_read on public.reward_config
for select to authenticated using (true);
drop policy if exists reward_sessions_owner_read on public.reward_sessions;
create policy reward_sessions_owner_read on public.reward_sessions
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists reward_ledger_owner_read on public.reward_ledger;
create policy reward_ledger_owner_read on public.reward_ledger
for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.reward_config, public.reward_sessions, public.reward_ledger from anon, authenticated;
grant select on public.reward_config, public.reward_sessions, public.reward_ledger to authenticated;

create or replace function private.finalize_my_reward_session()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  active_session public.reward_sessions%rowtype;
  earned bigint;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;

  select * into active_session
  from public.reward_sessions
  where user_id = viewer and status = 'active' and ends_at <= clock_timestamp()
  for update skip locked;

  if active_session.id is null then return; end if;

  earned := floor(
    active_session.rate_microunits_per_hour::numeric
    * extract(epoch from (active_session.ends_at - active_session.started_at))::numeric
    / 3600
  )::bigint;

  update public.reward_sessions
  set status = 'completed', completed_at = clock_timestamp(), reward_microunits = earned
  where id = active_session.id;

  insert into public.reward_ledger (
    user_id, session_id, entry_type, amount_microunits, idempotency_key, description
  ) values (
    viewer, active_session.id, 'session_reward', earned,
    'reward-session:' || active_session.id::text,
    '24-hour reward session completed'
  ) on conflict (idempotency_key) do nothing;
end;
$$;

revoke all on function private.finalize_my_reward_session() from public, anon, authenticated;

create or replace function public.start_reward_session()
returns public.reward_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  rate bigint;
  created public.reward_sessions;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  perform private.finalize_my_reward_session();

  if exists (
    select 1 from public.reward_sessions
    where user_id = viewer and status = 'active' and ends_at > clock_timestamp()
  ) then
    raise exception 'A reward session is already active.';
  end if;

  select base_rate_microunits_per_hour into rate
  from public.reward_config where singleton = true;

  insert into public.reward_sessions (
    user_id, started_at, ends_at, rate_microunits_per_hour
  ) values (
    viewer, clock_timestamp(), clock_timestamp() + interval '24 hours', rate
  ) returning * into created;

  return created;
end;
$$;

revoke all on function public.start_reward_session() from public, anon;
grant execute on function public.start_reward_session() to authenticated;

create or replace function public.get_my_reward_snapshot()
returns table (
  confirmed_balance_microunits bigint,
  pending_microunits bigint,
  today_microunits bigint,
  active_session_id uuid,
  started_at timestamptz,
  ends_at timestamptz,
  rate_microunits_per_hour bigint,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  perform private.finalize_my_reward_session();

  return query
  select
    coalesce((select sum(l.amount_microunits) from public.reward_ledger l where l.user_id = viewer), 0)::bigint,
    coalesce(floor(
      s.rate_microunits_per_hour::numeric
      * extract(epoch from (least(clock_timestamp(), s.ends_at) - s.started_at))::numeric
      / 3600
    ), 0)::bigint,
    (coalesce((
      select sum(l.amount_microunits) from public.reward_ledger l
      where l.user_id = viewer and l.created_at >= date_trunc('day', clock_timestamp())
    ), 0) + coalesce(floor(
      s.rate_microunits_per_hour::numeric
      * extract(epoch from (least(clock_timestamp(), s.ends_at) - greatest(s.started_at, date_trunc('day', clock_timestamp()))))::numeric
      / 3600
    ), 0))::bigint,
    s.id,
    s.started_at,
    s.ends_at,
    coalesce(s.rate_microunits_per_hour, c.base_rate_microunits_per_hour),
    clock_timestamp()
  from public.reward_config c
  left join public.reward_sessions s
    on s.user_id = viewer and s.status = 'active' and s.ends_at > clock_timestamp()
  where c.singleton = true;
end;
$$;

revoke all on function public.get_my_reward_snapshot() from public, anon;
grant execute on function public.get_my_reward_snapshot() to authenticated;

create or replace function public.get_my_reward_history(result_limit integer default 20)
returns table (
  id uuid,
  amount_microunits bigint,
  description text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.'; end if;
  perform private.finalize_my_reward_session();
  return query
  select l.id, l.amount_microunits, l.description, l.created_at
  from public.reward_ledger l
  where l.user_id = (select auth.uid())
  order by l.created_at desc
  limit greatest(1, least(coalesce(result_limit, 20), 100));
end;
$$;

revoke all on function public.get_my_reward_history(integer) from public, anon;
grant execute on function public.get_my_reward_history(integer) to authenticated;
