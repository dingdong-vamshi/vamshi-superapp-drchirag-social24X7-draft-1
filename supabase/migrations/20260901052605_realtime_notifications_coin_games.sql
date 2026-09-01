-- Realtime chat delivery, in-app social notifications, and authoritative
-- mined-coin debits for the supported local quick games.

alter table public.reward_ledger
  drop constraint if exists reward_ledger_entry_type_check;

alter table public.reward_ledger
  add constraint reward_ledger_entry_type_check
  check (entry_type = any (array[
    'session_reward'::text,
    'adjustment'::text,
    'transfer_in'::text,
    'transfer_out'::text,
    'game_entry'::text,
    'game_refund'::text
  ]));

create table if not exists public.game_coin_config (
  singleton boolean primary key default true check (singleton),
  quick_game_cost_microunits bigint not null default 1000000
    check (quick_game_cost_microunits > 0),
  updated_at timestamptz not null default now()
);

insert into public.game_coin_config(singleton, quick_game_cost_microunits)
values (true, 1000000)
on conflict (singleton) do nothing;

create table if not exists public.game_coin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null check (game_key in (
    'quick-tic-tac-toe',
    'quick-snake-ladder',
    'quick-memory-match'
  )),
  cost_microunits bigint not null check (cost_microunits > 0),
  idempotency_key uuid not null,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists game_coin_sessions_user_created_idx
  on public.game_coin_sessions(user_id, created_at desc);

alter table public.game_coin_config enable row level security;
alter table public.game_coin_sessions enable row level security;

drop policy if exists game_coin_config_authenticated_read on public.game_coin_config;
create policy game_coin_config_authenticated_read
  on public.game_coin_config for select to authenticated using (true);

drop policy if exists game_coin_sessions_owner_read on public.game_coin_sessions;
create policy game_coin_sessions_owner_read
  on public.game_coin_sessions for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.game_coin_config to authenticated;
grant select on public.game_coin_sessions to authenticated;

create or replace function public.get_my_spendable_mined_coins()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  total_balance bigint;
  mined_pool bigint;
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  perform private.finalize_my_reward_session();

  select coalesce(sum(amount_microunits), 0)::bigint
    into total_balance
  from public.reward_ledger
  where user_id = viewer;

  select coalesce(sum(amount_microunits), 0)::bigint
    into mined_pool
  from public.reward_ledger
  where user_id = viewer
    and entry_type in ('session_reward', 'game_entry', 'game_refund');

  return greatest(0, least(total_balance, mined_pool));
end;
$$;

create or replace function public.start_quick_game_with_mined_coins(
  p_game_key text,
  p_idempotency_key uuid
)
returns public.game_coin_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  game_cost bigint;
  available_mined bigint;
  existing_session public.game_coin_sessions;
  created_session public.game_coin_sessions;
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;
  if p_idempotency_key is null then
    raise exception 'A game-start idempotency key is required.';
  end if;
  if p_game_key not in ('quick-tic-tac-toe', 'quick-snake-ladder', 'quick-memory-match') then
    raise exception 'This game is not enabled for mined-coin play.';
  end if;

  select * into existing_session
  from public.game_coin_sessions
  where user_id = viewer and idempotency_key = p_idempotency_key;
  if found then
    return existing_session;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(viewer::text, 0));
  perform private.finalize_my_reward_session();

  select quick_game_cost_microunits into game_cost
  from public.game_coin_config where singleton = true;

  select greatest(0, least(
    coalesce(sum(amount_microunits), 0),
    coalesce(sum(amount_microunits) filter (
      where entry_type in ('session_reward', 'game_entry', 'game_refund')
    ), 0)
  ))::bigint into available_mined
  from public.reward_ledger
  where user_id = viewer;

  if available_mined < game_cost then
    raise exception 'Insufficient mined coins. Mine at least % coin before starting.',
      trim(trailing '.' from trim(trailing '0' from (game_cost::numeric / 1000000)::text));
  end if;

  insert into public.game_coin_sessions(
    user_id, game_key, cost_microunits, idempotency_key
  ) values (
    viewer, p_game_key, game_cost, p_idempotency_key
  )
  returning * into created_session;

  insert into public.reward_ledger(
    user_id, entry_type, amount_microunits, idempotency_key, description
  ) values (
    viewer,
    'game_entry',
    -game_cost,
    'quick-game:entry:' || created_session.id::text,
    'Quick game entry: ' || p_game_key
  );

  return created_session;
end;
$$;

create or replace function public.complete_quick_game(p_session_id uuid)
returns public.game_coin_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  updated_session public.game_coin_sessions;
begin
  if viewer is null then
    raise exception 'Authentication required.';
  end if;

  update public.game_coin_sessions
  set status = 'completed', completed_at = coalesce(completed_at, now())
  where id = p_session_id and user_id = viewer
  returning * into updated_session;

  if updated_session.id is null then
    raise exception 'Game session was not found.';
  end if;
  return updated_session;
end;
$$;

revoke all on function public.get_my_spendable_mined_coins() from public;
revoke all on function public.start_quick_game_with_mined_coins(text, uuid) from public;
revoke all on function public.complete_quick_game(uuid) from public;
grant execute on function public.get_my_spendable_mined_coins() to authenticated;
grant execute on function public.start_quick_game_with_mined_coins(text, uuid) to authenticated;
grant execute on function public.complete_quick_game(uuid) to authenticated;

create table if not exists public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('follow')),
  title text not null,
  body text not null,
  source_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists social_notifications_recipient_idx
  on public.social_notifications(recipient_id, read_at, created_at desc);

alter table public.social_notifications enable row level security;

drop policy if exists social_notifications_recipient_read on public.social_notifications;
create policy social_notifications_recipient_read
  on public.social_notifications for select to authenticated
  using (recipient_id = (select auth.uid()));

drop policy if exists social_notifications_recipient_update on public.social_notifications;
create policy social_notifications_recipient_update
  on public.social_notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

grant select, update on public.social_notifications to authenticated;

create or replace function private.notify_social_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text;
begin
  select coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'Someone')
    into actor_name
  from public.profiles
  where id = new.follower_id;

  insert into public.social_notifications(
    recipient_id, actor_id, kind, title, body, source_key, read_at, created_at
  ) values (
    new.following_id,
    new.follower_id,
    'follow',
    'New follower',
    coalesce(actor_name, 'Someone') || ' started following you.',
    'follow:' || new.follower_id::text || ':' || new.following_id::text,
    null,
    now()
  )
  on conflict (source_key) do update
    set read_at = null, created_at = excluded.created_at, body = excluded.body;
  return new;
end;
$$;

drop trigger if exists follows_create_social_notification on public.follows;
create trigger follows_create_social_notification
after insert on public.follows
for each row execute function private.notify_social_follow();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'messages',
    'conversations',
    'conversation_participants',
    'commerce_notifications',
    'social_notifications',
    'game_coin_sessions',
    'reward_ledger'
  ] loop
    if to_regclass('public.' || table_name) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

-- New email-auth accounts must supply a normalized phone number. Supabase Phone
-- Auth remains separately provider-controlled; until that provider is enabled,
-- this keeps the phone in Auth metadata and the private-by-default profile row
-- without pretending that phone-password/OTP login is active.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'auth', 'private'
as $$
declare
  base_username text;
  candidate_username text;
  normalized_phone text;
  suffix integer := 0;
begin
  normalized_phone := coalesce(
    nullif(regexp_replace(coalesce(new.phone, ''), '\D+', '', 'g'), ''),
    nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone_e164', ''), '\D+', '', 'g'), '')
  );
  base_username := private.clean_profile_username(
    coalesce(
      new.raw_user_meta_data ->> 'preferred_username',
      new.raw_user_meta_data ->> 'username',
      split_part(new.email, '@', 1),
      right(coalesce(normalized_phone, ''), 10)
    ),
    new.id
  );
  candidate_username := base_username;

  while exists(select 1 from public.profiles where username = candidate_username and id <> new.id) loop
    suffix := suffix + 1;
    candidate_username := left(base_username, greatest(3, 30 - length(suffix::text) - 1)) || '_' || suffix::text;
  end loop;

  insert into public.profiles (
    id, username, display_name, phone, is_private, username_discoverable, phone_discoverable
  ) values (
    new.id,
    candidate_username,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), candidate_username), 80),
    normalized_phone,
    false,
    true,
    false
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();

  return new;
end;
$$;
