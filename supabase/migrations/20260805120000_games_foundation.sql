create extension if not exists pgcrypto;

create table if not exists public.game_point_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  game_kind text not null check (game_kind in ('tic_tac_toe', 'snake_ladder')),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  player_limit integer not null check (player_limit between 2 and 4),
  entry_points integer not null default 0 check (entry_points >= 0),
  prize_points integer not null default 0 check (prize_points >= 0),
  is_private boolean not null default false,
  status text not null default 'open' check (status in ('open', 'full', 'starting', 'in_game', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.game_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat_index integer not null check (seat_index between 0 and 3),
  symbol text,
  position integer not null default 1 check (position between 1 and 100),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (room_id, user_id),
  unique (room_id, seat_index)
);

create table if not exists public.game_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.game_rooms(id) on delete cascade,
  game_kind text not null check (game_kind in ('tic_tac_toe', 'snake_ladder')),
  status text not null default 'in_game' check (status in ('waiting', 'in_game', 'completed', 'draw', 'cancelled')),
  board jsonb not null default '{}'::jsonb,
  current_turn_user_id uuid references public.profiles(id) on delete set null,
  winner_id uuid references public.profiles(id) on delete set null,
  result text,
  stats_applied boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_moves (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.game_matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  move_number integer not null check (move_number > 0),
  move_type text not null check (move_type in ('tic_tac_toe_mark', 'snake_ladder_roll')),
  cell_index integer check (cell_index between 0 and 8),
  dice integer check (dice between 1 and 6),
  from_position integer check (from_position between 1 and 100),
  to_position integer check (to_position between 1 and 100),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (match_id, move_number)
);

create table if not exists public.game_point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  transaction_type text not null check (transaction_type in ('initial_grant', 'match_entry', 'match_reward', 'cancelled_room_refund', 'administrative_correction')),
  room_id uuid references public.game_rooms(id) on delete set null,
  match_id uuid references public.game_matches(id) on delete set null,
  operation_ref text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.game_statistics (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  games_played integer not null default 0 check (games_played >= 0),
  games_won integer not null default 0 check (games_won >= 0),
  games_drawn integer not null default 0 check (games_drawn >= 0),
  points_won integer not null default 0 check (points_won >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists game_rooms_status_kind_idx on public.game_rooms(status, game_kind, created_at desc);
create index if not exists game_room_members_user_idx on public.game_room_members(user_id, status);
create index if not exists game_matches_turn_idx on public.game_matches(current_turn_user_id, status);
create index if not exists game_moves_match_created_idx on public.game_moves(match_id, move_number);
create index if not exists game_point_transactions_user_idx on public.game_point_transactions(user_id, created_at desc);

alter table public.game_point_accounts enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_room_members enable row level security;
alter table public.game_matches enable row level security;
alter table public.game_moves enable row level security;
alter table public.game_point_transactions enable row level security;
alter table public.game_statistics enable row level security;

drop policy if exists "game accounts read own" on public.game_point_accounts;
create policy "game accounts read own" on public.game_point_accounts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "game rooms read authenticated" on public.game_rooms;
create policy "game rooms read authenticated" on public.game_rooms
  for select to authenticated using (
    not is_private
    or host_id = (select auth.uid())
    or exists (
      select 1 from public.game_room_members gm
      where gm.room_id = game_rooms.id
        and gm.user_id = (select auth.uid())
        and gm.status = 'active'
    )
  );

drop policy if exists "game members read related" on public.game_room_members;
create policy "game members read related" on public.game_room_members
  for select to authenticated using (
    exists (
      select 1 from public.game_rooms gr
      where gr.id = game_room_members.room_id
        and (
          not gr.is_private
          or gr.host_id = (select auth.uid())
          or exists (
            select 1 from public.game_room_members own
            where own.room_id = gr.id
              and own.user_id = (select auth.uid())
              and own.status = 'active'
          )
        )
    )
  );

drop policy if exists "game matches read related" on public.game_matches;
create policy "game matches read related" on public.game_matches
  for select to authenticated using (
    exists (
      select 1 from public.game_rooms gr
      where gr.id = game_matches.room_id
        and (
          not gr.is_private
          or gr.host_id = (select auth.uid())
          or exists (
            select 1 from public.game_room_members gm
            where gm.room_id = gr.id
              and gm.user_id = (select auth.uid())
              and gm.status = 'active'
          )
        )
    )
  );

drop policy if exists "game moves read related" on public.game_moves;
create policy "game moves read related" on public.game_moves
  for select to authenticated using (
    exists (
      select 1
      from public.game_matches m
      join public.game_rooms gr on gr.id = m.room_id
      where m.id = game_moves.match_id
        and (
          not gr.is_private
          or gr.host_id = (select auth.uid())
          or exists (
            select 1 from public.game_room_members gm
            where gm.room_id = gr.id
              and gm.user_id = (select auth.uid())
              and gm.status = 'active'
          )
        )
    )
  );

drop policy if exists "game point tx read own" on public.game_point_transactions;
create policy "game point tx read own" on public.game_point_transactions
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "game stats read own" on public.game_statistics;
create policy "game stats read own" on public.game_statistics
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.ensure_game_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.game_point_accounts(user_id, balance)
  values (p_user_id, 500)
  on conflict (user_id) do nothing;

  insert into public.game_point_transactions(user_id, amount, transaction_type, operation_ref, metadata)
  values (p_user_id, 500, 'initial_grant', 'game-initial:' || p_user_id::text, jsonb_build_object('note', 'Initial free internal Game Points grant'))
  on conflict (operation_ref) do nothing;

  insert into public.game_statistics(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.active_game_room_member_count(p_room_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.game_room_members
  where room_id = p_room_id and status = 'active'
$$;

create or replace function public.next_game_room_seat(p_room_id uuid, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  seat integer;
begin
  for seat in 0..(p_limit - 1) loop
    if not exists (
      select 1 from public.game_room_members
      where room_id = p_room_id and seat_index = seat and status = 'active'
    ) then
      return seat;
    end if;
  end loop;
  raise exception 'Room is full.';
end;
$$;

create or replace function public.game_profile_json(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'username', coalesce(nullif(p.username, ''), left(p.id::text, 8)),
    'displayName', coalesce(nullif(p.display_name, ''), p.username, 'Player'),
    'initials', upper(left(coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'P'), 1))
  )
  from public.profiles p
  where p.id = p_user_id
$$;

create or replace function public.game_room_json(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', gr.id,
    'roomCode', gr.room_code,
    'gameKind', gr.game_kind,
    'hostId', gr.host_id,
    'host', public.game_profile_json(gr.host_id),
    'name', gr.name,
    'playerLimit', gr.player_limit,
    'entryPoints', gr.entry_points,
    'prizePoints', gr.prize_points,
    'isPrivate', gr.is_private,
    'status', gr.status,
    'createdAt', gr.created_at,
    'startedAt', gr.started_at,
    'completedAt', gr.completed_at,
    'memberCount', public.active_game_room_member_count(gr.id)
  )
  from public.game_rooms gr
  where gr.id = p_room_id
$$;

create or replace function public.game_member_json(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', gm.id,
    'roomId', gm.room_id,
    'userId', gm.user_id,
    'profile', public.game_profile_json(gm.user_id),
    'seatIndex', gm.seat_index,
    'symbol', gm.symbol,
    'position', gm.position,
    'status', gm.status,
    'joinedAt', gm.joined_at
  ) order by gm.seat_index), '[]'::jsonb)
  from public.game_room_members gm
  where gm.room_id = p_room_id and gm.status = 'active'
$$;

create or replace function public.game_match_json(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select to_jsonb(m.*)
  from public.game_matches m
  where m.room_id = p_room_id
$$;

create or replace function public.game_moves_json(p_match_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mv.id,
    'matchId', mv.match_id,
    'userId', mv.user_id,
    'profile', public.game_profile_json(mv.user_id),
    'moveNumber', mv.move_number,
    'moveType', mv.move_type,
    'cellIndex', mv.cell_index,
    'dice', mv.dice,
    'fromPosition', mv.from_position,
    'toPosition', mv.to_position,
    'metadata', mv.metadata,
    'createdAt', mv.created_at
  ) order by mv.move_number), '[]'::jsonb)
  from public.game_moves mv
  where mv.match_id = p_match_id
$$;

create or replace function public.get_games_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  result jsonb;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;

  perform public.ensure_game_account(viewer);

  select jsonb_build_object(
    'account', (select to_jsonb(a.*) from public.game_point_accounts a where a.user_id = viewer),
    'stats', (select to_jsonb(s.*) from public.game_statistics s where s.user_id = viewer),
    'availableRooms', coalesce((
      select jsonb_agg(public.game_room_json(gr.id) order by gr.created_at desc)
      from public.game_rooms gr
      where gr.status in ('open', 'full')
        and not gr.is_private
        and not exists (
          select 1 from public.game_room_members gm
          where gm.room_id = gr.id and gm.user_id = viewer and gm.status = 'active'
        )
      limit 30
    ), '[]'::jsonb),
    'activeRooms', coalesce((
      select jsonb_agg(public.game_room_json(gr.id) order by gr.updated_at desc)
      from public.game_rooms gr
      join public.game_room_members gm on gm.room_id = gr.id
      where gm.user_id = viewer
        and gm.status = 'active'
        and gr.status in ('open', 'full', 'starting', 'in_game')
    ), '[]'::jsonb),
    'recentMatches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match', to_jsonb(m.*),
        'room', public.game_room_json(m.room_id)
      ) order by coalesce(m.completed_at, m.updated_at) desc)
      from public.game_matches m
      join public.game_room_members gm on gm.room_id = m.room_id
      where gm.user_id = viewer
        and m.status in ('completed', 'draw', 'cancelled')
      limit 20
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_game_room_detail(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  room_row public.game_rooms%rowtype;
  match_row public.game_matches%rowtype;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;

  perform public.ensure_game_account(viewer);

  select * into room_row from public.game_rooms where id = p_room_id;
  if not found then
    raise exception 'Game room not found.';
  end if;

  if room_row.is_private
    and room_row.host_id <> viewer
    and not exists (
      select 1 from public.game_room_members
      where room_id = p_room_id and user_id = viewer and status = 'active'
    )
  then
    raise exception 'You do not have access to this private room.';
  end if;

  select * into match_row from public.game_matches where room_id = p_room_id;

  return jsonb_build_object(
    'room', public.game_room_json(p_room_id),
    'members', public.game_member_json(p_room_id),
    'match', case when match_row.id is null then null else to_jsonb(match_row) end,
    'moves', case when match_row.id is null then '[]'::jsonb else public.game_moves_json(match_row.id) end,
    'account', (select to_jsonb(a.*) from public.game_point_accounts a where a.user_id = viewer),
    'viewerId', viewer
  );
end;
$$;

create or replace function public.create_game_room(
  p_game_kind text,
  p_name text,
  p_player_limit integer default 2,
  p_entry_points integer default 0,
  p_is_private boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  room_id uuid;
  normalized_name text := nullif(trim(p_name), '');
  code text;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;
  if p_game_kind not in ('tic_tac_toe', 'snake_ladder') then
    raise exception 'Unsupported game.';
  end if;
  if p_game_kind = 'tic_tac_toe' then
    p_player_limit := 2;
  end if;
  if p_player_limit < 2 or p_player_limit > 4 then
    raise exception 'Player limit must be between 2 and 4.';
  end if;
  if coalesce(p_entry_points, 0) < 0 then
    raise exception 'Entry Points cannot be negative.';
  end if;

  perform public.ensure_game_account(viewer);
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.game_rooms(room_code, game_kind, host_id, name, player_limit, entry_points, prize_points, is_private)
  values (
    code,
    p_game_kind,
    viewer,
    coalesce(normalized_name, case when p_game_kind = 'tic_tac_toe' then 'Tic-Tac-Toe Room' else 'Snake & Ladder Room' end),
    p_player_limit,
    coalesce(p_entry_points, 0),
    coalesce(p_entry_points, 0) * p_player_limit,
    coalesce(p_is_private, false)
  )
  returning id into room_id;

  insert into public.game_room_members(room_id, user_id, seat_index, symbol, position)
  values (room_id, viewer, 0, case when p_game_kind = 'tic_tac_toe' then 'X' else null end, 1);

  return room_id;
end;
$$;

create or replace function public.join_game_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  room_row public.game_rooms%rowtype;
  member_count integer;
  seat integer;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;
  perform public.ensure_game_account(viewer);

  select * into room_row from public.game_rooms where id = p_room_id for update;
  if not found then
    raise exception 'Game room not found.';
  end if;
  if room_row.status not in ('open', 'full') then
    raise exception 'This room is not open for joining.';
  end if;
  if exists (
    select 1 from public.game_room_members
    where room_id = p_room_id and user_id = viewer and status = 'active'
  ) then
    raise exception 'You are already in this room.';
  end if;

  select public.active_game_room_member_count(p_room_id) into member_count;
  if member_count >= room_row.player_limit then
    update public.game_rooms set status = 'full', updated_at = now() where id = p_room_id;
    raise exception 'Room is full.';
  end if;

  seat := public.next_game_room_seat(p_room_id, room_row.player_limit);

  insert into public.game_room_members(room_id, user_id, seat_index, symbol, position)
  values (
    p_room_id,
    viewer,
    seat,
    case when room_row.game_kind = 'tic_tac_toe' then case when seat = 0 then 'X' else 'O' end else null end,
    1
  );

  select public.active_game_room_member_count(p_room_id) into member_count;
  update public.game_rooms
  set status = case when member_count >= player_limit then 'full' else 'open' end,
      updated_at = now()
  where id = p_room_id;
end;
$$;

create or replace function public.leave_game_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  room_row public.game_rooms%rowtype;
  member_count integer;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;

  select * into room_row from public.game_rooms where id = p_room_id for update;
  if not found then
    raise exception 'Game room not found.';
  end if;
  if room_row.status not in ('open', 'full') then
    raise exception 'You can leave only before the match starts.';
  end if;

  update public.game_room_members
  set status = 'left', left_at = now()
  where room_id = p_room_id and user_id = viewer and status = 'active';

  if not found then
    raise exception 'You are not active in this room.';
  end if;

  select public.active_game_room_member_count(p_room_id) into member_count;

  if member_count = 0 then
    update public.game_rooms set status = 'cancelled', completed_at = now(), updated_at = now() where id = p_room_id;
  elsif room_row.host_id = viewer then
    update public.game_rooms
    set host_id = (
      select user_id from public.game_room_members
      where room_id = p_room_id and status = 'active'
      order by seat_index
      limit 1
    ),
    status = 'open',
    updated_at = now()
    where id = p_room_id;
  else
    update public.game_rooms set status = 'open', updated_at = now() where id = p_room_id;
  end if;
end;
$$;

create or replace function public.start_game_room(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  room_row public.game_rooms%rowtype;
  member_count integer;
  match_id uuid;
  first_turn uuid;
  member_row record;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;

  select * into room_row from public.game_rooms where id = p_room_id for update;
  if not found then
    raise exception 'Game room not found.';
  end if;
  if room_row.host_id <> viewer then
    raise exception 'Only the host can start this room.';
  end if;
  if room_row.status not in ('open', 'full') then
    raise exception 'This room cannot be started now.';
  end if;

  select public.active_game_room_member_count(p_room_id) into member_count;
  if room_row.game_kind = 'tic_tac_toe' and member_count <> 2 then
    raise exception 'Tic-Tac-Toe needs exactly 2 players.';
  end if;
  if room_row.game_kind = 'snake_ladder' and member_count < 2 then
    raise exception 'Snake & Ladder needs at least 2 players.';
  end if;

  update public.game_rooms set status = 'starting', updated_at = now() where id = p_room_id;

  if room_row.entry_points > 0 then
    for member_row in
      select * from public.game_room_members where room_id = p_room_id and status = 'active' order by seat_index
    loop
      update public.game_point_accounts
      set balance = balance - room_row.entry_points, updated_at = now()
      where user_id = member_row.user_id and balance >= room_row.entry_points;
      if not found then
        raise exception 'A player does not have enough Game Points.';
      end if;

      insert into public.game_point_transactions(user_id, amount, transaction_type, room_id, operation_ref)
      values (member_row.user_id, -room_row.entry_points, 'match_entry', p_room_id, 'entry:' || p_room_id::text || ':' || member_row.user_id::text)
      on conflict (operation_ref) do nothing;
    end loop;
  end if;

  select user_id into first_turn
  from public.game_room_members
  where room_id = p_room_id and status = 'active'
  order by seat_index
  limit 1;

  insert into public.game_matches(room_id, game_kind, status, board, current_turn_user_id)
  values (
    p_room_id,
    room_row.game_kind,
    'in_game',
    case
      when room_row.game_kind = 'tic_tac_toe' then jsonb_build_object('cells', jsonb_build_array('', '', '', '', '', '', '', '', ''), 'winnerLine', null)
      else jsonb_build_object('positions', '{}'::jsonb, 'snakes', jsonb_build_object('16', 6, '47', 26, '49', 11, '56', 53, '62', 19, '64', 60, '87', 24, '93', 73, '95', 75, '98', 78), 'ladders', jsonb_build_object('1', 38, '4', 14, '9', 31, '21', 42, '28', 84, '36', 44, '51', 67, '71', 91, '80', 100))
    end,
    first_turn
  )
  returning id into match_id;

  update public.game_room_members
  set position = 1
  where room_id = p_room_id and status = 'active';

  update public.game_rooms
  set status = 'in_game', started_at = now(), updated_at = now()
  where id = p_room_id;

  return match_id;
end;
$$;

create or replace function public.apply_game_result(p_match_id uuid, p_winner_id uuid, p_is_draw boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.game_matches%rowtype;
  room_row public.game_rooms%rowtype;
  member_row record;
begin
  select * into match_row from public.game_matches where id = p_match_id for update;
  if not found then
    raise exception 'Match not found.';
  end if;
  if match_row.stats_applied then
    return;
  end if;
  select * into room_row from public.game_rooms where id = match_row.room_id;

  for member_row in
    select user_id from public.game_room_members where room_id = room_row.id and status = 'active'
  loop
    insert into public.game_statistics(user_id) values (member_row.user_id) on conflict (user_id) do nothing;
    update public.game_statistics
    set games_played = games_played + 1,
        games_won = games_won + case when member_row.user_id = p_winner_id then 1 else 0 end,
        games_drawn = games_drawn + case when p_is_draw then 1 else 0 end,
        points_won = points_won + case when member_row.user_id = p_winner_id then room_row.prize_points else 0 end,
        updated_at = now()
    where user_id = member_row.user_id;
  end loop;

  if p_winner_id is not null and room_row.prize_points > 0 then
    update public.game_point_accounts
    set balance = balance + room_row.prize_points, updated_at = now()
    where user_id = p_winner_id;

    insert into public.game_point_transactions(user_id, amount, transaction_type, room_id, match_id, operation_ref)
    values (p_winner_id, room_row.prize_points, 'match_reward', room_row.id, p_match_id, 'reward:' || p_match_id::text || ':' || p_winner_id::text)
    on conflict (operation_ref) do nothing;
  end if;

  update public.game_matches set stats_applied = true where id = p_match_id;
end;
$$;

create or replace function public.tic_tac_toe_winner(p_cells jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  a text;
begin
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) <> 9 then
    return null;
  end if;

  a := p_cells ->> 0;
  if a <> '' and a = (p_cells ->> 1) and a = (p_cells ->> 2) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(0, 1, 2)); end if;
  a := p_cells ->> 3;
  if a <> '' and a = (p_cells ->> 4) and a = (p_cells ->> 5) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(3, 4, 5)); end if;
  a := p_cells ->> 6;
  if a <> '' and a = (p_cells ->> 7) and a = (p_cells ->> 8) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(6, 7, 8)); end if;
  a := p_cells ->> 0;
  if a <> '' and a = (p_cells ->> 3) and a = (p_cells ->> 6) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(0, 3, 6)); end if;
  a := p_cells ->> 1;
  if a <> '' and a = (p_cells ->> 4) and a = (p_cells ->> 7) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(1, 4, 7)); end if;
  a := p_cells ->> 2;
  if a <> '' and a = (p_cells ->> 5) and a = (p_cells ->> 8) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(2, 5, 8)); end if;
  a := p_cells ->> 0;
  if a <> '' and a = (p_cells ->> 4) and a = (p_cells ->> 8) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(0, 4, 8)); end if;
  a := p_cells ->> 2;
  if a <> '' and a = (p_cells ->> 4) and a = (p_cells ->> 6) then return jsonb_build_object('symbol', a, 'line', jsonb_build_array(2, 4, 6)); end if;

  return null;
end;
$$;

create or replace function public.play_tic_tac_toe_move(p_match_id uuid, p_cell_index integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  match_row public.game_matches%rowtype;
  room_row public.game_rooms%rowtype;
  member_row public.game_room_members%rowtype;
  next_user uuid;
  cells jsonb;
  win jsonb;
  move_no integer;
  draw boolean;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;
  if p_cell_index < 0 or p_cell_index > 8 then
    raise exception 'Cell must be between 0 and 8.';
  end if;

  select * into match_row from public.game_matches where id = p_match_id for update;
  if not found or match_row.game_kind <> 'tic_tac_toe' then
    raise exception 'Tic-Tac-Toe match not found.';
  end if;
  if match_row.status <> 'in_game' then
    raise exception 'This match is already complete.';
  end if;
  if match_row.current_turn_user_id <> viewer then
    raise exception 'It is not your turn.';
  end if;

  select * into room_row from public.game_rooms where id = match_row.room_id;
  select * into member_row
  from public.game_room_members
  where room_id = room_row.id and user_id = viewer and status = 'active';
  if not found then
    raise exception 'You are not in this match.';
  end if;

  cells := match_row.board -> 'cells';
  if cells ->> p_cell_index <> '' then
    raise exception 'That cell is already taken.';
  end if;

  cells := jsonb_set(cells, array[p_cell_index::text], to_jsonb(member_row.symbol));
  win := public.tic_tac_toe_winner(cells);
  draw := win is null and not exists (select 1 from jsonb_array_elements_text(cells) cell where cell = '');
  select coalesce(max(move_number), 0) + 1 into move_no from public.game_moves where match_id = p_match_id;

  insert into public.game_moves(match_id, user_id, move_number, move_type, cell_index, metadata)
  values (p_match_id, viewer, move_no, 'tic_tac_toe_mark', p_cell_index, jsonb_build_object('symbol', member_row.symbol));

  if win is not null then
    update public.game_matches
    set board = jsonb_set(jsonb_set(match_row.board, '{cells}', cells), '{winnerLine}', win -> 'line'),
        status = 'completed',
        winner_id = viewer,
        result = member_row.symbol || ' wins',
        current_turn_user_id = null,
        completed_at = now(),
        updated_at = now()
    where id = p_match_id;
    update public.game_rooms set status = 'completed', completed_at = now(), updated_at = now() where id = room_row.id;
    perform public.apply_game_result(p_match_id, viewer, false);
  elsif draw then
    update public.game_matches
    set board = jsonb_set(match_row.board, '{cells}', cells),
        status = 'draw',
        result = 'Draw',
        current_turn_user_id = null,
        completed_at = now(),
        updated_at = now()
    where id = p_match_id;
    update public.game_rooms set status = 'completed', completed_at = now(), updated_at = now() where id = room_row.id;
    perform public.apply_game_result(p_match_id, null, true);
  else
    select user_id into next_user
    from public.game_room_members
    where room_id = room_row.id and status = 'active' and user_id <> viewer
    order by seat_index
    limit 1;
    update public.game_matches
    set board = jsonb_set(match_row.board, '{cells}', cells),
        current_turn_user_id = next_user,
        updated_at = now()
    where id = p_match_id;
  end if;

  return public.get_game_room_detail(room_row.id);
end;
$$;

create or replace function public.roll_snake_ladder(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  match_row public.game_matches%rowtype;
  room_row public.game_rooms%rowtype;
  member_row public.game_room_members%rowtype;
  dice_value integer;
  from_pos integer;
  raw_to integer;
  final_to integer;
  jump_to integer;
  next_user uuid;
  move_no integer;
begin
  if viewer is null then
    raise exception 'You need to sign in first.';
  end if;

  select * into match_row from public.game_matches where id = p_match_id for update;
  if not found or match_row.game_kind <> 'snake_ladder' then
    raise exception 'Snake & Ladder match not found.';
  end if;
  if match_row.status <> 'in_game' then
    raise exception 'This match is already complete.';
  end if;
  if match_row.current_turn_user_id <> viewer then
    raise exception 'It is not your turn.';
  end if;

  select * into room_row from public.game_rooms where id = match_row.room_id;
  select * into member_row
  from public.game_room_members
  where room_id = room_row.id and user_id = viewer and status = 'active'
  for update;
  if not found then
    raise exception 'You are not in this match.';
  end if;

  from_pos := member_row.position;
  dice_value := 1 + floor(random() * 6)::integer;
  raw_to := from_pos + dice_value;
  if raw_to > 100 then
    final_to := from_pos;
  else
    jump_to := coalesce(
      (match_row.board -> 'snakes' ->> raw_to::text)::integer,
      (match_row.board -> 'ladders' ->> raw_to::text)::integer
    );
    final_to := coalesce(jump_to, raw_to);
  end if;

  select coalesce(max(move_number), 0) + 1 into move_no from public.game_moves where match_id = p_match_id;

  update public.game_room_members
  set position = final_to
  where id = member_row.id;

  insert into public.game_moves(match_id, user_id, move_number, move_type, dice, from_position, to_position, metadata)
  values (
    p_match_id,
    viewer,
    move_no,
    'snake_ladder_roll',
    dice_value,
    from_pos,
    final_to,
    jsonb_build_object('rawTo', raw_to, 'jumped', jump_to is not null)
  );

  if final_to = 100 then
    update public.game_matches
    set status = 'completed',
        winner_id = viewer,
        result = 'Winner reached 100',
        current_turn_user_id = null,
        completed_at = now(),
        updated_at = now()
    where id = p_match_id;
    update public.game_rooms set status = 'completed', completed_at = now(), updated_at = now() where id = room_row.id;
    perform public.apply_game_result(p_match_id, viewer, false);
  else
    select user_id into next_user
    from public.game_room_members
    where room_id = room_row.id
      and status = 'active'
      and seat_index > member_row.seat_index
    order by seat_index
    limit 1;

    if next_user is null then
      select user_id into next_user
      from public.game_room_members
      where room_id = room_row.id and status = 'active'
      order by seat_index
      limit 1;
    end if;

    update public.game_matches
    set current_turn_user_id = next_user,
        updated_at = now()
    where id = p_match_id;
  end if;

  return public.get_game_room_detail(room_row.id);
end;
$$;

revoke all on function public.ensure_game_account(uuid) from public, anon;
revoke all on function public.next_game_room_seat(uuid, integer) from public, anon;
revoke all on function public.apply_game_result(uuid, uuid, boolean) from public, anon;
revoke all on function public.get_games_dashboard() from public, anon;
revoke all on function public.get_game_room_detail(uuid) from public, anon;
revoke all on function public.create_game_room(text, text, integer, integer, boolean) from public, anon;
revoke all on function public.join_game_room(uuid) from public, anon;
revoke all on function public.leave_game_room(uuid) from public, anon;
revoke all on function public.start_game_room(uuid) from public, anon;
revoke all on function public.play_tic_tac_toe_move(uuid, integer) from public, anon;
revoke all on function public.roll_snake_ladder(uuid) from public, anon;

grant execute on function public.get_games_dashboard() to authenticated;
grant execute on function public.get_game_room_detail(uuid) to authenticated;
grant execute on function public.create_game_room(text, text, integer, integer, boolean) to authenticated;
grant execute on function public.join_game_room(uuid) to authenticated;
grant execute on function public.leave_game_room(uuid) to authenticated;
grant execute on function public.start_game_room(uuid) to authenticated;
grant execute on function public.play_tic_tac_toe_move(uuid, integer) to authenticated;
grant execute on function public.roll_snake_ladder(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.game_point_accounts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.game_rooms;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.game_room_members;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.game_matches;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.game_moves;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.game_statistics;
exception when duplicate_object then null;
end $$;
