-- Privacy-safe Creator Growth aggregate. Raw commission rows remain protected
-- by their existing RLS policies; callers receive only public identity fields
-- and delivered, non-reversed commerce performance.
create or replace function public.get_creator_growth_leaderboard(p_limit integer default 25)
returns table (
  creator_id uuid,
  display_name text,
  username text,
  avatar_path text,
  attributed_sales_minor bigint,
  successful_orders bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.creator_commerce_access access
    join auth.users auth_identity on auth_identity.id = access.user_id
    where access.user_id = auth.uid()
      and access.creator_status = 'approved'
      and auth_identity.deleted_at is null
      and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
      and coalesce(auth_identity.is_anonymous, false) = false
  ) then
    raise exception 'Approved Creator access required.' using errcode = '42501';
  end if;

  return query
  select
    access.user_id as creator_id,
    coalesce(nullif(btrim(profile.display_name), ''), profile.username, 'Creator') as display_name,
    coalesce(profile.username, left(access.user_id::text, 8)) as username,
    profile.avatar_path,
    coalesce(sum(
      case when commerce_order.status = 'delivered'
        and commission.status in ('confirmed', 'eligible', 'payable', 'paid')
      then commission.eligible_item_minor else 0 end
    ), 0)::bigint as attributed_sales_minor,
    count(distinct commission.order_id) filter (
      where commerce_order.status = 'delivered'
        and commission.status in ('confirmed', 'eligible', 'payable', 'paid')
    )::bigint as successful_orders
  from public.creator_commerce_access access
  join public.profiles profile on profile.id = access.user_id
  join auth.users auth_identity on auth_identity.id = access.user_id
  left join public.creator_commissions commission on commission.creator_id = access.user_id
  left join public.orders commerce_order on commerce_order.id = commission.order_id
  where access.creator_status = 'approved'
    and auth_identity.deleted_at is null
    and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
    and coalesce(auth_identity.is_anonymous, false) = false
  group by access.user_id, profile.display_name, profile.username, profile.avatar_path
  order by attributed_sales_minor desc, successful_orders desc, coalesce(profile.username, ''), access.user_id
  limit greatest(1, least(coalesce(p_limit, 25), 100));
end;
$function$;

revoke all on function public.get_creator_growth_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.get_creator_growth_leaderboard(integer) to authenticated;

comment on function public.get_creator_growth_leaderboard(integer) is
  'Privacy-safe leaderboard of every active approved Creator, including zero-activity rows, ranked by delivered non-reversed attributed Orders. Does not expose individual commissions.';

notify pgrst, 'reload schema';
