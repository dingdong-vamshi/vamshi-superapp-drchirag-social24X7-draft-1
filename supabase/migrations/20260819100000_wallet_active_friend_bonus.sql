-- Mining rewards use the same active-friend network calculation shown in Wallet.
-- A friend only contributes while they have an active reward session.

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
  active_count integer;
  effective_bonus integer;
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

  with circle as (
    select case when requester_id = viewer then recipient_id else requester_id end as user_id
    from public.connection_requests
    where status = 'accepted' and (requester_id = viewer or recipient_id = viewer)
  )
  select count(*)::integer,
    count(*) filter (where exists (
      select 1 from public.reward_sessions s
      where s.user_id = circle.user_id and s.status = 'active' and s.ends_at > clock_timestamp()
    ))::integer
  into accepted_count, active_count
  from circle;

  effective_bonus := least(
    max_bonus,
    active_count * friend_bonus
      + floor(friend_bonus * active_count::numeric / greatest(accepted_count, 1))::integer
  );
  rate := floor(base_rate::numeric * (10000 + effective_bonus) / 10000)::bigint;

  insert into public.reward_sessions (user_id, started_at, ends_at, rate_microunits_per_hour)
  values (viewer, clock_timestamp(), clock_timestamp() + interval '24 hours', rate)
  returning * into created;
  return created;
end;
$$;

revoke all on function public.start_reward_session() from public, anon;
grant execute on function public.start_reward_session() to authenticated;

create or replace function public.get_my_lifetime_mined_coins()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid();
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  return coalesce((select sum(amount_microunits) from public.reward_ledger where user_id = viewer and entry_type = 'session_reward'), 0)::bigint;
end;
$$;

revoke all on function public.get_my_lifetime_mined_coins() from public, anon;
grant execute on function public.get_my_lifetime_mined_coins() to authenticated;
