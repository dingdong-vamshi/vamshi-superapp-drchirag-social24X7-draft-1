-- Directory and conversation bridge for the already-authoritative business
-- conversation. It deliberately exposes only approved counterparts and keeps
-- the one-storefront/one-creator conversation identity intact.
create or replace function public.search_creator_seller_counterparties(
  p_role text,
  p_query text default '',
  p_limit integer default 20
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  storefront_id uuid,
  storefront_name text,
  storefront_slug text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  viewer uuid := auth.uid();
  query_text text := lower(btrim(coalesce(p_query, '')));
  safe_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_role = 'seller' then
    if not exists (
      select 1
      from public.creator_commerce_access access
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = viewer
        and access.creator_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Approved Creator access required.' using errcode = '42501';
    end if;

    return query
    select
      storefront.owner_id,
      coalesce(nullif(btrim(profile.display_name), ''), profile.username, 'Seller'),
      coalesce(profile.username, left(storefront.owner_id::text, 8)),
      storefront.id,
      storefront.name,
      storefront.slug
    from public.storefronts storefront
    join public.creator_commerce_access access on access.user_id = storefront.owner_id
    join public.profiles profile on profile.id = storefront.owner_id
    join auth.users auth_identity on auth_identity.id = storefront.owner_id
    where storefront.owner_id <> viewer
      and storefront.active = true
      and storefront.verification_status = 'approved'
      and access.seller_status = 'approved'
      and auth_identity.deleted_at is null
      and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
      and coalesce(auth_identity.is_anonymous, false) = false
      and (
        query_text = ''
        or lower(storefront.name) like '%' || query_text || '%'
        or lower(coalesce(profile.display_name, '')) like '%' || query_text || '%'
        or lower(coalesce(profile.username, '')) like '%' || query_text || '%'
      )
    order by lower(storefront.name), storefront.id
    limit safe_limit;
    return;
  end if;

  if p_role = 'creator' then
    if not exists (
      select 1
      from public.creator_commerce_access access
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = viewer
        and access.seller_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Approved Seller access required.' using errcode = '42501';
    end if;

    return query
    select
      profile.id,
      coalesce(nullif(btrim(profile.display_name), ''), profile.username, 'Creator'),
      coalesce(profile.username, left(profile.id::text, 8)),
      null::uuid,
      null::text,
      null::text
    from public.creator_commerce_access access
    join public.profiles profile on profile.id = access.user_id
    join auth.users auth_identity on auth_identity.id = access.user_id
    where access.user_id <> viewer
      and access.creator_status = 'approved'
      and auth_identity.deleted_at is null
      and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
      and coalesce(auth_identity.is_anonymous, false) = false
      and (
        query_text = ''
        or lower(coalesce(profile.display_name, '')) like '%' || query_text || '%'
        or lower(coalesce(profile.username, '')) like '%' || query_text || '%'
      )
    order by lower(coalesce(profile.display_name, profile.username, '')), profile.id
    limit safe_limit;
    return;
  end if;

  raise exception 'Unsupported counterpart role.' using errcode = '22023';
end;
$function$;

create or replace function public.open_creator_seller_conversation(
  target_user uuid,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  viewer uuid := auth.uid();
  conversation_storefront uuid;
  customer_id uuid;
  seller_id uuid;
  conversation_id uuid;
begin
  if viewer is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if target_user is null or target_user = viewer then
    raise exception 'Choose another approved account.' using errcode = '22023';
  end if;

  if p_role = 'seller' then
    if not exists (
      select 1
      from public.creator_commerce_access access
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = viewer
        and access.creator_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Approved Creator access required.' using errcode = '42501';
    end if;

    select storefront.id, storefront.owner_id
    into conversation_storefront, seller_id
    from public.storefronts storefront
    join public.creator_commerce_access access on access.user_id = storefront.owner_id
    join auth.users auth_identity on auth_identity.id = storefront.owner_id
    where storefront.owner_id = target_user
      and storefront.active = true
      and storefront.verification_status = 'approved'
      and access.seller_status = 'approved'
      and auth_identity.deleted_at is null
      and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
      and coalesce(auth_identity.is_anonymous, false) = false
    order by storefront.created_at, storefront.id
    limit 1;
    customer_id := viewer;
  elsif p_role = 'creator' then
    if not exists (
      select 1
      from public.creator_commerce_access access
      join public.storefronts storefront on storefront.owner_id = access.user_id
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = viewer
        and access.seller_status = 'approved'
        and storefront.active = true
        and storefront.verification_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Approved Seller access required.' using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.creator_commerce_access access
      join auth.users auth_identity on auth_identity.id = access.user_id
      where access.user_id = target_user
        and access.creator_status = 'approved'
        and auth_identity.deleted_at is null
        and (auth_identity.banned_until is null or auth_identity.banned_until <= now())
        and coalesce(auth_identity.is_anonymous, false) = false
    ) then
      raise exception 'Creator is unavailable.' using errcode = '42501';
    end if;
    select storefront.id
    into conversation_storefront
    from public.storefronts storefront
    where storefront.owner_id = viewer
      and storefront.active = true
      and storefront.verification_status = 'approved'
    order by storefront.created_at, storefront.id
    limit 1;
    seller_id := viewer;
    customer_id := target_user;
  else
    raise exception 'Unsupported counterpart role.' using errcode = '22023';
  end if;

  if conversation_storefront is null or seller_id is null then
    raise exception 'Approved Seller storefront is unavailable.' using errcode = '42501';
  end if;

  insert into public.conversations (kind, storefront_id, business_customer_id, created_by)
  values ('business', conversation_storefront, customer_id, viewer)
  on conflict (storefront_id, business_customer_id) where kind = 'business'
  do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (conversation_id, customer_id), (conversation_id, seller_id)
  on conflict do nothing;

  return conversation_id;
end;
$function$;

revoke all on function public.search_creator_seller_counterparties(text, text, integer) from public, anon, authenticated;
revoke all on function public.open_creator_seller_conversation(uuid, text) from public, anon, authenticated;
grant execute on function public.search_creator_seller_counterparties(text, text, integer) to authenticated;
grant execute on function public.open_creator_seller_conversation(uuid, text) to authenticated;

comment on function public.search_creator_seller_counterparties(text, text, integer) is
  'Directory of approved Creator/Seller counterparts only; excludes incomplete, rejected and random profiles.';
comment on function public.open_creator_seller_conversation(uuid, text) is
  'Creates or reuses the one authoritative business conversation for an explicitly selected approved Seller or Creator counterparty.';

notify pgrst, 'reload schema';
