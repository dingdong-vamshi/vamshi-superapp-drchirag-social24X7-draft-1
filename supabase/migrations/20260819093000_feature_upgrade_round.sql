-- Feature upgrade round: private nearby discovery, wishlists, wallet transfers,
-- and verification-video metadata. Existing commerce and social records remain
-- authoritative and are not rewritten.

-- Keep precise Nearby coordinates owner-only. Discovery is exposed only through
-- the sanitized RPC below, which returns a rounded distance and never coordinates.
drop policy if exists "nearby pref own read" on public.nearby_people_preferences;
create policy "nearby pref own read" on public.nearby_people_preferences
for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.save_my_nearby_preference(
  p_enabled boolean,
  p_radius_km numeric,
  p_approximate_lat numeric default null,
  p_approximate_lng numeric default null,
  p_interests text[] default '{}'::text[]
)
returns public.nearby_people_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_result public.nearby_people_preferences;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 50 then
    raise exception 'Choose a radius between 1 and 50 km.';
  end if;
  if p_enabled and (p_approximate_lat is null or p_approximate_lng is null) then
    raise exception 'Approximate location is required when Nearby People is enabled.';
  end if;

  insert into public.nearby_people_preferences (
    user_id, enabled, approximate_lat, approximate_lng, radius_km, interests,
    last_updated_at, updated_at
  ) values (
    v_user, p_enabled,
    case when p_enabled then round(p_approximate_lat, 3) else null end,
    case when p_enabled then round(p_approximate_lng, 3) else null end,
    p_radius_km,
    array(select distinct left(trim(value), 40) from unnest(coalesce(p_interests, '{}'::text[])) value where trim(value) <> ''),
    clock_timestamp(), clock_timestamp()
  ) on conflict (user_id) do update set
    enabled = excluded.enabled,
    approximate_lat = excluded.approximate_lat,
    approximate_lng = excluded.approximate_lng,
    radius_km = excluded.radius_km,
    interests = excluded.interests,
    last_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.save_my_nearby_preference(boolean, numeric, numeric, numeric, text[]) from public, anon;
grant execute on function public.save_my_nearby_preference(boolean, numeric, numeric, numeric, text[]) to authenticated;

create or replace function public.get_nearby_people(p_radius_km numeric default 5)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  interests text[],
  distance_km numeric,
  request_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select pref.user_id, pref.approximate_lat as lat, pref.approximate_lng as lng,
      least(pref.radius_km, greatest(1::numeric, least(coalesce(p_radius_km, 5), 50))) as radius_km
    from public.nearby_people_preferences pref
    where pref.user_id = (select auth.uid())
      and pref.enabled
      and pref.approximate_lat is not null
      and pref.approximate_lng is not null
  ), candidates as (
    select p.id, p.username, p.display_name, p.bio, pref.interests,
      6371::numeric * acos(least(1::numeric, greatest(-1::numeric,
        cos(radians(v.lat)) * cos(radians(pref.approximate_lat))
        * cos(radians(pref.approximate_lng) - radians(v.lng))
        + sin(radians(v.lat)) * sin(radians(pref.approximate_lat))
      ))) as raw_distance,
      v.radius_km as viewer_radius, pref.radius_km as candidate_radius
    from viewer v
    join public.nearby_people_preferences pref
      on pref.enabled
      and pref.approximate_lat is not null
      and pref.approximate_lng is not null
      and pref.user_id <> v.user_id
    join public.profiles p on p.id = pref.user_id and not p.is_private
  )
  select c.id, c.username, c.display_name, c.bio, c.interests,
    round(c.raw_distance::numeric, 1) as distance_km,
    coalesce((
      select case
        when r.status = 'accepted' then 'accepted'
        when r.requester_id = (select auth.uid()) then 'outgoing'
        else 'incoming'
      end
      from public.connection_requests r
      where ((r.requester_id = (select auth.uid()) and r.recipient_id = c.id)
          or (r.recipient_id = (select auth.uid()) and r.requester_id = c.id))
      order by (r.status = 'accepted') desc, r.created_at desc
      limit 1
    ), 'none')
  from candidates c
  where c.raw_distance <= least(c.viewer_radius, c.candidate_radius)
  order by c.raw_distance asc, c.display_name asc nulls last
  limit 60;
$$;

revoke all on function public.get_nearby_people(numeric) from public, anon;
grant execute on function public.get_nearby_people(numeric) to authenticated;

-- Saved products are private to the account that saved them.
create table if not exists public.product_wishlists (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists product_wishlists_user_created_idx on public.product_wishlists(user_id, created_at desc);
alter table public.product_wishlists enable row level security;
revoke all on public.product_wishlists from public, anon, authenticated;
grant select, insert, delete on public.product_wishlists to authenticated;
create policy "wishlist owner read" on public.product_wishlists for select to authenticated
using (user_id = (select auth.uid()));
create policy "wishlist owner insert" on public.product_wishlists for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "wishlist owner delete" on public.product_wishlists for delete to authenticated
using (user_id = (select auth.uid()));

-- Wallet transfers are two immutable ledger entries backed by one transfer row.
alter table public.reward_ledger drop constraint if exists reward_ledger_entry_type_check;
alter table public.reward_ledger add constraint reward_ledger_entry_type_check
check (entry_type in ('session_reward', 'adjustment', 'transfer_in', 'transfer_out'));

create table if not exists public.reward_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  amount_microunits bigint not null check (amount_microunits > 0),
  note text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, idempotency_key),
  check (sender_id <> recipient_id)
);
create index if not exists reward_transfers_sender_created_idx on public.reward_transfers(sender_id, created_at desc);
create index if not exists reward_transfers_recipient_created_idx on public.reward_transfers(recipient_id, created_at desc);
alter table public.reward_transfers enable row level security;
revoke all on public.reward_transfers from public, anon, authenticated;
grant select on public.reward_transfers to authenticated;
create policy "reward transfer participant read" on public.reward_transfers for select to authenticated
using ((select auth.uid()) in (sender_id, recipient_id));

alter table public.reward_config add column if not exists friend_bonus_bps integer not null default 1000;
alter table public.reward_config add column if not exists max_friend_bonus_bps integer not null default 5000;
alter table public.reward_config drop constraint if exists reward_config_friend_bonus_check;
alter table public.reward_config add constraint reward_config_friend_bonus_check
check (friend_bonus_bps between 0 and 10000 and max_friend_bonus_bps between 0 and 50000);

create or replace function public.start_reward_session()
returns public.reward_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  base_rate bigint;
  friend_bonus integer;
  max_bonus integer;
  accepted_count integer;
  rate bigint;
  created public.reward_sessions;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  perform private.finalize_my_reward_session();
  if exists (select 1 from public.reward_sessions where user_id = viewer and status = 'active' and ends_at > clock_timestamp()) then
    raise exception 'A reward session is already active.';
  end if;
  select base_rate_microunits_per_hour, friend_bonus_bps, max_friend_bonus_bps
    into base_rate, friend_bonus, max_bonus
  from public.reward_config where singleton = true;
  select count(*) into accepted_count from public.connection_requests
  where status = 'accepted' and (requester_id = viewer or recipient_id = viewer);
  rate := floor(base_rate::numeric * (10000 + least(max_bonus, accepted_count * friend_bonus)) / 10000)::bigint;
  insert into public.reward_sessions (user_id, started_at, ends_at, rate_microunits_per_hour)
  values (viewer, clock_timestamp(), clock_timestamp() + interval '24 hours', rate)
  returning * into created;
  return created;
end;
$$;
revoke all on function public.start_reward_session() from public, anon;
grant execute on function public.start_reward_session() to authenticated;

create or replace function public.transfer_reward_coins(
  p_recipient_id uuid,
  p_amount_microunits bigint,
  p_note text default null,
  p_idempotency_key uuid default gen_random_uuid()
)
returns public.reward_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  result public.reward_transfers;
  balance bigint;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  if p_recipient_id is null or p_recipient_id = viewer then raise exception 'Choose another Social24 user.'; end if;
  if p_amount_microunits is null or p_amount_microunits <= 0 then raise exception 'Enter a positive coin amount.'; end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id) then raise exception 'Recipient was not found.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(viewer::text, p_recipient_id::text), 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(viewer::text, p_recipient_id::text), 0));
  select coalesce(sum(amount_microunits), 0) into balance from public.reward_ledger where user_id = viewer;
  if balance < p_amount_microunits then raise exception 'Insufficient confirmed Social24 Coins.'; end if;
  insert into public.reward_transfers(sender_id, recipient_id, amount_microunits, note, idempotency_key)
  values (viewer, p_recipient_id, p_amount_microunits, nullif(left(trim(coalesce(p_note, '')), 140), ''), p_idempotency_key)
  on conflict (sender_id, idempotency_key) do update set note = public.reward_transfers.note
  returning * into result;
  if result.sender_id <> viewer then raise exception 'Transfer idempotency conflict.'; end if;
  insert into public.reward_ledger(user_id, entry_type, amount_microunits, idempotency_key, description)
  values
    (viewer, 'transfer_out', -result.amount_microunits, 'reward-transfer:out:' || result.id::text, 'Sent Social24 Coins'),
    (result.recipient_id, 'transfer_in', result.amount_microunits, 'reward-transfer:in:' || result.id::text, 'Received Social24 Coins')
  on conflict (idempotency_key) do nothing;
  return result;
end;
$$;
revoke all on function public.transfer_reward_coins(uuid, bigint, text, uuid) from public, anon;
grant execute on function public.transfer_reward_coins(uuid, bigint, text, uuid) to authenticated;

-- Add explicit verification-video references without changing any current review state.
alter table public.seller_applications add column if not exists business_verification_video_path text;
alter table public.professional_verification_requests add column if not exists verification_video_path text;
