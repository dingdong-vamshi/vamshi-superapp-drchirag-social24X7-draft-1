-- Feature upgrade round: authoritative wallet network stats, per-conversation
-- wallpaper choice, and seller-owned return resolution.

create or replace function public.get_my_lifetime_mined_coins()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(amount_microunits), 0)::bigint
  from public.reward_ledger
  where user_id = auth.uid() and entry_type = 'session_reward';
$$;

revoke all on function public.get_my_lifetime_mined_coins() from public, anon;
grant execute on function public.get_my_lifetime_mined_coins() to authenticated;

create or replace function public.get_my_reward_network()
returns table(total_friends integer, active_friends integer, bonus_bps integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  friend_bps integer := 0;
  cap_bps integer := 0;
begin
  if viewer is null then raise exception 'Authentication required.'; end if;
  select coalesce(friend_bonus_bps, 0), coalesce(max_friend_bonus_bps, 0)
    into friend_bps, cap_bps from public.reward_config limit 1;
  return query
  with circle as (
    select case when requester_id = viewer then recipient_id else requester_id end as user_id
    from public.connection_requests
    where status = 'accepted' and (requester_id = viewer or recipient_id = viewer)
  ), activity as (
    select c.user_id, exists(
      select 1 from public.reward_sessions s
      where s.user_id = c.user_id and s.status = 'active' and s.ends_at > clock_timestamp()
    ) as is_active from circle c
  ), totals as (
    select count(*)::integer as friends, count(*) filter (where is_active)::integer as active from activity
  )
  select friends, active,
    least(cap_bps, active * friend_bps + floor(friend_bps * active::numeric / greatest(friends, 1))::integer)
  from totals;
end;
$$;

revoke all on function public.get_my_reward_network() from public, anon;
grant execute on function public.get_my_reward_network() to authenticated;

alter table public.chat_conversation_settings
  add column if not exists wallpaper_style text not null default 'neutral';

alter table public.chat_conversation_settings
  drop constraint if exists chat_conversation_settings_wallpaper_check;
alter table public.chat_conversation_settings
  add constraint chat_conversation_settings_wallpaper_check
  check (wallpaper_style in ('neutral', 'sky', 'forest', 'warm', 'paper'));

create or replace function public.set_chat_wallpaper(target_conversation uuid, target_wallpaper text)
returns public.chat_conversation_settings
language plpgsql
security definer
set search_path = ''
as $$
declare viewer uuid := auth.uid(); result public.chat_conversation_settings;
begin
  if viewer is null or not public.is_conversation_member(target_conversation) then
    raise exception 'Conversation access denied.';
  end if;
  if target_wallpaper not in ('neutral', 'sky', 'forest', 'warm', 'paper') then
    raise exception 'Unsupported chat wallpaper.';
  end if;
  insert into public.chat_conversation_settings(conversation_id, wallpaper_style, updated_by)
  values(target_conversation, target_wallpaper, viewer)
  on conflict(conversation_id) do update set
    wallpaper_style = excluded.wallpaper_style,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.set_chat_wallpaper(uuid, text) from public, anon;
grant execute on function public.set_chat_wallpaper(uuid, text) to authenticated;

-- Returns are resolved by the seller in the buyer/seller business conversation.
-- Retain the historical admin function for audit compatibility but remove its
-- callable authenticated endpoint so it cannot become a second decision path.
revoke execute on function public.admin_review_creator_commerce_return(uuid, text, text) from authenticated;
