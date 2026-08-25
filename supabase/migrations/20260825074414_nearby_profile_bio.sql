-- Nearby profile copy is intentionally separate from the general Social bio.
-- Exact/rounded coordinates remain private to the owner and the discovery RPC.
alter table public.nearby_people_preferences
  add column if not exists nearby_bio text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nearby_people_preferences_bio_length'
      and conrelid = 'public.nearby_people_preferences'::regclass
  ) then
    alter table public.nearby_people_preferences
      add constraint nearby_people_preferences_bio_length
      check (char_length(nearby_bio) <= 500);
  end if;
end;
$$;

drop policy if exists "nearby pref own read" on public.nearby_people_preferences;
create policy "nearby pref own read"
  on public.nearby_people_preferences
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.save_my_nearby_profile(
  p_bio text,
  p_interests text[] default '{}'::text[]
)
returns table (nearby_bio text, interests text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_bio text := trim(coalesce(p_bio, ''));
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if char_length(v_bio) > 500 then raise exception 'Nearby bio must be 500 characters or fewer.'; end if;

  insert into public.nearby_people_preferences (user_id, nearby_bio, interests)
  values (
    v_user,
    v_bio,
    array(
      select distinct left(trim(value), 40)
      from unnest(coalesce(p_interests, '{}'::text[])) value
      where trim(value) <> ''
      limit 12
    )
  )
  on conflict (user_id) do update set
    nearby_bio = excluded.nearby_bio,
    interests = excluded.interests,
    last_updated_at = clock_timestamp(),
    updated_at = clock_timestamp();

  return query
  select pref.nearby_bio, pref.interests
  from public.nearby_people_preferences pref
  where pref.user_id = v_user;
end;
$$;

revoke all on function public.save_my_nearby_profile(text, text[]) from public, anon;
grant execute on function public.save_my_nearby_profile(text, text[]) to authenticated;

create or replace function public.get_nearby_people_v2(
  p_radius_km numeric default 5,
  p_online_only boolean default false
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
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
    select p.id, p.username, p.display_name, p.avatar_path, pref.nearby_bio, pref.interests,
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
  select c.id, c.username, c.display_name, c.avatar_path, c.nearby_bio, c.interests,
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

revoke all on function public.get_nearby_people_v2(numeric, boolean) from public, anon;
grant execute on function public.get_nearby_people_v2(numeric, boolean) to authenticated;
