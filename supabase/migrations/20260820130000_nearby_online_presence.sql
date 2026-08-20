-- Keep "Online only" separate from Nearby visibility. Presence is intentionally
-- short-lived and stores no additional location data.
alter table public.nearby_people_preferences
  add column if not exists last_active_at timestamptz;

create index if not exists nearby_people_preferences_active_idx
  on public.nearby_people_preferences (last_active_at desc)
  where enabled;

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
  v_previous public.nearby_people_preferences;
  v_lat numeric;
  v_lng numeric;
  v_result public.nearby_people_preferences;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_radius_km is null or p_radius_km < 1 or p_radius_km > 50 then
    raise exception 'Choose a radius between 1 and 50 km.';
  end if;

  select * into v_previous
  from public.nearby_people_preferences
  where user_id = v_user;

  v_lat := coalesce(p_approximate_lat, v_previous.approximate_lat);
  v_lng := coalesce(p_approximate_lng, v_previous.approximate_lng);
  if p_enabled and (v_lat is null or v_lng is null) then
    raise exception 'Approximate location is required when Nearby People is enabled.';
  end if;

  insert into public.nearby_people_preferences (
    user_id, enabled, approximate_lat, approximate_lng, radius_km, interests,
    last_active_at, last_updated_at, updated_at
  ) values (
    v_user, p_enabled,
    case when p_enabled then round(v_lat, 3) else null end,
    case when p_enabled then round(v_lng, 3) else null end,
    p_radius_km,
    array(select distinct left(trim(value), 40) from unnest(coalesce(p_interests, '{}'::text[])) value where trim(value) <> ''),
    case when p_enabled then clock_timestamp() else null end,
    clock_timestamp(), clock_timestamp()
  ) on conflict (user_id) do update set
    enabled = excluded.enabled,
    approximate_lat = excluded.approximate_lat,
    approximate_lng = excluded.approximate_lng,
    radius_km = excluded.radius_km,
    interests = excluded.interests,
    last_active_at = excluded.last_active_at,
    last_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.save_my_nearby_preference(boolean, numeric, numeric, numeric, text[]) from public, anon;
grant execute on function public.save_my_nearby_preference(boolean, numeric, numeric, numeric, text[]) to authenticated;

create or replace function public.touch_my_nearby_presence()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  update public.nearby_people_preferences
  set last_active_at = v_now, updated_at = v_now
  where user_id = v_user and enabled;
  return v_now;
end;
$$;

revoke all on function public.touch_my_nearby_presence() from public, anon;
grant execute on function public.touch_my_nearby_presence() to authenticated;

create or replace function public.get_nearby_people(
  p_radius_km numeric default 5,
  p_online_only boolean default false
)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  interests text[],
  distance_km numeric,
  request_status text,
  is_online boolean
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
      v.radius_km as viewer_radius,
      pref.radius_km as candidate_radius,
      coalesce(pref.last_active_at > clock_timestamp() - interval '3 minutes', false) as is_online
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
    ), 'none'),
    c.is_online
  from candidates c
  where c.raw_distance <= least(c.viewer_radius, c.candidate_radius)
    and (not coalesce(p_online_only, false) or c.is_online)
  order by c.raw_distance asc, c.display_name asc nulls last
  limit 60;
$$;

revoke all on function public.get_nearby_people(numeric, boolean) from public, anon;
grant execute on function public.get_nearby_people(numeric, boolean) to authenticated;
